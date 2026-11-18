// POST /api/library/verify — 資源庫密碼驗證（公開）
// 密碼存於環境變數 LIBRARY_PASSWORD（不在任何前端程式碼中）。
// 速率限制 5 次／分鐘／IP，減慢暴力破解；成功簽發 24 小時憑證。
"use strict";
const crypto = require("crypto");
const { readBody, json } = require("../../lib/admin-util");
const { rateLimit } = require("../../lib/game-util");
const { issueToken } = require("../../lib/library-token");

module.exports = async (req, res) => {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  const LIBRARY_PASSWORD = process.env.LIBRARY_PASSWORD || "";
  if (!LIBRARY_PASSWORD) {
    json(res, 500, { error: "伺服器未設定 LIBRARY_PASSWORD 環境變數，請於 Vercel 專案設定後重新部署。" });
    return;
  }
  if (!rateLimit(req, 5, 60000)) { json(res, 429, { error: "嘗試次數過多，請一分鐘後再試。" }); return; }

  try {
    const body = await readBody(req);
    const pass = String(body.password || "");
    const a = Buffer.from(pass);
    const b = Buffer.from(LIBRARY_PASSWORD);
    const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
    if (!ok) { json(res, 401, { error: "密碼不正確。" }); return; }

    const token = issueToken();
    if (!token) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
    json(res, 200, { ok: true, token, expiresIn: 86400 });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
