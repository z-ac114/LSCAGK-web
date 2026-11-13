// POST /api/admin/verify — 驗證管理員密碼
"use strict";
const { checkAuth, json, envError } = require("../../lib/admin-util");

module.exports = async (req, res) => {
  if (req.method !== "POST") { json(res, 405, { error: "Method not allowed" }); return; }
  if (!process.env.ADMIN_PASSWORD) { envError(res, "ADMIN_PASSWORD"); return; }
  if (!checkAuth(req)) { json(res, 401, { error: "密碼不正確。" }); return; }
  json(res, 200, { ok: true });
};
