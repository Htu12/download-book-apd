import express from "express";
import path from "path";
import { fileURLToPath } from "url";

import config from "./configs/index.js";
import { mongoService } from "./services/mongoService.js";
import { HttpClient } from "./utils/httpClient.js";
import { FileTypeDetector } from "./utils/fileTypeDetector.js";
import { BookFileService } from "./services/bookFileService.js";
import { BookController } from "./controllers/bookController.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import { createAuthController } from "./controllers/authController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AppServer {
  constructor() {
    this.app = express();
    this.httpServer = null;

    this.publicDir = path.join(__dirname, "../public");
    this.httpClient = new HttpClient({
      defaultHeaders: config.defaultHeaders,
      allowInsecureTls: config.allowInsecureTls,
    });
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

    this.authHandler = createAuthController({
      authPassword: config.authPassword,
      authSecret: config.authSecret,
    });

    this.authGuard = authMiddleware(config.authSecret);
  }

  setupMiddlewares() {
    this.app.use(express.json());
    this.app.use(express.static(this.publicDir));
  }

  setupRoutes() {
    this.app.get("/", (req, res) => {
      res.sendFile(path.join(this.publicDir, "index.html"));
    });

    this.app.get("/login.html", (req, res) => {
      res.sendFile(path.join(this.publicDir, "login.html"));
    });

    this.app.post("/api/login", this.authHandler);

    this.app.get("/api/search", this.authGuard, this.bookController.search);
    this.app.get("/api/download", this.authGuard, this.bookController.download);
  }

  setupProcessHandlers() {
    const shutdown = async (signal) => {
      try {
        console.log(`[${signal}] Shutting down`);
        await this.stop();
        process.exit(0);
      } catch (error) {
        console.error("[SHUTDOWN_FAILED]", error);
        process.exit(1);
      }
    };

    process.on("uncaughtException", (error) => {
      console.error("[UNCAUGHT_EXCEPTION]", error);
    });

    process.on("unhandledRejection", (reason) => {
      console.error("[UNHANDLED_REJECTION]", reason);
    });

    process.once("SIGINT", () => shutdown("SIGINT"));
    process.once("SIGTERM", () => shutdown("SIGTERM"));
  }

  async start() {
    this.setupProcessHandlers();
    await mongoService.connect();

    this.setupMiddlewares();
    this.setupRoutes();

    this.app.use((err, req, res, next) => {
      console.error("[EXPRESS_ERROR]", err);
      res.status(500).json({
        success: false,
        error: "Internal Server Error",
      });
    });

    this.httpServer = this.app.listen(config.port, () => {
      console.log(`Server running at ${config.host}:${config.port}`);
    });
  }

  async stop() {
    if (this.httpServer) {
      await new Promise((resolve, reject) => {
        this.httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      this.httpServer = null;
    }

    await mongoService.close();
  }
}

const server = new AppServer();
server.start().catch((error) => {
  console.error("[STARTUP_FAILED]", error);
  process.exit(1);
});
