// POST /api/admin/verify — 驗證管理員帳密
// 安全：每 IP 每分鐘 5 次嘗試，減慢網上暴力破解
"use strict";
const { authConfigured, checkAuth, json } = require("../../lib/admin-util");
const { rateLimit } = require("../../lib/game-util");

module.exports = async (req, res) => {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!authConfigured()) {
    json(res, 500, { error: "伺服器未設定 ADMIN_USERNAME／ADMIN_PASSWORD 環境變數，請於 Vercel 專案設定後重新部署。" });
    return;
  }
  if (!rateLimit(req, 5, 60000)) { json(res, 429, { error: "嘗試次數過多，請一分鐘後再試。" }); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "帳號或密碼不正確。" }); return; }
  json(res, 200, { ok: true });
};
