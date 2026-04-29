export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";

export const REQUIRED_ENV_KEYS = [
  "HOST",
  "PORT",
  "MONGO_URI",
  "DB_NAME",
  "REFERER",
  "URL1",
  "URL2",
  "URL3",
  "SCHOOL",
  "REGEX",
  "AUTH_PASSWORD",
  "AUTH_SECRET",
];

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
  xls: {
    ext: "xls",
    mime: "application/vnd.ms-excel",
  },
  ppt: {
    ext: "ppt",
    mime: "application/vnd.ms-powerpoint",
  },
};
