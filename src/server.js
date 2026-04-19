import express from "express";
import axios from "axios";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";

import config from "./configs/index.js";
import { mongoService } from "./services/mongoService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* =========================
 * Utils
 * ========================= */
class TextUtils {
  static normalizeDocId(docId) {
    return String(docId ?? "").trim();
  }

  static sanitizeFileName(name = "book") {
    return String(name || "book")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  static toAsciiFileName(name = "file") {
    return String(name)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/[:"]/g, "_")
      .replace(/[<>/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  static normalizeText(text = "") {
    return String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  static buildContentDisposition(fileName) {
    const asciiName = TextUtils.toAsciiFileName(fileName) || "download";
    const utf8Name = encodeURIComponent(fileName);
    return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
  }
}

/* =========================
 * File type detector
 * ========================= */
class FileTypeDetector {
  constructor(fileTypeConfig) {
    this.fileTypeConfig = fileTypeConfig;
  }

  fromBuffer(buffer) {
    const FILE_TYPE = this.fileTypeConfig;

    if (!buffer || buffer.length < 8) {
      return FILE_TYPE.bin;
    }

    const header4 = buffer.slice(0, 4).toString("hex").toUpperCase();
    const header8 = buffer.slice(0, 8).toString("hex").toUpperCase();

    if (header4 === "25504446") {
      return FILE_TYPE.pdf;
    }

    if (header4 === "504B0304" || header4 === "504B0506" || header4 === "504B0708") {
      const probeText = buffer.slice(0, 65536).toString("utf8");

      if (probeText.includes("word/")) return FILE_TYPE.docx;
      if (probeText.includes("xl/")) return FILE_TYPE.xlsx;
      if (probeText.includes("ppt/")) return FILE_TYPE.pptx;

      return FILE_TYPE.zip;
    }

    if (header8.startsWith("D0CF11E0A1B11AE1")) {
      return FILE_TYPE.bin;
    }

    return FILE_TYPE.bin;
  }

  fromName(fileName = "") {
    const value = String(fileName).toLowerCase();
    const FILE_TYPE = this.fileTypeConfig;

    if (value.endsWith(".pdf")) return FILE_TYPE.pdf;
    if (value.endsWith(".docx")) return FILE_TYPE.docx;
    if (value.endsWith(".doc")) return FILE_TYPE.doc;
    if (value.endsWith(".xlsx")) return FILE_TYPE.xlsx;
    if (value.endsWith(".xls")) return FILE_TYPE.xls;
    if (value.endsWith(".pptx")) return FILE_TYPE.pptx;
    if (value.endsWith(".ppt")) return FILE_TYPE.ppt;

    return FILE_TYPE.bin;
  }
}

/* =========================
 * HTTP client
 * ========================= */
class HttpClient {
  constructor(defaultHeaders = {}) {
    this.defaultHeaders = defaultHeaders;
    this.httpsAgent = new https.Agent({
      rejectUnauthorized: false,
    });
  }

  async getText(url, headers = {}) {
    const response = await axios.get(url, {
      headers: {
        ...this.defaultHeaders,
        ...headers,
      },
      httpsAgent: this.httpsAgent,
      timeout: 30000,
      responseType: "text",
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      const preview = String(response.data || "").slice(0, 300);
      throw new Error(`Lỗi kết nối: ${response.status} | ${preview}`);
    }

    return response.data;
  }

  async getBuffer(url, headers = {}) {
    const response = await axios.get(url, {
      headers: {
        ...this.defaultHeaders,
        ...headers,
      },
      httpsAgent: this.httpsAgent,
      timeout: 30000,
      responseType: "arraybuffer",
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Lỗi tải file: ${response.status}`);
    }

    return Buffer.from(response.data);
  }
}

/* =========================
 * Retry helper
 * ========================= */
class RetryService {
  static async execute(fn, times = 2, delayMs = 1000) {
    let lastError;

    for (let i = 0; i < times; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (i < times - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }

    throw lastError;
  }
}

/* =========================
 * Book file service
 * ========================= */
class BookFileService {
  constructor({ httpClient, fileTypeDetector, appConfig }) {
    this.httpClient = httpClient;
    this.fileTypeDetector = fileTypeDetector;
    this.config = appConfig;
  }

  extractPayloadText(rawText) {
    let payloadText = rawText;

    if (typeof rawText === "string") {
      try {
        const parsed = JSON.parse(rawText);

        if (typeof parsed === "string") {
          payloadText = parsed;
        } else if (typeof parsed?.dirtyData === "string") {
          payloadText = parsed.dirtyData;
        } else if (typeof parsed?.data === "string") {
          payloadText = parsed.data;
        }
      } catch {
        payloadText = rawText;
      }
    } else if (typeof rawText?.dirtyData === "string") {
      payloadText = rawText.dirtyData;
    } else if (typeof rawText?.data === "string") {
      payloadText = rawText.data;
    }

    return String(payloadText || "").trim();
  }

  cleanBase64Payload(payloadText) {
    let text = String(payloadText || "").trim();
    if (!text) return "";

    text = text.replace(this.config.regex, "");
    return text.trim();
  }

  getPreferredFileType(book) {
    const type = String(book.fileType || "")
      .toLowerCase()
      .trim();
    if (type) return type;

    const detected = this.fileTypeDetector.fromName(String(book.fileName || ""));
    return detected.ext;
  }

  getPreferredDetectedType(book) {
    return this.fileTypeDetector.fromName(`${book.fileName || "file"}.${book.fileType || ""}`);
  }

  isPdfBook(book) {
    return this.getPreferredFileType(book) === "pdf";
  }

  buildDownloadUrlFromBook(book) {
    const { date, user, fileName, fileType } = book;

    if (!date || !user || !fileName || !fileType) {
      throw new Error("Thiếu thông tin để dựng link download");
    }

    const [day, month, year] = String(date)
      .split("/")
      .map((part) => part.trim());

    if (!day || !month || !year) {
      throw new Error("Định dạng ngày không hợp lệ");
    }

    const formattedDate = `${year}${month}${day}`;
    const baseFileUrl = `${this.config.url1}/${year}/${formattedDate}/${this.config.school}/${user}/${fileName}.${fileType}`;

    return `${this.config.url3}?file=${encodeURIComponent(baseFileUrl)}`;
  }

  async fetchFileByLoadpdf2(book) {
    const normalizedDocId = TextUtils.normalizeDocId(book.docId);
    const normalizedHash = String(book.hash || "").trim();

    if (!normalizedDocId || !normalizedHash) {
      throw new Error("Thiếu docId hoặc hash");
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const url =
      `${this.config.url2}` +
      `?id=${encodeURIComponent(normalizedDocId)}` +
      `&t1=${timestamp}` +
      `&hash=${encodeURIComponent(normalizedHash)}`;

    const rawText = await this.httpClient.getText(url, {
      APP_KEY: normalizedHash,
      Accept: "*/*",
    });

    const payloadText = this.extractPayloadText(rawText);
    const cleanData = this.cleanBase64Payload(payloadText);

    if (!cleanData || cleanData.length < 50) {
      throw new Error("Không lấy được dữ liệu base64 file");
    }

    let buffer;
    try {
      buffer = Buffer.from(cleanData, "base64");
    } catch {
      throw new Error("Decode base64 thất bại");
    }

    if (!buffer || buffer.length < 100) {
      throw new Error("Dữ liệu file không hợp lệ");
    }

    const preferred = this.getPreferredDetectedType(book);
    const detected = this.fileTypeDetector.fromBuffer(buffer);
    const finalType = preferred.ext !== "bin" ? preferred : detected;

    return {
      buffer,
      ext: finalType.ext,
      mime: finalType.mime,
      source: "loadpdf2",
    };
  }

  async fetchFileByDownloadUrl(book) {
    const downloadUrl = this.buildDownloadUrlFromBook(book);
    const buffer = await this.httpClient.getBuffer(downloadUrl);

    if (!buffer || buffer.length < 100) {
      throw new Error("File tải xuống không hợp lệ");
    }

    const preferred = this.getPreferredDetectedType(book);
    const detected = this.fileTypeDetector.fromBuffer(buffer);
    const finalType = preferred.ext !== "bin" ? preferred : detected;

    return {
      buffer,
      ext: finalType.ext,
      mime: finalType.mime,
      source: "download-url",
    };
  }

  async fetchBookFile(book) {
    const firstMethod = () => RetryService.execute(() => this.fetchFileByDownloadUrl(book), 2, 1000);
    const secondMethod = () => RetryService.execute(() => this.fetchFileByLoadpdf2(book), 2, 1000);

    if (this.isPdfBook(book)) {
      try {
        return await firstMethod();
      } catch (error) {
        console.warn("[PDF_METHOD_1_FAILED]", book.docId, error.message);
        return await secondMethod();
      }
    }

    try {
      return await secondMethod();
    } catch (error) {
      console.warn("[NON_PDF_METHOD_2_FAILED]", book.docId, error.message);
      return await firstMethod();
    }
  }
}

/* =========================
 * Controllers
 * ========================= */
class BookController {
  constructor({ mongoService, bookFileService }) {
    this.mongoService = mongoService;
    this.bookFileService = bookFileService;

    this.search = this.search.bind(this);
    this.download = this.download.bind(this);
  }

  async search(req, res) {
    try {
      const { q = "" } = req.query;
      const results = await this.mongoService.search(q);

      return res.json({
        success: true,
        total: results.length,
        results: results.map(({ docId, bookName }) => ({
          docId: TextUtils.normalizeDocId(docId),
          bookName,
        })),
      });
    } catch (error) {
      console.error("[SEARCH_ERROR]", error);
      return res.status(500).json({
        success: false,
        error: "Tìm kiếm thất bại",
      });
    }
  }

  async download(req, res) {
    try {
      const docId = TextUtils.normalizeDocId(req.query.d);

      if (!docId) {
        return res.status(400).json({
          success: false,
          error: "Thiếu tham số d",
        });
      }

      const book = await this.mongoService.getOrThrow(docId);
      const file = await this.bookFileService.fetchBookFile(book);

      const safeName = TextUtils.sanitizeFileName(book.bookName || "book");
      const fileName = `${safeName}.${file.ext}`;

      console.log("[DOWNLOAD_SUCCESS]", {
        docId: book.docId,
        source: file.source,
        ext: file.ext,
      });

      res.setHeader("Content-Type", file.mime);
      res.setHeader("Content-Length", file.buffer.length);
      res.setHeader("Content-Disposition", TextUtils.buildContentDisposition(fileName));

      return res.send(file.buffer);
    } catch (error) {
      // console.error("[DOWNLOAD_ERROR]", error);
      return res.status(500).json({
        success: false,
        error: "Tải file thất bại",
      });
    }
  }
}

/* =========================
 * App server
 * ========================= */
class AppServer {
  constructor() {
    this.app = express();

    this.publicDir = path.join(__dirname, "../public");
    this.httpClient = new HttpClient(config.defaultHeaders);
    this.fileTypeDetector = new FileTypeDetector(config.fileType);

    this.bookFileService = new BookFileService({
      httpClient: this.httpClient,
      fileTypeDetector: this.fileTypeDetector,
      appConfig: {
        url1: config.url1,
        url2: config.url2,
        url3: config.url3,
        school: config.school,
        regex: config.regex,
      },
    });

    this.bookController = new BookController({
      mongoService,
      bookFileService: this.bookFileService,
    });
  }

  setupMiddlewares() {
    this.app.use(express.static(this.publicDir));
  }

  setupRoutes() {
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(this.publicDir, "index.html"));
    });

    this.app.get("/api/search", this.bookController.search);
    this.app.get("/api/download", this.bookController.download);
  }

  setupProcessHandlers() {
    process.on("uncaughtException", (error) => {
      console.error("[UNCAUGHT_EXCEPTION]", error);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("[UNHANDLED_REJECTION]", reason);
    });
  }

  start() {
    this.setupMiddlewares();
    this.setupRoutes();
    this.setupProcessHandlers();

    this.app.use((err, req, res, next) => {
      // console.error("[INTERNAL_ERROR]", err);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
      });
    });

    this.app.listen(config.port, () => {
      console.log(`Server running at ${config.host}:${config.port}`);
    });
  }
}

/* =========================
 * Bootstrap
 * ========================= */
const server = new AppServer();
server.start();
