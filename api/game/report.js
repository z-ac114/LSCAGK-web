// GET /api/game/report?pin=XXXXXX — 賽後報告（管理員權限）
// 每題：答對/答錯人數、誰答錯（揀了甚麼）、誰未作答；另附每人總結
"use strict";
const { checkAuth, json, serviceHeaders, sb } = require("../../lib/admin-util");
const { fetchGame } = require("../../lib/game-util");

module.exports = async (req, res) => {
  if (req.method !== "GET") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "密碼不正確。" }); return; }

  try {
    const url = new URL(req.url, "http://x");
    const pin = String(url.searchParams.get("pin") || "").replace(/\D/g, "").slice(0, 6);
    const game = await fetchGame(pin);
    if (!game) { json(res, 404, { error: "找不到此遊戲碼。" }); return; }

    const questions = game.questions || [];
    const pr = await sb("/rest/v1/players?select=id,name,score&game_id=eq." + game.id + "&order=score.desc,name.asc&limit=300", { headers: serviceHeaders() });
    const players = pr.ok ? JSON.parse(await pr.text()) : [];
    const nameOf = {};
    players.forEach((p) => { nameOf[p.id] = p.name; });

    const ar = await sb("/rest/v1/answers?select=player_id,q_index,option,correct,points&game_id=eq." + game.id + "&limit=5000", { headers: serviceHeaders() });
    const answers = ar.ok ? JSON.parse(await ar.text()) : [];

    const perQuestion = questions.map((q, i) => {
      const qrows = answers.filter((a) => a.q_index === i);
      const correctCount = qrows.filter((a) => a.correct).length;
      const wrong = qrows
        .filter((a) => !a.correct)
        .map((a) => ({ name: nameOf[a.player_id] || "未知", picked: q.options[a.option] != null ? q.options[a.option] : "—" }));
      const answeredIds = {};
      qrows.forEach((a) => { answeredIds[a.player_id] = true; });
      const timeout = players.filter((p) => !answeredIds[p.id]).map((p) => p.name);
      return {
        index: i,
        q: q.q,
        options: q.options,
        correct: q.c,
        totalPlayers: players.length,
        answered: qrows.length,
        correctCount,
        wrong,
        timeout
      };
    });

    const playerSummary = players.map((p) => {
      const mine = answers.filter((a) => a.player_id === p.id);
      return {
        name: p.name,
        score: p.score || 0,
        answered: mine.length,
        correct: mine.filter((a) => a.correct).length
      };
    });

    json(res, 200, {
      pin: game.pin,
      status: game.status,
      createdAt: game.created_at,
      count: game.count,
      timeLimit: game.time_limit,
      bank: game.bank,
      questions: perQuestion,
      players: playerSummary
    });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
