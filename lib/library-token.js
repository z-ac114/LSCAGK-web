// 資源庫存取憑證（HMAC-SHA256）
// 密碼本身存於環境變數 LIBRARY_PASSWORD，永不出現在前端程式碼。
// 驗證成功後簽發 24 小時憑證，用戶端以 x-library-token 標頭攜帶，
// 各 /api/library/* 端點以 timing-safe 比對驗證。
"use strict";

const crypto = require("crypto");

const TTL_MS = 24 * 60 * 60 * 1000; // 24 小時

function secret() {
  return process.env.SUPABASE_SERVICE_KEY || "";
}

function sign(exp) {
  return crypto.createHmac("sha256", secret()).update("lib:" + exp).digest("hex");
}

function issueToken() {
  if (!secret()) return "";
  const exp = Date.now() + TTL_MS;
  return exp + "." + sign(exp);
}

function verifyToken(token) {
  if (!secret()) return false;
  const m = /^(\d{10,15})\.([0-9a-f]{64})$/.exec(String(token || ""));
  if (!m) return false;
  const exp = Number(m[1]);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const a = Buffer.from(m[2]);
  const b = Buffer.from(sign(exp));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function tokenFromReq(req) {
  return String((req.headers && req.headers["x-library-token"]) || "");
}

function checkReq(req) {
  return verifyToken(tokenFromReq(req));
}

module.exports = { TTL_MS, issueToken, verifyToken, tokenFromReq, checkReq };
