import jwt from "jsonwebtoken";

export function authMiddleware(secret) {
  return (req, res, next) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";

    if (!token) {
      return res.status(401).json({ success: false, error: "Unauthorized" });
    }

    try {
      jwt.verify(token, secret);
      return next();
    } catch (error) {
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ success: false, error: "Token expired" });
      }

      return res.status(401).json({ success: false, error: "Invalid token" });
    }
  };
}
