// GET /api/game/stats — 所有已玩遊戲的統計（管理員權限）
// 總覽 + 每場概要 + 跨場題目難度
"use strict";
const { checkAuth, json, serviceHeaders, sb } = require("../../lib/admin-util");

module.exports = async (req, res) => {
  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "密碼不正確。" }); return; }

  try {
    const g = await sb("/rest/v1/games?select=id,pin,status,bank,count,time_limit,created_at,questions&order=created_at.desc&limit=100", { headers: serviceHeaders() });
    if (!g.ok) { json(res, 502, { error: "讀取失敗：" + (await g.text()).slice(0, 150) }); return; }
    const games = JSON.parse(await g.text());

    const p = await sb("/rest/v1/players?select=game_id,name,score&limit=5000", { headers: serviceHeaders() });
    const players = p.ok ? JSON.parse(await p.text()) : [];

    const a = await sb("/rest/v1/answers?select=game_id,q_index,correct,points&limit=10000", { headers: serviceHeaders() });
    const answers = a.ok ? JSON.parse(await a.text()) : [];

    const correctTotal = answers.filter((x) => x.correct).length;
    const totals = {
      games: games.length,
      ended: games.filter((x) => x.status === "ended").length,
      players: players.length,
      answers: answers.length,
      correct: correctTotal,
      accuracy: answers.length ? Math.round(correctTotal / answers.length * 100) : 0,
      avgScore: players.length ? Math.round(players.reduce((s, x) => s + (x.score || 0), 0) / players.length) : 0
    };

    const perGame = games.map((g) => {
      const pa = answers.filter((x) => x.game_id === g.id);
      const ps = players.filter((x) => x.game_id === g.id);
      const correct = pa.filter((x) => x.correct).length;
      return {
        pin: g.pin,
        date: g.created_at,
        status: g.status,
        bank: g.bank,
        count: g.count,
        players: ps.length,
        answered: pa.length,
        correct,
        accuracy: pa.length ? Math.round(correct / pa.length * 100) : null,
        avgScore: ps.length ? Math.round(ps.reduce((s, x) => s + (x.score || 0), 0) / ps.length) : 0
      };
    });

    // 跨場題目難度（以題目文字聚合）
    const qMap = {};
    games.forEach((g) => {
      const qs = g.questions || [];
      answers.filter((x) => x.game_id === g.id).forEach((x) => {
        const q = qs[x.q_index];
        if (!q || !q.q) return;
        const key = String(q.q).slice(0, 80);
        if (!qMap[key]) qMap[key] = { q: key, correctOption: (q.options || [])[q.c] || "—", asked: 0, correct: 0 };
        qMap[key].asked++;
        if (x.correct) qMap[key].correct++;
      });
    });
    const list = Object.values(qMap).map((x) => Object.assign(x, { accuracy: Math.round(x.correct / x.asked * 100) }));
    const hardest = list.filter((x) => x.asked >= 2).sort((a, b) => a.accuracy - b.accuracy || b.asked - a.asked).slice(0, 8);
    const easiest = list.filter((x) => x.asked >= 2).sort((a, b) => b.accuracy - a.accuracy || b.asked - a.asked).slice(0, 8);

    json(res, 200, { totals, perGame, hardest, easiest });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
