// 遊戲共用工具（供 /api/game/* 使用）
"use strict";

const { sb, serviceHeaders } = require("./admin-util");

async function fetchGame(pin) {
  const r = await sb("/rest/v1/games?select=*&pin=eq." + encodeURIComponent(String(pin)) + "&limit=1", {
    headers: serviceHeaders()
  });
  if (!r.ok) throw new Error("supabase");
  const rows = JSON.parse(await r.text());
  return rows && rows[0];
}

// 依時間自動把逾時的 question 視為 reveal
function effPhase(game, nowMs) {
  if (game.status === "question") {
    const ends = Date.parse(game.q_ends_at);
    if (ends && nowMs >= ends) return "reveal";
    return "question";
  }
  return game.status; // lobby | reveal | board | ended
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 取得遊戲；若 question 已逾時，把狀態落實為 reveal（冪等），確保控制流程一致
async function fetchGameInPhase(pin) {
  const game = await fetchGame(pin);
  if (game && game.status === "question") {
    const ends = Date.parse(game.q_ends_at);
    if (ends && Date.now() >= ends) {
      try {
        await sb("/rest/v1/games?pin=eq." + encodeURIComponent(String(pin)), {
          method: "PATCH",
          headers: serviceHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ status: "reveal" })
        });
      } catch (e) { /* 落實失敗時仍按時間視為 reveal */ }
      game.status = "reveal";
    }
  }
  return game;
}

function sanitizeQuestion(q) {
  if (!q || typeof q.q !== "string" || !q.q.trim()) return null;
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o == null ? "" : o).slice(0, 120)) : null;
  if (!options || options.length < 2 || options.length > 6 || options.some((o) => !o.trim())) return null;
  const c = Number(q.c);
  if (!Number.isInteger(c) || c < 0 || c >= options.length) return null;
  return { q: q.q.trim().slice(0, 400), options, c };
}

module.exports = { fetchGame, fetchGameInPhase, effPhase, UUID_RE, sanitizeQuestion };
