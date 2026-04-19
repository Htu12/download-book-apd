import { MongoClient } from "mongodb";
import config from "../configs/index.js";

const client = new MongoClient(config.mongoUri);
const DB = client.db(config.dbName);

/** @type {import("mongodb").Collection} */
export const booksCol = DB.collection("books");

// ── Indexes ────────────────────────────────────────────────────────────────
await booksCol.createIndex({ docId: 1 }, { unique: true });
await booksCol.createIndex({ bookName: 1 });
await booksCol.createIndex({ bookName: "text", fileName: "text" }, { weights: { bookName: 10, fileName: 5 } });

// ── CRUD ───────────────────────────────────────────────────────────────────
export const mongoService = {
  /** Tìm kiếm sách bằng full-text search của MongoDB */
  async search(query) {
    if (!query?.trim()) return [];

    const words = query
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "d")
      .replace(/[^a-z0-9\s]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    if (!words.length) return [];

    // Tìm chính xác theo regex (ưu tiên cao nhất)
    const exact = await booksCol
      .find({ docId: { $exists: true } })
      .map((b) => ({ ...b, _exact: b.bookName?.toLowerCase().includes(query.toLowerCase()) }))
      .toArray();

    const exactMatch = exact.filter((b) => b._exact);

    // Word search
    const wordFilter = {
      $and: words.map((w) => ({
        $or: [{ bookName: { $regex: w, $options: "i" } }, { fileName: { $regex: w, $options: "i" } }],
      })),
    };

    const cursor = booksCol.find(wordFilter).sort({ bookName: 1 }).limit(50);
    const results = await cursor.toArray();

    // Merge: exact match lên đầu, loại trùng docId
    const seen = new Set(exactMatch.map((b) => b.docId));
    const rest = results.filter((b) => !seen.has(b.docId));

    return [...exactMatch, ...rest].map(({ _exact, ...b }) => b);
  },

  /** Tìm 1 sách theo docId */
  async findByDocId(docId) {
    return booksCol.findOne({ docId: String(docId).trim() });
  },

  /** Tìm hoặc throw */
  async getOrThrow(docId) {
    const book = await this.findByDocId(docId);
    if (!book) throw new Error(`Không tìm thấy sách với docId=${docId}`);
    if (!book.hash) throw new Error(`Sách docId=${docId} không có hash`);
    return book;
  },

  /** Insert 1 sách, ignore nếu trùng docId */
  async upsertOne(book) {
    return booksCol.updateOne({ docId: book.docId }, { $set: { ...book, updatedAt: new Date() } }, { upsert: true });
  },

  /** Insert nhiều sách (bulk upsert) */
  async upsertMany(books) {
    if (!books?.length) return;
    const ops = books.map((b) => ({
      updateOne: {
        filter: { docId: b.docId },
        update: { $set: { ...b, updatedAt: new Date() } },
        upsert: true,
      },
    }));
    return booksCol.bulkWrite(ops, { ordered: false });
  },

  /** Đếm tổng số sách */
  async count() {
    return booksCol.countDocuments();
  },
};
