// POST /api/game/join — 玩家加入遊戲（公開）
// body: { pin, name }
"use strict";
const { readBody, json, serviceHeaders, sb } = require("../../lib/admin-util");
const { fetchGame, MAX_PLAYERS, rateLimit } = require("../../lib/game-util");

module.exports = async (req, res) => {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!rateLimit(req, 60, 60000)) { json(res, 429, { error: "請稍後再試。" }); return; }

  try {
    const body = await readBody(req);
    const pin = String(body.pin || "").replace(/\D/g, "").slice(0, 6);
    const name = String(body.name || "").trim().slice(0, 16);
    if (!/^\d{6}$/.test(pin)) { json(res, 400, { error: "請輸入 6 位遊戲碼。" }); return; }
    if (!name) { json(res, 400, { error: "請輸入名字。" }); return; }

    const game = await fetchGame(pin);
    if (!game) { json(res, 404, { error: "找不到此遊戲碼，請向主持人確認。" }); return; }
    if (game.status !== "lobby") { json(res, 400, { error: "遊戲已開始，未能加入。" }); return; }

    const pr = await sb("/rest/v1/players?select=name&game_id=eq." + game.id + "&limit=300", { headers: serviceHeaders() });
    const players = pr.ok ? JSON.parse(await pr.text()) : [];
    if (players.length >= MAX_PLAYERS) { json(res, 400, { error: "遊戲人數已滿。" }); return; }
    if (players.some((p) => String(p.name).toLowerCase() === name.toLowerCase())) {
      json(res, 400, { error: "此名字已被使用，請換一個。" });
      return;
    }

    const ins = await sb("/rest/v1/players", {
      method: "POST",
      headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify({ game_id: game.id, pin, name })
    });
    const t = await ins.text();
    if (!ins.ok) { json(res, 502, { error: "加入失敗：" + t.slice(0, 150) }); return; }
    let row = [];
    try { row = JSON.parse(t); } catch (e) {}
    json(res, 200, { playerId: row[0] && row[0].id });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
