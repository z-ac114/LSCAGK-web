// GET /api/game/state — 玩家輪詢遊戲狀態（公開）
// ?pin=123456&player=<uuid>
// 注意：question 階段絕不回傳正確答案（防作弊）
"use strict";
const { json, serviceHeaders, sb } = require("../../lib/admin-util");
const { fetchGameInPhase, effPhase, UUID_RE } = require("../../lib/game-util");

module.exports = async (req, res) => {
  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }

  try {
    const url = new URL(req.url, "http://x");
    const pin = String(url.searchParams.get("pin") || "").replace(/\D/g, "").slice(0, 6);
    const player = String(url.searchParams.get("player") || "");
    const game = await fetchGameInPhase(pin);
    if (!game) { json(res, 404, { error: "找不到此遊戲碼。" }); return; }

    const nowMs = Date.now();
    const phase = effPhase(game, nowMs);
    const base = { status: phase, now: new Date(nowMs).toISOString(), total: game.count, index: game.q_index || 0 };

    const pr = await sb("/rest/v1/players?select=id,name,score&game_id=eq." + game.id + "&order=score.desc,name.asc&limit=300", { headers: serviceHeaders() });
    const players = pr.ok ? JSON.parse(await pr.text()) : [];
    const me = player && UUID_RE.test(player) ? players.find((p) => p.id === player) : null;

    if (phase === "lobby") {
      json(res, 200, Object.assign(base, {
        timeLimit: game.time_limit,
        playerCount: players.length,
        players: players.map((p) => p.name)
      }));
      return;
    }

    if (phase === "question") {
      const q = (game.questions || [])[game.q_index || 0];
      if (!q) { json(res, 502, { error: "題目資料缺失。" }); return; }
      json(res, 200, Object.assign(base, {
        q: q.q,
        options: q.options,
        endsAt: game.q_ends_at,
        startedAt: game.q_started_at
      }));
      return;
    }

    if (phase === "reveal") {
      const qi = game.q_index || 0;
      const q = (game.questions || [])[qi];
      const ar = await sb("/rest/v1/answers?select=player_id,option,correct,points&q_index=eq." + qi + "&game_id=eq." + game.id + "&limit=500", { headers: serviceHeaders() });
      const answers = ar.ok ? JSON.parse(await ar.text()) : [];
      const counts = q ? q.options.map(() => 0) : [];
      answers.forEach((a) => { if (counts[a.option] != null) counts[a.option]++; });
      const mine = me ? answers.find((a) => a.player_id === me.id) : null;
      const rank = me ? 1 + players.filter((p) => p.score > me.score).length : null;
      // 緊隨其上的一名玩家（分數高於我之中最低者）
      let ahead = null;
      if (me) {
        const higher = players.filter((p) => p.score > me.score);
        if (higher.length) ahead = { name: higher[higher.length - 1].name, score: higher[higher.length - 1].score };
      }
      json(res, 200, Object.assign(base, {
        q: q ? q.q : "",
        options: q ? q.options : [],
        correct: q ? q.c : null,
        counts,
        my: {
          answered: !!mine,
          option: mine ? mine.option : null,
          correct: mine ? mine.correct : false,
          points: mine ? mine.points : 0,
          score: me ? me.score : 0,
          rank,
          aheadName: ahead ? ahead.name : null,
          aheadScore: ahead ? ahead.score : null
        }
      }));
      return;
    }

    // board / ended
    const standings = players.slice(0, 10).map((p) => ({ name: p.name, score: p.score }));
    const podium = players.slice(0, 3).map((p) => ({ name: p.name, score: p.score }));
    const my = me
      ? { rank: 1 + players.filter((p) => p.score > me.score).length, score: me.score }
      : null;
    json(res, 200, Object.assign(base, { standings, podium, my }));
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
