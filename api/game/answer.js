// POST /api/game/answer — 玩家提交答案（公開）
// body: { pin, player, index, option }
// 正確答案只在伺服器比對，回應不洩露對錯（統一於 reveal 公佈）
"use strict";
const { readBody, json, serviceHeaders, sb } = require("../../lib/admin-util");
const { fetchGameInPhase, effPhase, UUID_RE, rateLimit } = require("../../lib/game-util");

module.exports = async (req, res) => {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!rateLimit(req, 600, 60000)) { json(res, 429, { error: "請稍後再試。" }); return; }

  try {
    const body = await readBody(req);
    const pin = String(body.pin || "").replace(/\D/g, "").slice(0, 6);
    const playerId = String(body.player || "");
    const index = Number(body.index);
    const option = Number(body.option);
    if (!UUID_RE.test(playerId)) { json(res, 400, { error: "無效的玩家。" }); return; }

    const game = await fetchGameInPhase(pin);
    if (!game) { json(res, 404, { error: "找不到此遊戲碼。" }); return; }
    if (effPhase(game, Date.now()) !== "question") { json(res, 400, { error: "現在不是作答時間。" }); return; }
    if (index !== game.q_index) { json(res, 400, { error: "題目已切換。" }); return; }

    // 1.5 秒寬限（網絡延遲）
    if (Date.now() > Date.parse(game.q_ends_at) + 1500) { json(res, 400, { error: "時間已到。" }); return; }

    // 玩家存在（連分數一併讀取，用於累加）
    const pr = await sb("/rest/v1/players?select=id,score&game_id=eq." + game.id + "&limit=300", { headers: serviceHeaders() });
    const players = pr.ok ? JSON.parse(await pr.text()) : [];
    const me = players.find((p) => p.id === playerId);
    if (!me) { json(res, 400, { error: "玩家不存在，請重新加入。" }); return; }

    const q = (game.questions || [])[game.q_index || 0];
    if (!q || !Number.isInteger(option) || option < 0 || option >= q.options.length) {
      json(res, 400, { error: "無效的選項。" });
      return;
    }

    // 計分：正確 500–1000 分（按剩餘時間）
    const correct = option === q.c;
    const remaining = Date.parse(game.q_ends_at) - Date.now();
    const points = correct
      ? Math.min(1000, Math.max(500, Math.round(500 + 500 * Math.max(0, remaining) / (game.time_limit * 1000))))
      : 0;

    // 寫入答案（每人每題一次；重複視為已答）
    const ins = await sb("/rest/v1/answers", {
      method: "POST",
      headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify({ game_id: game.id, player_id: playerId, q_index: game.q_index, option, correct, points })
    });
    if (!ins.ok) {
      const t = await ins.text();
      if (ins.status === 409 || /duplicate|conflict/i.test(t)) { json(res, 200, { ok: true, already: true }); return; }
      json(res, 502, { error: "提交失敗：" + t.slice(0, 150) });
      return;
    }

    // 累加分數
    if (points > 0) {
      await sb("/rest/v1/players?id=eq." + playerId, {
        method: "PATCH",
        headers: serviceHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ score: (Number(me.score) || 0) + points })
      });
    }
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
