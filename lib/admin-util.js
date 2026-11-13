// 共用工具：管理員密碼驗證 + Supabase REST 呼叫（零依賴）
// 需要在 Vercel 設定環境變數：
//   ADMIN_PASSWORD        — 管理後台密碼
//   SUPABASE_SERVICE_KEY  — Supabase service role / sb_secret_ 金鑰
"use strict";

const crypto = require("crypto");

const SB_URL = "https://oajvxavzsomymqunpgxx.supabase.co";

function checkAuth(req) {
  const expected = process.env.ADMIN_PASSWORD || "";
  if (!expected) return false;
  const provided = String(req.headers["x-admin-pass"] || "");
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
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
