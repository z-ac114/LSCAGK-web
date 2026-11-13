// /api/admin/leaderboard
//   GET    — 列出成績（最新 1000 筆）
//   DELETE — 刪除指定成績 { ids: [uuid, ...] }
"use strict";
const { checkAuth, readBody, json, envError, serviceHeaders, sb, UUID_RE } = require("../../lib/admin-util");

module.exports = async (req, res) => {
  if (!process.env.ADMIN_PASSWORD) { envError(res, "ADMIN_PASSWORD"); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { envError(res, "SUPABASE_SERVICE_KEY"); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "密碼不正確。" }); return; }

  try {
    if (req.method === "GET") {
      const r = await sb("/rest/v1/leaderboard?select=*&order=created_at.desc&limit=1000", {
        headers: serviceHeaders()
      });
      const text = await r.text();
      if (!r.ok) { json(res, 502, { error: "Supabase 讀取失敗：" + text.slice(0, 200) }); return; }
      let rows = [];
      try { rows = JSON.parse(text); } catch (e) { rows = []; }
      json(res, 200, { rows });
      return;
    }

    if (req.method === "DELETE") {
      const body = await readBody(req);
      const ids = Array.isArray(body.ids) ? body.ids.filter((i) => UUID_RE.test(String(i))) : [];
      if (!ids.length) { json(res, 400, { error: "沒有有效的記錄 id。" }); return; }
      const filter = "id=in.(\"" + ids.join("\",\"") + "\")";
      const r = await sb("/rest/v1/leaderboard?" + encodeURIComponent(filter), {
        method: "DELETE",
        headers: serviceHeaders({ Prefer: "return=representation" })
      });
      const text = await r.text();
      if (!r.ok) { json(res, 502, { error: "Supabase 刪除失敗：" + text.slice(0, 200) }); return; }
      let deleted = [];
      try { deleted = JSON.parse(text); } catch (e) { deleted = []; }
      json(res, 200, { deleted: deleted.length });
      return;
    }

    json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
