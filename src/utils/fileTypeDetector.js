export class FileTypeDetector {
  constructor(fileTypeConfig) {
    this.fileTypeConfig = fileTypeConfig;
  }

  fromBuffer(buffer) {
    const FILE_TYPE = this.fileTypeConfig;
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);

    if (!data || data.length < 4) {
      return FILE_TYPE.bin;
    }

    if (this.hasPdfHeader(data)) {
      return FILE_TYPE.pdf;
    }

    if (this.hasZipHeader(data)) {
      const entryNames = this.getZipEntryNames(data);
      const officeType = this.detectOoxmlType(entryNames);

      if (officeType) return officeType;

      return FILE_TYPE.zip;
    }

    if (this.hasOleHeader(data)) {
      const entryNames = this.getOleDirectoryNames(data);
      const officeType = this.detectOleOfficeType(entryNames) || this.detectOleOfficeTypeByKnownStreams(data);

      if (officeType) return officeType;

      return FILE_TYPE.bin;
    }

    return FILE_TYPE.bin;
  }

  hasPdfHeader(buffer) {
    return buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  }

  hasZipHeader(buffer) {
    if (buffer.length < 4) return false;

    const signature = buffer.readUInt32LE(0);
    return signature === 0x04034b50 || signature === 0x06054b50 || signature === 0x08074b50;
  }

  hasOleHeader(buffer) {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from("D0CF11E0A1B11AE1", "hex"));
  }

  getZipEntryNames(buffer) {
    const centralDirectoryNames = this.getZipCentralDirectoryEntryNames(buffer);
    if (centralDirectoryNames.length) return centralDirectoryNames;

    return this.getZipLocalEntryNames(buffer);
  }

  getZipCentralDirectoryEntryNames(buffer) {
    const endOfCentralDirectoryOffset = this.findEndOfCentralDirectoryOffset(buffer);
    if (endOfCentralDirectoryOffset < 0) return [];

    const centralDirectorySize = buffer.readUInt32LE(endOfCentralDirectoryOffset + 12);
    const centralDirectoryOffset = buffer.readUInt32LE(endOfCentralDirectoryOffset + 16);

    if (!centralDirectorySize || centralDirectoryOffset >= buffer.length) return [];

    const names = [];
    let offset = centralDirectoryOffset;
    const end = Math.min(buffer.length, centralDirectoryOffset + centralDirectorySize);

    while (offset + 46 <= end && names.length < 1000) {
      if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraFieldLength = buffer.readUInt16LE(offset + 30);
      const fileCommentLength = buffer.readUInt16LE(offset + 32);
      const fileNameStart = offset + 46;
      const fileNameEnd = fileNameStart + fileNameLength;

      if (fileNameEnd > end) break;

      names.push(buffer.subarray(fileNameStart, fileNameEnd).toString("utf8"));
      offset = fileNameEnd + extraFieldLength + fileCommentLength;
    }

    return names;
  }

  findEndOfCentralDirectoryOffset(buffer) {
    if (buffer.length < 22) return -1;

    const minOffset = Math.max(0, buffer.length - 65557);

    for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) {
        return offset;
      }
    }

    return -1;
  }

  getZipLocalEntryNames(buffer) {
    const names = [];
    let offset = 0;

    while (offset + 30 <= buffer.length && names.length < 1000) {
      if (buffer.readUInt32LE(offset) !== 0x04034b50) {
        const nextOffset = this.findZipLocalHeaderOffset(buffer, offset + 1);
        if (nextOffset < 0) break;
        offset = nextOffset;
        continue;
      }

      const flags = buffer.readUInt16LE(offset + 6);
      const compressedSize = buffer.readUInt32LE(offset + 18);
      const fileNameLength = buffer.readUInt16LE(offset + 26);
      const extraFieldLength = buffer.readUInt16LE(offset + 28);
      const fileNameStart = offset + 30;
      const fileNameEnd = fileNameStart + fileNameLength;
      const dataStart = fileNameEnd + extraFieldLength;

      if (fileNameEnd > buffer.length || dataStart > buffer.length) break;

      names.push(buffer.subarray(fileNameStart, fileNameEnd).toString("utf8"));

      if (flags & 0x08 || compressedSize === 0xffffffff || dataStart + compressedSize > buffer.length) {
        const nextOffset = this.findZipLocalHeaderOffset(buffer, dataStart);
        if (nextOffset < 0) break;
        offset = nextOffset;
      } else {
        offset = dataStart + compressedSize;
      }
    }

    return names;
  }

  findZipLocalHeaderOffset(buffer, startOffset) {
    for (let offset = startOffset; offset + 4 <= buffer.length; offset += 1) {
      if (buffer.readUInt32LE(offset) === 0x04034b50) {
        return offset;
      }
    }

    return -1;
  }

  detectOoxmlType(entryNames) {
    const FILE_TYPE = this.fileTypeConfig;
    const names = entryNames.map((name) => name.replaceAll("\\", "/").toLowerCase());

    if (!names.includes("[content_types].xml")) {
      return null;
    }

    if (names.some((name) => name.startsWith("word/"))) return FILE_TYPE.docx;
    if (names.some((name) => name.startsWith("xl/"))) return FILE_TYPE.xlsx;
    if (names.some((name) => name.startsWith("ppt/"))) return FILE_TYPE.pptx;

    return null;
  }

  getOleDirectoryNames(buffer) {
    if (buffer.length < 512) return [];

    const sectorShift = buffer.readUInt16LE(30);
    const sectorSize = 1 << sectorShift;

    if (sectorSize !== 512 && sectorSize !== 4096) return [];

    const fatSectorCount = buffer.readUInt32LE(44);
    const firstDirectorySector = buffer.readUInt32LE(48);

    if (!fatSectorCount || !this.isUsableOleSector(buffer, sectorSize, firstDirectorySector)) return [];

    const difat = this.getOleDifatSectorIds(buffer, sectorSize, fatSectorCount);
    const fat = this.getOleFat(buffer, sectorSize, difat, fatSectorCount);
    const directoryBuffer = this.readOleSectorChain(buffer, sectorSize, firstDirectorySector, fat);

    return this.parseOleDirectoryEntries(directoryBuffer);
  }

  getOleDifatSectorIds(buffer, sectorSize, fatSectorCount) {
    const ids = [];

    for (let index = 0; index < 109 && ids.length < fatSectorCount; index += 1) {
      const sectorId = buffer.readUInt32LE(76 + index * 4);
      if (this.isUsableOleSector(buffer, sectorSize, sectorId)) {
        ids.push(sectorId);
      }
    }

    let nextDifatSector = buffer.readUInt32LE(68);
    const difatSectorCount = buffer.readUInt32LE(72);

    for (let index = 0; index < difatSectorCount && ids.length < fatSectorCount; index += 1) {
      if (!this.isUsableOleSector(buffer, sectorSize, nextDifatSector)) break;

      const offset = this.getOleSectorOffset(nextDifatSector, sectorSize);
      const entriesPerSector = sectorSize / 4 - 1;

      for (let entry = 0; entry < entriesPerSector && ids.length < fatSectorCount; entry += 1) {
        const sectorId = buffer.readUInt32LE(offset + entry * 4);
        if (this.isUsableOleSector(buffer, sectorSize, sectorId)) {
          ids.push(sectorId);
        }
      }

      nextDifatSector = buffer.readUInt32LE(offset + entriesPerSector * 4);
    }

    return ids;
  }

  getOleFat(buffer, sectorSize, difat, fatSectorCount) {
    const fat = [];

    for (const sectorId of difat.slice(0, fatSectorCount)) {
      const offset = this.getOleSectorOffset(sectorId, sectorSize);

      for (let entryOffset = offset; entryOffset + 4 <= offset + sectorSize; entryOffset += 4) {
        fat.push(buffer.readUInt32LE(entryOffset));
      }
    }

    return fat;
  }

  readOleSectorChain(buffer, sectorSize, firstSectorId, fat) {
    const sectors = [];
    const seen = new Set();
    let sectorId = firstSectorId;

    while (this.isUsableOleSector(buffer, sectorSize, sectorId) && !seen.has(sectorId) && sectors.length < 4096) {
      seen.add(sectorId);

      const offset = this.getOleSectorOffset(sectorId, sectorSize);
      sectors.push(buffer.subarray(offset, offset + sectorSize));

      const nextSectorId = fat[sectorId];
      if (!this.isUsableOleSector(buffer, sectorSize, nextSectorId)) break;

      sectorId = nextSectorId;
    }

    return Buffer.concat(sectors);
  }

  parseOleDirectoryEntries(directoryBuffer) {
    const names = [];

    for (let offset = 0; offset + 128 <= directoryBuffer.length; offset += 128) {
      const nameLength = directoryBuffer.readUInt16LE(offset + 64);
      const objectType = directoryBuffer[offset + 66];

      if (!objectType || nameLength < 2 || nameLength > 64) continue;

      const name = directoryBuffer
        .subarray(offset, offset + nameLength - 2)
        .toString("utf16le")
        .trim();

      if (name) names.push(name);
    }

    return names;
  }

  detectOleOfficeType(entryNames) {
    const FILE_TYPE = this.fileTypeConfig;
    const names = entryNames.map((name) => name.toLowerCase());

    if (names.includes("worddocument")) return FILE_TYPE.doc;
    if (names.includes("workbook") || names.includes("book")) return FILE_TYPE.xls;
    if (names.includes("powerpoint document")) return FILE_TYPE.ppt;

    return null;
  }

  detectOleOfficeTypeByKnownStreams(buffer) {
    const FILE_TYPE = this.fileTypeConfig;
    const sample = buffer.subarray(0, Math.min(buffer.length, 4 * 1024 * 1024));

    if (this.includesText(sample, "WordDocument")) return FILE_TYPE.doc;
    if (this.includesText(sample, "Workbook")) return FILE_TYPE.xls;
    if (this.includesText(sample, "PowerPoint Document")) return FILE_TYPE.ppt;

    return null;
  }

  includesText(buffer, text) {
    return buffer.indexOf(Buffer.from(text, "latin1")) >= 0 || buffer.indexOf(Buffer.from(text, "utf16le")) >= 0;
  }

  getOleSectorOffset(sectorId, sectorSize) {
    return (sectorId + 1) * sectorSize;
  }

  isUsableOleSector(buffer, sectorSize, sectorId) {
    if (!Number.isInteger(sectorId) || sectorId >= 0xfffffff0) return false;

    const offset = this.getOleSectorOffset(sectorId, sectorSize);
    return offset >= 512 && offset + sectorSize <= buffer.length;
  }

  fromName(fileName = "") {
    const value = String(fileName).split(/[?#]/)[0].toLowerCase();
    const FILE_TYPE = this.fileTypeConfig;

    if (value.endsWith(".pdf")) return FILE_TYPE.pdf;
    if (value.endsWith(".docx")) return FILE_TYPE.docx;
    if (value.endsWith(".doc")) return FILE_TYPE.doc;
    if (value.endsWith(".xlsx")) return FILE_TYPE.xlsx;
    if (value.endsWith(".xls")) return FILE_TYPE.xls;
    if (value.endsWith(".pptx")) return FILE_TYPE.pptx;
    if (value.endsWith(".ppt")) return FILE_TYPE.ppt;
    if (value.endsWith(".zip")) return FILE_TYPE.zip;

    return FILE_TYPE.bin;
  }
}
