// /api/admin/pdfs
//   GET              — 列出已上傳 PDF
//   POST ?op=sign    — 取得 Supabase Storage 簽名上傳 URL（瀏覽器直傳，避開函數 4.5MB 限制）
//   POST ?op=finalize— 上傳完成後寫入 pdfs 資料表
//   PATCH            — 更新標題／描述／分類 { id, title?, description?, tag?, extra? }
//   DELETE           — 刪除 PDF { id }（同時刪除儲存空間檔案）
"use strict";
const { SB_URL, checkAuth, readBody, json, envError, serviceHeaders, sb, safePath } = require("../../lib/admin-util");

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

function bad(msg) { return { ok: false, msg }; }

module.exports = async (req, res) => {
  if (!process.env.ADMIN_PASSWORD) { envError(res, "ADMIN_PASSWORD"); return; }
  if (!process.env.SUPABASE_SERVICE_KEY) { envError(res, "SUPABASE_SERVICE_KEY"); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "密碼不正確。" }); return; }

  try {
    /* ---------- GET：清單 ---------- */
    if (req.method === "GET") {
      const r = await sb("/rest/v1/pdfs?select=*&order=created_at.desc", { headers: serviceHeaders() });
      const text = await r.text();
      if (!r.ok) { json(res, 502, { error: "Supabase 讀取失敗：" + text.slice(0, 200) }); return; }
      let rows = [];
      try { rows = JSON.parse(text); } catch (e) { rows = []; }
      json(res, 200, { rows });
      return;
    }

    /* ---------- POST：sign / finalize ---------- */
    if (req.method === "POST") {
      const op = (req.query && req.query.op) || new URL(req.url, "http://x").searchParams.get("op") || "";
      const body = await readBody(req);

      if (op === "sign") {
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
        json(res, 200, { path, uploadUrl: SB_URL + j.url });
        return;
      }

      if (op === "finalize") {
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
        const r = await sb("/rest/v1/pdfs", {
          method: "POST",
          headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
          body: JSON.stringify(row)
        });
        const text = await r.text();
        if (!r.ok) { json(res, 502, { error: "寫入資料庫失敗：" + text.slice(0, 200) }); return; }
        let inserted = [];
        try { inserted = JSON.parse(text); } catch (e) {}
        json(res, 200, { row: inserted[0] || row });
        return;
      }

      json(res, 400, { error: "未知的操作。" });
      return;
    }

    /* ---------- PATCH：更新資料 ---------- */
    if (req.method === "PATCH") {
      const body = await readBody(req);
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) { json(res, 400, { error: "無效的 id。" }); return; }
      const patch = {};
      if (body.title != null) patch.title = String(body.title).trim().slice(0, 120);
      if (body.description != null) patch.description = String(body.description).slice(0, 500);
      if (body.tag != null) patch.tag = String(body.tag).trim().slice(0, 30);
      if (body.extra != null) patch.extra = !!body.extra;
      if (!Object.keys(patch).length) { json(res, 400, { error: "沒有要更新的欄位。" }); return; }
      const r = await sb("/rest/v1/pdfs?id=eq." + encodeURIComponent(id), {
        method: "PATCH",
        headers: serviceHeaders({ "Content-Type": "application/json", Prefer: "return=representation" }),
        body: JSON.stringify(patch)
      });
      const text = await r.text();
      if (!r.ok) { json(res, 502, { error: "更新失敗：" + text.slice(0, 200) }); return; }
      json(res, 200, { ok: true });
      return;
    }

    /* ---------- DELETE：刪除 ---------- */
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
  } catch (err) {
    json(res, 500, { error: "伺服器錯誤：" + String(err && err.message || err) });
  }
};
