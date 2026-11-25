// /api/admin — 管理後台 API（單一函數，依 ?op= 分派；Hobby 方案 12 函數上限內）
//   POST ?op=verify          — 驗證管理員帳密（5 次／分鐘／IP）
//   GET  ?op=pdfs            — 列出已上傳 PDF
//   POST ?op=sign            — 取得 Storage 簽名上傳 URL
//   POST ?op=finalize        — 上傳完成後寫入 pdfs 資料表
//   PATCH ?op=pdfs           — 更新標題／描述／分類
//   DELETE ?op=pdfs {id}     — 刪除 PDF（含儲存空間檔案）
//   GET  ?op=leaderboard     — 列出成績（最新 1000 筆）
//   DELETE ?op=leaderboard {ids} — 刪除指定成績
"use strict";
const { SB_URL, authConfigured, checkAuth, readBody, json, envError, serviceHeaders, sb, UUID_RE, safePath } = require("../lib/admin-util");
const { rateLimit } = require("../lib/game-util");

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

/* ---------- verify ---------- */
async function handleVerify(req, res) {
  if (!authConfigured()) {
    json(res, 500, { error: "伺服器未設定 ADMIN_USERNAME／ADMIN_PASSWORD 環境變數，請於 Vercel 專案設定後重新部署。" });
    return;
  }
  if (!rateLimit(req, 5, 60000)) { json(res, 429, { error: "嘗試次數過多，請一分鐘後再試。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "帳號或密碼不正確。" }); return; }
  json(res, 200, { ok: true });
}

/* ---------- pdfs: GET / PATCH / DELETE ---------- */
async function handlePdfs(req, res) {
  if (req.method === "GET") {
    const r = await sb("/rest/v1/pdfs?select=*&order=created_at.desc", { headers: serviceHeaders() });
    const text = await r.text();
    if (!r.ok) { json(res, 502, { error: "Supabase 讀取失敗：" + text.slice(0, 200) }); return; }
    let rows = [];
    try { rows = JSON.parse(text); } catch (e) { rows = []; }
    json(res, 200, { rows });
    return;
  }

  if (req.method === "PATCH") {
    const body = await readBody(req);
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) { json(res, 400, { error: "無效的 id。" }); return; }
    const patch = {};
    if (body.title != null) patch.title = String(body.title).trim().slice(0, 120);
    if (body.description != null) patch.description = String(body.description).slice(0, 500);
    if (body.tag != null) patch.tag = String(body.tag).trim().slice(0, 30);
    if (body.extra != null) patch.extra = !!body.extra;
    if (body.pages != null) patch.pages = String(body.pages).slice(0, 30);
    if (!Object.keys(patch).length) { json(res, 400, { error: "沒有要更新的欄位。" }); return; }
    const doPatch = (payload) =>
      sb("/rest/v1/pdfs?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify(payload)
      }).then((rr) => rr.text().then((t) => ({ ok: rr.ok, text: t })));
    let upd = await doPatch(patch);
    // 資料表尚未加 pages 欄時：退回不含頁數的更新
    if (!upd.ok && patch.pages && /pages/i.test(upd.text)) {
      delete patch.pages;
      upd = await doPatch(patch);
    }
    if (!upd.ok) { json(res, 502, { error: "更新失敗：" + upd.text.slice(0, 200) }); return; }
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE") {
    const body = await readBody(req);
    const id = String(body.id || "");
    if (!/^[0-9a-f-]{36}$/i.test(id)) { json(res, 400, { error: "無效的 id。" }); return; }
    // 先取得 storage_path
    const q = await sb("/rest/v1/pdfs?select=storage_path&id=eq." + encodeURIComponent(id), { headers: serviceHeaders() });
    const qtext = await q.text();
    let rows = [];
    try { rows = JSON.parse(qtext); } catch (e) {}
    const path = rows && rows[0] && rows[0].storage_path;
    if (path && safePath(path)) {
      await sb("/storage/v1/object/pdfs/" + path, { method: "DELETE", headers: serviceHeaders() });
    }
    const r = await sb("/rest/v1/pdfs?id=eq." + encodeURIComponent(id), {
      method: "DELETE",
      headers: serviceHeaders({ Prefer: "return=representation" })
    });
    if (!r.ok) {
      const text = await r.text();
      json(res, 502, { error: "刪除失敗：" + text.slice(0, 200) });
      return;
    }
    json(res, 200, { ok: true });
    return;
  }

  json(res, 405, { error: "Method not allowed" });
}

/* ---------- pdfs: sign ---------- */
async function handleSign(req, res) {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  const body = await readBody(req);
  const size = Number(body.size) || 0;
  const filename = String(body.filename || "file.pdf");
  if (!/\.pdf$/i.test(filename)) { json(res, 400, { error: "只接受 PDF 檔案。" }); return; }
  if (size <= 0 || size > MAX_SIZE) { json(res, 400, { error: "檔案大小須為 0–50MB。" }); return; }
  const path = "uploads/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + ".pdf";
  const r = await sb("/storage/v1/object/upload/sign/pdfs/" + path, {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ expiresIn: 3600 })
  });
  const text = await r.text();
  let j = {};
  try { j = JSON.parse(text); } catch (e) {}
  if (!r.ok || !j.url) { json(res, 502, { error: "取得上傳位址失敗：" + text.slice(0, 200) }); return; }
  // j.url 形如 /object/upload/sign/{bucket}/{path}?token=...，需加 /storage/v1 前綴
  json(res, 200, { path, uploadUrl: SB_URL + "/storage/v1" + j.url });
}

/* ---------- pdfs: finalize ---------- */
async function handleFinalize(req, res) {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  const body = await readBody(req);
  const path = String(body.path || "");
  const title = String(body.title || "").trim();
  if (!safePath(path) || !title) { json(res, 400, { error: "參數不完整。" }); return; }
  // 確認檔案真的已上傳
  const head = await fetch(SB_URL + "/storage/v1/object/public/pdfs/" + path, { method: "HEAD" });
  if (!head.ok) { json(res, 400, { error: "找不到已上傳的檔案，請重新上傳。" }); return; }
  const row = {
    title: title.slice(0, 120),
    description: String(body.description || "").slice(0, 500),
    tag: String(body.tag || "競賽資料").slice(0, 30),
    extra: !!body.extra,
    storage_path: path,
    file_size: Number(body.size) || null,
    filename: String(body.filename || "").slice(0, 200)
  };
  if (body.pages) row.pages = String(body.pages).slice(0, 30);
  const doInsert = (payload) =>
    sb("/rest/v1/pdfs", {
      method: "POST",
      headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
      body: JSON.stringify(payload)
    }).then((rr) => rr.text().then((t) => ({ ok: rr.ok, text: t })));
  let ins = await doInsert(row);
  // 資料表尚未加 pages 欄時：退回不含頁數的寫入
  if (!ins.ok && row.pages && /pages/i.test(ins.text)) {
    delete row.pages;
    ins = await doInsert(row);
  }
  if (!ins.ok) { json(res, 502, { error: "寫入資料庫失敗：" + ins.text.slice(0, 200) }); return; }
  let inserted = [];
  try { inserted = JSON.parse(ins.text); } catch (e) {}
  json(res, 200, { row: inserted[0] || row });
}

/* ---------- leaderboard: GET / DELETE ---------- */
async function handleLeaderboard(req, res) {
  if (req.method === "GET") {
    const r = await sb("/rest/v1/leaderboard?select=*&order=created_at.desc&limit=1000", {
      headers: serviceHeaders()
    });
    const text = await r.text();
    if (!r.ok) { json(res, 502, { error: "Supabase 讀取失敗：" + text.slice(0, 200) }); return; }
    let rows = [];
    try { rows = JSON.parse(text); } catch (e) { rows = []; }
    json(res, 200, { rows });
    return;
  }

  if (req.method === "DELETE") {
    const body = await readBody(req);
    const ids = Array.isArray(body.ids) ? body.ids.filter((i) => UUID_RE.test(String(i))) : [];
    if (!ids.length) { json(res, 400, { error: "沒有有效的記錄 id。" }); return; }
    const filter = "id=in.(\"" + ids.join("\",\"") + "\")";
    const r = await sb("/rest/v1/leaderboard?" + encodeURIComponent(filter), {
      method: "DELETE",
      headers: serviceHeaders({ Prefer: "return=representation" })
    });
    const text = await r.text();
    if (!r.ok) { json(res, 502, { error: "Supabase 刪除失敗：" + text.slice(0, 200) }); return; }
    let deleted = [];
    try { deleted = JSON.parse(text); } catch (e) { deleted = []; }
    json(res, 200, { deleted: deleted.length });
    return;
  }

  json(res, 405, { error: "Method not allowed" });
}

/* ---------- bank-override：題庫雲端覆寫層 ----------
   GET（公開）— 讀取覆寫層（競賽頁／主持台／管理後台套用）
   POST（管理員）— upsert 覆寫項 { entries: [{ q, origQ?, options, c, deleted? }] } */
async function handleBankOverrideGet(res) {
  const r = await sb("/rest/v1/question_overrides?select=*&bank=eq.guoqing&order=updated_at.desc&limit=3000", { headers: serviceHeaders() });
  const text = await r.text();
  if (!r.ok) { json(res, 502, { error: "讀取失敗：" + text.slice(0, 150) }); return; }
  let rows = [];
  try { rows = JSON.parse(text); } catch (e) { rows = []; }
  json(res, 200, { rows });
}

async function handleBankOverridePost(req, res) {
  const body = await readBody(req);
  const entries = Array.isArray(body.entries) ? body.entries : [];
  if (!entries.length) { json(res, 400, { error: "沒有要儲存的項目。" }); return; }
  const rows = [];
  const staleQ = [];  // 改題時須刪除的舊題文字行
  for (const e of entries) {
    const q = String(e.q || "").trim();
    if (!q || !Array.isArray(e.options) || e.options.length < 2) continue;
    const origQ = String(e.origQ || "").trim();
    if (origQ && origQ !== q) staleQ.push(origQ);
    rows.push({
      bank: "guoqing", q,
      options: e.options.map((o) => String(o == null ? "" : o)),
      c: Number.isInteger(e.c) && e.c >= 0 && e.c < e.options.length ? e.c : 0,
      deleted: !!e.deleted
    });
  }
  if (!rows.length) { json(res, 400, { error: "沒有有效的項目。" }); return; }
  // 題目文字曾被修改：先刪走以舊文字儲存的行（避免新舊兩版同時存在）
  if (staleQ.length) {
    const list = encodeURIComponent(staleQ.map((q) => "\"" + q + "\"").join(","));
    await sb("/rest/v1/question_overrides?bank=eq.guoqing&q=in.(" + list + ")", {
      method: "DELETE", headers: serviceHeaders()
    });
  }
  const r = await sb("/rest/v1/question_overrides?on_conflict=bank,q", {
    method: "POST",
    headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" }),
    body: JSON.stringify(rows)
  });
  if (!r.ok) {
    const t = await r.text();
    json(res, 502, { error: "儲存失敗：" + t.slice(0, 150) });
    return;
  }
  json(res, 200, { ok: true, saved: rows.length });
}

module.exports = async (req, res) => {
  const op = new URL(req.url, "http://x").searchParams.get("op") || "";
  try {
    if (op === "verify") {
      if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
      await handleVerify(req, res);
      return;
    }

    // 題庫覆寫層：GET 公開（唯讀，供競賽頁／主持台套用）
    if (op === "bank-override" && req.method === "GET") {
      if (!process.env.SUPABASE_SERVICE_KEY) { envError(res, "SUPABASE_SERVICE_KEY"); return; }
      if (!rateLimit(req, 120, 60000)) { json(res, 429, { error: "請稍後再試。" }); return; }
      await handleBankOverrideGet(res);
      return;
    }

    // 其餘操作一律需要管理員權限 + 已設定的服務金鑰
    if (!process.env.SUPABASE_SERVICE_KEY) { envError(res, "SUPABASE_SERVICE_KEY"); return; }
    if (!checkAuth(req)) { json(res, 401, { error: "帳號或密碼不正確。" }); return; }

    if (op === "pdfs") { await handlePdfs(req, res); return; }
    if (op === "sign") { await handleSign(req, res); return; }
    if (op === "finalize") { await handleFinalize(req, res); return; }
    if (op === "leaderboard") { await handleLeaderboard(req, res); return; }
    if (op === "bank-override") { await handleBankOverridePost(req, res); return; }

    json(res, 400, { error: "未知的操作。" });
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
