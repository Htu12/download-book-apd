/**
 * Script seed dữ liệu sách vào MongoDB
 * Chạy: node src/seed.js
 */
import { books } from "./data/book.js";
import { mongoService } from "./services/mongoService.js";

const total = books.length;
console.log(`📚 Bắt đầu seed ${total} sách vào MongoDB...`);

await mongoService.upsertMany(books);

const count = await mongoService.count();
console.log(`✅ Seed xong! Tổng số sách trong DB: ${count}`);