import { TextUtils } from "../utils/textUtils.js";
import { RetryService } from "../utils/retryService.js";

export class BookFileService {
  constructor({ httpClient, fileTypeDetector, appConfig, logger = console }) {
    this.httpClient = httpClient;
    this.fileTypeDetector = fileTypeDetector;
    this.config = appConfig;
    this.logger = logger;
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
    const text = String(payloadText || "").trim();
    if (!text) return "";

    return text.replace(this.config.regex, "").trim();
  }

  getPreferredDetectedType(book) {
    return this.fileTypeDetector.fromName(`${book.fileName || "file"}.${book.fileType || ""}`);
  }

  resolveFileType(book, buffer) {
    const preferred = this.getPreferredDetectedType(book);
    const detected = this.fileTypeDetector.fromBuffer(buffer);

    if (detected.ext !== "bin") {
      if (preferred.ext !== "bin" && preferred.ext !== detected.ext) {
        this.logger.warn("[FILE_TYPE_MISMATCH]", {
          docId: book.docId,
          preferred: preferred.ext,
          detected: detected.ext,
        });
      }

      return detected;
    }

    return preferred;
  }

  buildFileResult(book, buffer, source) {
    if (!buffer || buffer.length < 100) {
      throw new Error("Downloaded file is too small or empty");
    }

    const fileType = this.resolveFileType(book, buffer);

    return {
      buffer,
      ext: fileType.ext,
      mime: fileType.mime,
      source,
    };
  }

  buildDownloadUrlFromBook(book) {
    const { date, user, fileName, fileType } = book;

    if (!date || !user || !fileName || !fileType) {
      throw new Error("Book is missing download URL metadata");
    }

    const [day, month, year] = String(date)
      .split("/")
      .map((part) => part.trim());

    if (!day || !month || !year || !/^\d{2}$/.test(day) || !/^\d{2}$/.test(month) || !/^\d{4}$/.test(year)) {
      throw new Error(`Invalid book date format: ${date}`);
    }

    const formattedDate = `${year}${month}${day}`;
    const baseFileUrl = `${this.config.url1}/${year}/${formattedDate}/${this.config.school}/${user}/${fileName}.${fileType}`;
    return `${this.config.url3}?file=${encodeURIComponent(baseFileUrl)}`;
  }

  async fetchFileByLoadpdf2(book) {
    const normalizedDocId = TextUtils.normalizeDocId(book.docId);
    const normalizedHash = String(book.hash || "").trim();

    if (!normalizedDocId || !normalizedHash) {
      throw new Error("Book is missing docId or hash");
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
      throw new Error("Base64 file payload is empty or too short");
    }

    const buffer = Buffer.from(cleanData, "base64");
    return this.buildFileResult(book, buffer, "loadpdf2");
  }

  async fetchFileByDownloadUrl(book) {
    const downloadUrl = this.buildDownloadUrlFromBook(book);
    const buffer = await this.httpClient.getBuffer(downloadUrl);

    return this.buildFileResult(book, buffer, "download-url");
  }

  async fetchBookFile(book) {
    const firstMethod = () => RetryService.execute(() => this.fetchFileByDownloadUrl(book), 2, 1000);
    const secondMethod = () => RetryService.execute(() => this.fetchFileByLoadpdf2(book), 2, 1000);

    try {
      return await firstMethod();
    } catch (error) {
      this.logger.warn("[DOWNLOAD_URL_FAILED]", { docId: book.docId, error: error.message });
      return secondMethod();
    }
  }
}
