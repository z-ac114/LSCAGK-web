// GET /api/library/file?path=... — 取得雲端 PDF 的短期簽名連結（1 小時有效）
// 安全：憑證必須有效；path 必須已登記於 pdfs 資料表（防止端點被當成任意檔案讀取器）。
// 若把 Storage bucket 設為私密，此端點即成為唯一取檔途徑。
"use strict";
const { SB_URL, json, serviceHeaders, sb, safePath } = require("../../lib/admin-util");
const { rateLimit } = require("../../lib/game-util");
const { checkReq } = require("../../lib/library-token");

module.exports = async (req, res) => {
  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!rateLimit(req, 120, 60000)) { json(res, 429, { error: "請稍後再試。" }); return; }
  if (!checkReq(req)) { json(res, 401, { error: "請先輸入資源庫密碼。" }); return; }

  try {
    const url = new URL(req.url, "http://x");
    const path = String(url.searchParams.get("path") || "");
    if (!safePath(path)) { json(res, 400, { error: "無效的路徑。" }); return; }

    // 只允許簽發資料表內登記過的檔案
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
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
