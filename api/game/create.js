// POST /api/game/create — 主持人建立遊戲（管理員權限）
// body: { bank, count, timeLimit, questions: [{q, options, c}] }
"use strict";
const { checkAuth, readBody, json, serviceHeaders, sb } = require("../../lib/admin-util");
const { sanitizeQuestion } = require("../../lib/game-util");

module.exports = async (req, res) => {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "密碼不正確。" }); return; }

  try {
    const body = await readBody(req);
    const bank = body.bank === "nschallenge" ? "nschallenge" : "guoqing";
    const count = Math.max(1, Math.min(50, Number(body.count) || 10));
    const timeLimit = Math.max(5, Math.min(120, Number(body.timeLimit) || 20));
    const qs = (Array.isArray(body.questions) ? body.questions.map(sanitizeQuestion) : []);
    if (qs.length !== count || qs.some((q) => !q)) {
      json(res, 400, { error: "題目資料無效，請重新建立。" });
      return;
    }

    // 生成未使用的 6 位遊戲碼
    let pin = null;
    for (let i = 0; i < 20 && !pin; i++) {
      const cand = String(Math.floor(100000 + Math.random() * 900000));
      const r = await sb("/rest/v1/games?select=pin&pin=eq." + cand + "&limit=1", { headers: serviceHeaders() });
      if (!r.ok) break;
      const rows = JSON.parse(await r.text());
      if (Array.isArray(rows) && rows.length === 0) pin = cand;
    }
    if (!pin) { json(res, 500, { error: "無法生成遊戲碼，請重試。" }); return; }

    const ins = await sb("/rest/v1/games", {
      method: "POST",
      headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify({
        pin, bank, count, time_limit: timeLimit,
        status: "lobby", q_index: 0, questions: qs
      })
    });
    const t = await ins.text();
    if (!ins.ok) { json(res, 502, { error: "建立遊戲失敗：" + t.slice(0, 150) }); return; }
    json(res, 200, { pin });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
