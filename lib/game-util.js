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

function sanitizeQuestion(q) {
  if (!q || typeof q.q !== "string" || !q.q.trim()) return null;
  const options = Array.isArray(q.options) ? q.options.map((o) => String(o == null ? "" : o).slice(0, 120)) : null;
  if (!options || options.length < 2 || options.length > 6 || options.some((o) => !o.trim())) return null;
  const c = Number(q.c);
  if (!Number.isInteger(c) || c < 0 || c >= options.length) return null;
  return { q: q.q.trim().slice(0, 400), options, c };
}

module.exports = { fetchGame, effPhase, UUID_RE, sanitizeQuestion };
