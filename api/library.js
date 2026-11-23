// /api/library — 資源庫 API（單一函數，依方法與 ?path= 分派）
//   POST          — 驗證資源庫密碼 → { token }（5 次／分鐘／IP）
//   GET           — 資源清單（需憑證 x-library-token）
//   GET ?path=... — 取得檔案的短期簽名連結（需憑證；1 小時有效）
"use strict";
const crypto = require("crypto");
const { SB_URL, readBody, json, serviceHeaders, sb, safePath } = require("../lib/admin-util");
const { rateLimit } = require("../lib/game-util");
const { issueToken, checkReq } = require("../lib/library-token");

/* ---------- POST：密碼驗證 ---------- */
async function handleVerify(req, res) {
  const LIBRARY_PASSWORD = process.env.LIBRARY_PASSWORD || "";
  if (!LIBRARY_PASSWORD) {
    json(res, 500, { error: "伺服器未設定 LIBRARY_PASSWORD 環境變數，請於 Vercel 專案設定後重新部署。" });
    return;
  }
  if (!rateLimit(req, 5, 60000)) { json(res, 429, { error: "嘗試次數過多，請一分鐘後再試。" }); return; }

  const body = await readBody(req);
  const pass = String(body.password || "");
  const a = Buffer.from(pass);
  const b = Buffer.from(LIBRARY_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) { json(res, 401, { error: "密碼不正確。" }); return; }

  const token = issueToken();
  if (!token) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  json(res, 200, { ok: true, token, expiresIn: 86400 });
}

/* ---------- GET：清單 ---------- */
async function handleList(res) {
  const r = await sb("/rest/v1/pdfs?select=*&order=created_at.desc", { headers: serviceHeaders() });
  const text = await r.text();
  if (!r.ok) { json(res, 502, { error: "讀取失敗：" + text.slice(0, 150) }); return; }
  let rows = [];
  try { rows = JSON.parse(text); } catch (e) { rows = []; }
  json(res, 200, rows);
}

/* ---------- GET ?path=：簽名檔案連結 ---------- */
async function handleFile(req, res) {
  const url = new URL(req.url, "http://x");
  const path = String(url.searchParams.get("path") || "");
  if (!safePath(path)) { json(res, 400, { error: "無效的路徑。" }); return; }

  // 只允許簽發資料表內登記過的檔案（防被當成任意檔案讀取器）
  const q = await sb("/rest/v1/pdfs?select=id&storage_path=eq." + encodeURIComponent(path) + "&limit=1", { headers: serviceHeaders() });
  const qtext = await q.text();
  let rows = [];
  try { rows = JSON.parse(qtext); } catch (e) {}
  if (!q.ok || !Array.isArray(rows) || !rows.length) { json(res, 404, { error: "找不到此檔案。" }); return; }

  const r = await sb("/storage/v1/object/sign/pdfs/" + path, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch (e) {}
  if (!r.ok || !j.signedURL) { json(res, 502, { error: "簽署失敗：" + text.slice(0, 150) }); return; }
  json(res, 200, { url: SB_URL + "/storage/v1" + j.signedURL });
}

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!rateLimit(req, 120, 60000)) { json(res, 429, { error: "請稍後再試。" }); return; }

  try {
    if (req.method === "POST") { await handleVerify(req, res); return; }
    if (!checkReq(req)) { json(res, 401, { error: "請先輸入資源庫密碼。" }); return; }
    const url = new URL(req.url, "http://x");
    if (url.searchParams.get("path")) { await handleFile(req, res); return; }
    await handleList(res);
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
