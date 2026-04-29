import { books } from "./data/book.js";
import { mongoService } from "./services/mongoService.js";

async function seedBooks() {
  const total = books.length;
  console.log(`Start seeding ${total} books into MongoDB`);

  await mongoService.connect();
  await mongoService.upsertMany(books);

  const count = await mongoService.count();
  console.log(`Seed completed. Total books in DB: ${count}`);
}

try {
  await seedBooks();
} finally {
  await mongoService.close();
}
