import assert from "node:assert/strict";
import test from "node:test";

import { FILE_TYPE } from "../src/configs/_constant.js";
import { BookFileService } from "../src/services/bookFileService.js";
import { FileTypeDetector } from "../src/utils/fileTypeDetector.js";

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

function createService() {
  return new BookFileService({
    httpClient: {},
    fileTypeDetector: new FileTypeDetector(FILE_TYPE),
    appConfig: {
      regex: /^#apd/i,
      url1: "https://example.test/files",
      url2: "https://example.test/loadpdf2",
      url3: "https://example.test/download",
      school: "apd",
    },
    logger: {
      warn() {},
    },
  });
}

test("uses detected file type when header conflicts with metadata", () => {
  const service = createService();
  const book = { docId: "1", fileName: "book", fileType: "pdf" };
  const docxBuffer = Buffer.concat([localZip("[Content_Types].xml", "word/document.xml"), Buffer.alloc(128)]);

  assert.equal(service.resolveFileType(book, docxBuffer).ext, "docx");
});

test("falls back to metadata when header is unknown", () => {
  const service = createService();
  const book = { docId: "1", fileName: "book", fileType: "pdf" };
  const unknownBuffer = Buffer.alloc(128);

  assert.equal(service.resolveFileType(book, unknownBuffer).ext, "pdf");
});
