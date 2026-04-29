export class TextUtils {
  static normalizeDocId(docId) {
    return String(docId ?? "").trim();
  }

  static sanitizeFileName(name = "book") {
    return String(name || "book")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  static toAsciiFileName(name = "file") {
    return String(name)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .replace(/[^\x20-\x7E]/g, "")
      .replace(/[:\"]/g, "_")
      .replace(/[<>/\\|?*\x00-\x1F]/g, "_")
      .replace(/\s+/g, " ")
      .trim();
  }

  static normalizeText(text = "") {
    return String(text)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  static buildContentDisposition(fileName) {
    const asciiName = TextUtils.toAsciiFileName(fileName) || "download";
    const utf8Name = encodeURIComponent(fileName);
    return `attachment; filename="${asciiName}"; filename*=UTF-8''${utf8Name}`;
  }
}
