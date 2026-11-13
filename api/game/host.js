// GET /api/game/host — 主持人即時畫面資料（管理員權限）
// ?pin=123456
"use strict";
const { checkAuth, json, serviceHeaders, sb } = require("../../lib/admin-util");
const { fetchGameInPhase, effPhase } = require("../../lib/game-util");

module.exports = async (req, res) => {
  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "密碼不正確。" }); return; }

  try {
    const url = new URL(req.url, "http://x");
    const pin = String(url.searchParams.get("pin") || "");
    const game = await fetchGameInPhase(pin);
    if (!game) { json(res, 404, { error: "找不到遊戲。" }); return; }

    const now = new Date().toISOString();
    const phase = effPhase(game, Date.now());
    const base = { status: phase, now, pin: game.pin, total: game.count, timeLimit: game.time_limit, index: game.q_index || 0 };

    // 玩家列表
    const pr = await sb("/rest/v1/players?select=id,name,score&game_id=eq." + game.id + "&order=score.desc,name.asc&limit=200", { headers: serviceHeaders() });
    const players = pr.ok ? JSON.parse(await pr.text()) : [];

    if (phase === "lobby") {
      json(res, 200, Object.assign(base, { players: players.map((p) => p.name) }));
      return;
    }

    // 作答／揭曉需要答案分佈
    if (phase === "question" || phase === "reveal") {
      const qi = game.q_index || 0;
      const q = (game.questions || [])[qi] || null;
      const ar = await sb("/rest/v1/answers?select=option&q_index=eq." + qi + "&game_id=eq." + game.id + "&limit=500", { headers: serviceHeaders() });
      const answers = ar.ok ? JSON.parse(await ar.text()) : [];
      const counts = q ? q.options.map(() => 0) : [];
      answers.forEach((a) => { if (counts[a.option] != null) counts[a.option]++; });
      const out = Object.assign(base, {
        answered: answers.length,
        playerCount: players.length
      });
      if (phase === "question" && q) {
        out.q = q.q;
        out.options = q.options;
        out.endsAt = game.q_ends_at;
        out.standings = players.slice(0, 20).map((p) => ({ name: p.name, score: p.score }));
      } else if (phase === "reveal" && q) {
        out.q = q.q;
        out.options = q.options;
        out.correct = q.c;
        out.counts = counts;
        out.standings = players.slice(0, 20).map((p) => ({ name: p.name, score: p.score }));
      }
      json(res, 200, out);
      return;
    }

    // board / ended：完整排行
    json(res, 200, Object.assign(base, {
      standings: players.map((p) => ({ name: p.name, score: p.score }))
    }));
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
