// POST /api/score — 保存競賽模擬成績（公開，伺服器端寫入）
// 取代以 anon key 直接 INSERT leaderboard（前例：任何人可用公開金鑰偽造成績）
// body: { name, score, total, accuracy, time_taken, mode, details?, exam_style? }
// 安全：速率限制 + 欄位白名單 + 合理範圍檢查；配合 Supabase RLS 關閉 leaderboard
// 對 anon 的 INSERT 權限（需於 Supabase Dashboard 手動調整）。
"use strict";
const { readBody, json, serviceHeaders, sb } = require("../lib/admin-util");
const { rateLimit } = require("../lib/game-util");

module.exports = async (req, res) => {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { json(res, 500, { error: "伺服器未設定 SUPABASE_SERVICE_KEY。" }); return; }
  if (!rateLimit(req, 10, 60000)) { json(res, 429, { error: "保存次數過多，請稍後再試。" }); return; }

  try {
    const body = await readBody(req);

    const name = String(body.name || "").trim().slice(0, 16);
    if (!name) { json(res, 400, { error: "請輸入名字。" }); return; }

    const num = (v) => Number(v);
    const intIn = (v, min, max) => Number.isInteger(num(v)) && num(v) >= min && num(v) <= max ? num(v) : null;

    const score = intIn(body.score, 0, 100000);
    if (score == null) { json(res, 400, { error: "無效的分數。" }); return; }

    const mode = body.mode === "sprint" ? "sprint" : "infinite";
    const row = {
      name,
      score,
      mode
    };

    if (body.total != null) {
      const total = intIn(body.total, 0, 100000);
      if (total != null) row.total = total;
    }
    if (body.accuracy != null) {
      const acc = num(body.accuracy);
      if (Number.isFinite(acc) && acc >= 0 && acc <= 1) row.accuracy = Math.round(acc * 10000) / 10000;
    }
    if (body.time_taken != null) {
      const tt = intIn(body.time_taken, 0, 86400);
      if (tt != null) row.time_taken = tt;
    }
    if (body.exam_style === true) row.exam_style = true;
    if (body.details != null) {
      if (!Array.isArray(body.details) || body.details.length > 500) {
        json(res, 400, { error: "無效的作答詳情。" });
        return;
      }
      const text = JSON.stringify(body.details);
      if (text.length > 50000) { json(res, 400, { error: "作答詳情過大。" }); return; }
      row.details = body.details;
    }

    const doInsert = (payload) =>
      sb("/rest/v1/leaderboard", {
        method: "POST",
        headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify(payload)
      }).then((r) => r.text().then((t) => ({ ok: r.ok, text: t })));

    let ins = await doInsert(row);
    // 資料表尚未加 exam_style 欄時：退回不含旗標的寫入（成績仍會保存，只是無星標）
    if (!ins.ok && row.exam_style && /exam_style/i.test(ins.text)) {
      delete row.exam_style;
      ins = await doInsert(row);
    }
    if (!ins.ok) { json(res, 502, { error: "保存失敗：" + ins.text.slice(0, 150) }); return; }

    let inserted = [];
    try { inserted = JSON.parse(ins.text); } catch (e) {}
    json(res, 200, { ok: true, entry: inserted[0] || null });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
