import dotenv from "dotenv";

dotenv.config();

export const HOST = process.env.HOST;
export const PORT = process.env.PORT;

export const MONGO_URI = process.env.MONGO_URI;
export const DB_NAME = process.env.DB_NAME;

//Url
export const URL1 = process.env.URL1;
export const URL2 = process.env.URL2;
export const URL3 = process.env.URL3;

//School
export const SCHOOL = process.env.SCHOOL;

export const DEFAULT_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  "Referer": `${process.env.REFERER}`,
};

export const BASE64_SANITIZE_REGEX = process.env.REGEX;

export const FILE_TYPE = {
  pdf: {
    ext: "pdf",
    mime: "application/pdf",
  },
  bin: {
    ext: "bin",
    mime: "application/octet-stream",
  },
  docx: {
    ext: "docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  },
  xlsx: {
    ext: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  },
  pptx: {
    ext: "pptx",
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  },
  zip: {
    ext: "zip",
    mime: "application/zip",
  },
  doc: {
    ext: "doc",
    mime: "application/msword",
  },
  xls: { ext: "xls", mime: "application/vnd.ms-excel" },
  ppt: { ext: "ppt", mime: "application/vnd.ms-powerpoint" },
};
