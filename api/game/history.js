// /api/game/history — 歷史遊戲（管理員權限）
//   GET    — 最近 50 場（含玩家數）
//   DELETE — 刪除指定遊戲 { pin }（FK cascade 連玩家與答案一併刪除）
"use strict";
const { checkAuth, readBody, json, serviceHeaders, sb } = require("../../lib/admin-util");

module.exports = async (req, res) => {
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "密碼不正確。" }); return; }

  try {
    if (req.method === "GET") {
      const g = await sb("/rest/v1/games?select=id,pin,status,bank,count,time_limit,created_at&order=created_at.desc&limit=50", { headers: serviceHeaders() });
      if (!g.ok) { json(res, 502, { error: "讀取失敗：" + (await g.text()).slice(0, 150) }); return; }
      const games = JSON.parse(await g.text());
      let counts = {};
      const p = await sb("/rest/v1/players?select=game_id&limit=5000", { headers: serviceHeaders() });
      if (p.ok) {
        JSON.parse(await p.text()).forEach((x) => { counts[x.game_id] = (counts[x.game_id] || 0) + 1; });
      }
      const rows = games.map((gm) => Object.assign({}, gm, { players: counts[gm.id] || 0 }));
      json(res, 200, { rows });
      return;
    }

    if (req.method === "DELETE") {
      const body = await readBody(req);
      const pin = String(body.pin || "");
      if (!/^\d{6}$/.test(pin)) { json(res, 400, { error: "無效的遊戲碼。" }); return; }
      const del = await sb("/rest/v1/games?pin=eq." + pin, { method: "DELETE", headers: serviceHeaders() });
      if (!del.ok) { json(res, 502, { error: "刪除失敗：" + (await del.text()).slice(0, 150) }); return; }
      json(res, 200, { ok: true });
      return;
    }

    json(res, 405, { error: "Method not allowed" });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
