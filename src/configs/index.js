import dotenv from "dotenv";

import { DEFAULT_USER_AGENT, FILE_TYPE, REQUIRED_ENV_KEYS } from "./_constant.js";

dotenv.config();

function readRequiredEnv(name) {
  const value = process.env[name];

  if (value === undefined || String(value).trim() === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return String(value).trim();
}

function parsePort(value) {
  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT value: ${value}`);
  }

  return port;
}

function parseBooleanEnv(name, defaultValue = false) {
  const rawValue = process.env[name];

  if (rawValue === undefined || rawValue === "") {
    return defaultValue;
  }

  const value = String(rawValue).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(value)) return true;
  if (["0", "false", "no", "off"].includes(value)) return false;

  throw new Error(`Invalid boolean environment variable ${name}: ${rawValue}`);
}

function parseRegex(value) {
  const text = String(value).trim();
  const literalMatch = text.match(/^\/(.+)\/([dgimsuvy]*)$/);

  try {
    if (literalMatch) {
      return new RegExp(literalMatch[1], literalMatch[2]);
    }

    return new RegExp(text, "g");
  } catch (error) {
    throw new Error(`Invalid REGEX environment variable: ${error.message}`);
  }
}

function validateRequiredEnv() {
  return REQUIRED_ENV_KEYS.reduce((env, key) => {
    env[key] = readRequiredEnv(key);
    return env;
  }, {});
}

function loadConfig() {
  const env = validateRequiredEnv();

  return {
    school: env.SCHOOL,
    host: env.HOST,
    port: parsePort(env.PORT),
    mongoUri: env.MONGO_URI,
    dbName: env.DB_NAME,
    url1: env.URL1,
    url2: env.URL2,
    url3: env.URL3,
    defaultHeaders: {
      "User-Agent": process.env.USER_AGENT?.trim() || DEFAULT_USER_AGENT,
      Referer: env.REFERER,
    },
    fileType: FILE_TYPE,
    regex: parseRegex(env.REGEX),
    allowInsecureTls: parseBooleanEnv("ALLOW_INSECURE_TLS", true),
    authPassword: env.AUTH_PASSWORD,
    authSecret: env.AUTH_SECRET,
  };
}

export default loadConfig();
