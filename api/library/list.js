// GET /api/library/list — 資源清單（需有效資源庫憑證）
// 取代直接以 anon key 讀取 pdfs 資料表：未解鎖前連標題與檔案路徑都不可見
"use strict";
const { json, serviceHeaders, sb } = require("../../lib/admin-util");
const { rateLimit } = require("../../lib/game-util");
const { checkReq } = require("../../lib/library-token");

module.exports = async (req, res) => {
  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!rateLimit(req, 120, 60000)) { json(res, 429, { error: "請稍後再試。" }); return; }
  if (!checkReq(req)) { json(res, 401, { error: "請先輸入資源庫密碼。" }); return; }

  try {
    const r = await sb("/rest/v1/pdfs?select=*&order=created_at.desc", { headers: serviceHeaders() });
    const text = await r.text();
    if (!r.ok) { json(res, 502, { error: "讀取失敗：" + text.slice(0, 150) }); return; }
    let rows = [];
    try { rows = JSON.parse(text); } catch (e) { rows = []; }
    json(res, 200, rows);
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
