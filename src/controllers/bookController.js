import { TextUtils } from "../utils/textUtils.js";

function getErrorStatus(error, fallbackStatus = 500) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : fallbackStatus;
}

function getDownloadErrorMessage(statusCode) {
  if (statusCode === 404) return "Không tìm thấy sách";
  if (statusCode === 422) return "Sách thiếu dữ liệu tải";

  return "Tải file thất bại";
}

export class BookController {
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
      console.error("[SEARCH_FAILED]", { query: req.query.q, error: error.message });

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
      const statusCode = getErrorStatus(error);
      console.error("[DOWNLOAD_FAILED]", { docId: req.query.d, statusCode, error: error.message });

      return res.status(statusCode).json({
        success: false,
        error: getDownloadErrorMessage(statusCode),
      });
    }
  }
}
