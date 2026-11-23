// POST /api/game/control — 主持人控制遊戲階段／建立遊戲（管理員權限）
// body: { pin, action } — action: start | reveal | next | go | end | cancel
// body: { op: "create", bank, count, timeLimit, questions } — 建立新遊戲
"use strict";
const { checkAuth, readBody, json, serviceHeaders, sb } = require("../../lib/admin-util");
const { fetchGameInPhase, sanitizeQuestion } = require("../../lib/game-util");

/* ---------- 建立遊戲 ---------- */
async function handleCreate(req, res, body) {
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }

  const bank = body.bank === "nschallenge" ? "nschallenge" : "guoqing";
  const count = Math.max(1, Math.min(100, Number(body.count) || 10));
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
}

module.exports = async (req, res) => {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "帳號或密碼不正確。" }); return; }

  try {
    const body = await readBody(req);

    if (String(body.op || "") === "create") { await handleCreate(req, res, body); return; }

    const pin = String(body.pin || "");
    const action = String(body.action || "");
    const game = await fetchGameInPhase(pin);
    if (!game) { json(res, 404, { error: "找不到遊戲。" }); return; }

    if (action === "cancel") {
      const del = await sb("/rest/v1/games?pin=eq." + encodeURIComponent(pin), {
        method: "DELETE", headers: serviceHeaders()
      });
      if (!del.ok) { json(res, 502, { error: "刪除失敗。" }); return; }
      json(res, 200, { ok: true, deleted: true });
      return;
    }

    const nowMs = Date.now();
    const now = new Date(nowMs).toISOString();
    // 每題開始前的倒數準備時間（玩家畫面顯示 3·2·1）
    const BUFFER_MS = 3000;
    let patch = null;

    switch (action) {
      case "start":
        if (game.status !== "lobby") { json(res, 400, { error: "遊戲已開始。" }); return; }
        patch = { status: "question", q_index: 0, q_started_at: now, q_ends_at: new Date(nowMs + BUFFER_MS + game.time_limit * 1000).toISOString() };
        break;
      case "reveal":
        if (game.status !== "question") { json(res, 400, { error: "目前不在作答階段。" }); return; }
        patch = { status: "reveal" };
        break;
      case "next":
        if (game.status !== "reveal") { json(res, 400, { error: "目前不在揭曉階段。" }); return; }
        patch = { status: "board" };
        break;
      case "go": {
        if (game.status !== "board") { json(res, 400, { error: "目前不在排行榜階段。" }); return; }
        const nxt = (game.q_index || 0) + 1;
        // 下一題不存在（已問完最後一題）→ 直接結束，絕不開出新題
        if (nxt >= game.count || !(game.questions || [])[nxt]) patch = { status: "ended" };
        else patch = { status: "question", q_index: nxt, q_started_at: now, q_ends_at: new Date(nowMs + BUFFER_MS + game.time_limit * 1000).toISOString() };
        break;
      }
      case "end":
        if (game.status === "ended") { json(res, 400, { error: "遊戲已結束。" }); return; }
        patch = { status: "ended" };
        break;
      default:
        json(res, 400, { error: "未知的操作。" });
        return;
    }

    const upd = await sb("/rest/v1/games?pin=eq." + encodeURIComponent(pin), {
      method: "PATCH",
      headers: serviceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch)
    });
    if (!upd.ok) { json(res, 502, { error: "更新失敗：" + (await upd.text()).slice(0, 150) }); return; }
    json(res, 200, { ok: true });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
