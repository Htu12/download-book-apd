import jwt from "jsonwebtoken";

export function createAuthController({ authPassword, authSecret }) {
  return async (req, res) => {
    const { password } = req.body || {};

    if (!password || password !== authPassword) {
      return res.status(401).json({
        success: false,
        error: "Sai mật khẩu",
      });
    }

    const token = jwt.sign({ role: "user" }, authSecret, { expiresIn: "7d" });

    return res.json({
      success: true,
      token,
    });
  };
}
