import { MongoClient } from "mongodb";

import config from "../configs/index.js";

const DEFAULT_LIMIT = 50;

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSearchWords(query) {
  return String(query)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .replace(/[^a-z0-9\s]/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function mergeByDocId(...groups) {
  const seen = new Set();
  const merged = [];

  for (const group of groups) {
    for (const book of group) {
      const docId = String(book.docId || "");
      if (!docId || seen.has(docId)) continue;

      seen.add(docId);
      merged.push(book);
    }
  }

  return merged;
}

export function createMongoService({
  mongoUri = config.mongoUri,
  dbName = config.dbName,
  collectionName = "books",
} = {}) {
  const client = new MongoClient(mongoUri);
  const db = client.db(dbName);
  const booksCol = db.collection(collectionName);

  let connectPromise = null;

  async function ensureConnected() {
    if (!connectPromise) {
      connectPromise = (async () => {
        await client.connect();
        await booksCol.createIndex({ docId: 1 }, { unique: true });
        await booksCol.createIndex({ bookName: 1 });
        await booksCol.createIndex({ bookName: "text", fileName: "text" }, { weights: { bookName: 10, fileName: 5 } });
      })().catch((error) => {
        connectPromise = null;
        throw error;
      });
    }

    return connectPromise;
  }

  return {
    booksCol,

    async connect() {
      await ensureConnected();
    },

    async close() {
      await client.close();
      connectPromise = null;
    },

    async search(query) {
      await ensureConnected();

      const trimmedQuery = String(query || "").trim();
      if (!trimmedQuery) return [];

      const exactRegex = new RegExp(escapeRegex(trimmedQuery), "i");
      const exactMatch = await booksCol.find({ bookName: exactRegex }).sort({ bookName: 1 }).limit(DEFAULT_LIMIT).toArray();

      let textResults = [];
      try {
        textResults = await booksCol
          .find(
            { $text: { $search: trimmedQuery } },
            { projection: { score: { $meta: "textScore" }, docId: 1, bookName: 1, fileName: 1 } },
          )
          .sort({ score: { $meta: "textScore" }, bookName: 1 })
          .limit(DEFAULT_LIMIT)
          .toArray();
      } catch (error) {
        console.warn("[MONGO_TEXT_SEARCH_FAILED]", error.message);
      }

      const words = normalizeSearchWords(trimmedQuery);
      const wordResults = words.length
        ? await booksCol
            .find({
              $and: words.map((word) => ({
                $or: [{ bookName: { $regex: escapeRegex(word), $options: "i" } }, { fileName: { $regex: escapeRegex(word), $options: "i" } }],
              })),
            })
            .sort({ bookName: 1 })
            .limit(DEFAULT_LIMIT)
            .toArray()
        : [];

      return mergeByDocId(exactMatch, textResults, wordResults).slice(0, DEFAULT_LIMIT);
    },

    async findByDocId(docId) {
      await ensureConnected();
      return booksCol.findOne({ docId: String(docId).trim() });
    },

    async getOrThrow(docId) {
      const book = await this.findByDocId(docId);
      if (!book) {
        const error = new Error(`Book not found for docId=${docId}`);
        error.statusCode = 404;
        throw error;
      }

      if (!book.hash) {
        const error = new Error(`Book docId=${docId} does not have hash`);
        error.statusCode = 422;
        throw error;
      }

      return book;
    },

    async upsertOne(book) {
      await ensureConnected();
      return booksCol.updateOne({ docId: book.docId }, { $set: { ...book, updatedAt: new Date() } }, { upsert: true });
    },

    async upsertMany(books) {
      await ensureConnected();

      if (!books?.length) return null;

      const ops = books.map((book) => ({
        updateOne: {
          filter: { docId: book.docId },
          update: { $set: { ...book, updatedAt: new Date() } },
          upsert: true,
        },
      }));

      return booksCol.bulkWrite(ops, { ordered: false });
    },

    async count() {
      await ensureConnected();
      return booksCol.countDocuments();
    },
  };
}

export const mongoService = createMongoService();
