import assert from "node:assert/strict";
import test from "node:test";

import { FILE_TYPE } from "../src/configs/_constant.js";
import { FileTypeDetector } from "../src/utils/fileTypeDetector.js";

const detector = new FileTypeDetector(FILE_TYPE);

function localZip(...names) {
  return Buffer.concat(
    names.map((name) => {
      const nameBuffer = Buffer.from(name, "utf8");
      const header = Buffer.alloc(30);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(nameBuffer.length, 26);

      return Buffer.concat([header, nameBuffer]);
    }),
  );
}

function oleWithStream(name) {
  const sectorSize = 512;
  const header = Buffer.alloc(sectorSize, 0);
  Buffer.from("D0CF11E0A1B11AE1", "hex").copy(header, 0);
  header.writeUInt16LE(0xfffe, 0x1c);
  header.writeUInt16LE(9, 0x1e);
  header.writeUInt16LE(6, 0x20);
  header.writeUInt32LE(1, 0x2c);
  header.writeUInt32LE(1, 0x30);
  header.writeUInt32LE(0xffffffff, 0x3c);
  header.writeUInt32LE(0xffffffff, 0x44);
  header.writeUInt32LE(0, 0x48);
  header.writeUInt32LE(0, 0x4c);

  const fat = Buffer.alloc(sectorSize, 0xff);
  fat.writeUInt32LE(0xfffffffd, 0);
  fat.writeUInt32LE(0xfffffffe, 4);

  const directory = Buffer.alloc(sectorSize, 0);
  const writeEntry = (index, entryName, type) => {
    const offset = index * 128;
    const encodedName = Buffer.from(`${entryName}\0`, "utf16le");
    encodedName.copy(directory, offset);
    directory.writeUInt16LE(encodedName.length, offset + 64);
    directory[offset + 66] = type;
  };

  writeEntry(0, "Root Entry", 5);
  writeEntry(1, name, 2);

  return Buffer.concat([header, fat, directory]);
}

test("detects file type from known headers and container entries", () => {
  const cases = [
    ["short buffer", Buffer.from([1, 2, 3]), "bin"],
    ["pdf", Buffer.from("%PDF-1.7\n"), "pdf"],
    ["plain zip", localZip("plain.txt"), "zip"],
    ["docx", localZip("[Content_Types].xml", "word/document.xml"), "docx"],
    ["xlsx", localZip("[Content_Types].xml", "xl/workbook.xml"), "xlsx"],
    ["pptx", localZip("[Content_Types].xml", "ppt/presentation.xml"), "pptx"],
    ["doc", oleWithStream("WordDocument"), "doc"],
    ["xls workbook", oleWithStream("Workbook"), "xls"],
    ["xls book", oleWithStream("Book"), "xls"],
    ["ppt", oleWithStream("PowerPoint Document"), "ppt"],
    ["unknown OLE", oleWithStream("UnknownStream"), "bin"],
  ];

  for (const [name, buffer, expected] of cases) {
    assert.equal(detector.fromBuffer(buffer).ext, expected, name);
  }
});

test("detects file type from file name", () => {
  assert.equal(detector.fromName("file.pdf?download=1").ext, "pdf");
  assert.equal(detector.fromName("file.zip").ext, "zip");
  assert.equal(detector.fromName("file.unknown").ext, "bin");
});
