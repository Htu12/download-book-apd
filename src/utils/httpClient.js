import axios from "axios";
import https from "https";

export class HttpClient {
  constructor({ defaultHeaders = {}, allowInsecureTls = false, timeoutMs = 30000 } = {}) {
    this.defaultHeaders = defaultHeaders;
    this.timeoutMs = timeoutMs;
    this.httpsAgent = allowInsecureTls ? new https.Agent({ rejectUnauthorized: false }) : undefined;
  }

  async request(url, { headers = {}, responseType, errorLabel }) {
    const response = await axios.get(url, {
      headers: {
        ...this.defaultHeaders,
        ...headers,
      },
      httpsAgent: this.httpsAgent,
      timeout: this.timeoutMs,
      responseType,
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      const preview = String(response.data || "").slice(0, 300);
      throw new Error(`${errorLabel}: ${response.status}${preview ? ` | ${preview}` : ""}`);
    }

    return response.data;
  }

  async getText(url, headers = {}) {
    return this.request(url, {
      headers,
      responseType: "text",
      errorLabel: "HTTP text request failed",
    });
  }

  async getBuffer(url, headers = {}) {
    const data = await this.request(url, {
      headers,
      responseType: "arraybuffer",
      errorLabel: "HTTP file request failed",
    });

    return Buffer.from(data);
  }
}
