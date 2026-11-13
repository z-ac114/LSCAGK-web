// 共用工具：管理員帳號驗證 + Supabase REST 呼叫（零依賴）
// 帳密可用環境變數覆寫（建議）：ADMIN_USERNAME / ADMIN_PASSWORD
// 以及 SUPABASE_SERVICE_KEY — Supabase service role / sb_secret_ 金鑰
"use strict";

const crypto = require("crypto");

const SB_URL = "https://oajvxavzsomymqunpgxx.supabase.co";

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "zact411";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "lscagkt2627!";

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function checkAuth(req) {
  const h = req.headers || {};
  const user = String(h["x-admin-user"] || "");
  const pass = String(h["x-admin-pass"] || "");
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD) return false;
  return safeEqual(user, ADMIN_USERNAME) && safeEqual(pass, ADMIN_PASSWORD);
}

function readBody(req) {
  // Vercel Node runtime 會自動解析 JSON body 成 req.body
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { resolve({}); }
    });
    req.on("error", () => resolve({}));
  });
}

function json(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function envError(res, name) {
  json(res, 500, { error: `伺服器未設定環境變數 ${name}，請於 Vercel 專案設定後重新部署。` });
}

function serviceHeaders(extra) {
  return Object.assign({
    apikey: process.env.SUPABASE_SERVICE_KEY || "",
    Authorization: "Bearer " + (process.env.SUPABASE_SERVICE_KEY || "")
  }, extra || {});
}

async function sb(path, options) {
  return fetch(SB_URL + path, options);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 只允許安全的儲存路徑（防路徑跳轉）
function safePath(p) {
  return typeof p === "string" && /^[A-Za-z0-9][A-Za-z0-9._\-\/]{0,200}$/.test(p) && p.indexOf("..") === -1;
}

module.exports = { SB_URL, checkAuth, readBody, json, envError, serviceHeaders, sb, UUID_RE, safePath };
