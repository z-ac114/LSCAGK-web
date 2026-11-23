// /api/game/history — 歷史遊戲與統計（管理員權限）
//   GET             — 最近 50 場（含玩家數）
//   GET ?op=stats   — 所有已玩遊戲的統計（總覽 + 每場概要 + 跨場題目難度）
//   DELETE          — 刪除指定遊戲 { pin }（FK cascade 連玩家與答案一併刪除）
"use strict";
const { checkAuth, readBody, json, serviceHeaders, sb } = require("../../lib/admin-util");

/* ---------- GET ?op=stats：統計 ---------- */
async function handleStats(res) {
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
}

module.exports = async (req, res) => {
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "帳號或密碼不正確。" }); return; }

  try {
    const op = new URL(req.url, "http://x").searchParams.get("op") || "";

    if (req.method === "GET" && op === "stats") { await handleStats(res); return; }

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
