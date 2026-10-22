/**
 * Register the webhook once, after this project is deployed.
 * GET /api/setup
 * Auth: Authorization: Bearer CRON_SECRET
 */
const { botToken, setWebhook, setMyCommands } = require("../lib/telegram");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

module.exports = async function setup(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    json(res, 405, { ok: false, error: "method not allowed" });
    return;
  }
  const secret = process.env.CRON_SECRET || "";
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  if (!botToken()) {
    json(res, 503, { ok: false, error: "VALIDATOR_ALERT_BOT_TOKEN is not set" });
    return;
  }
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  const hookUrl = `${proto}://${host}/api/telegram`;
  try {
    const webhook = await setWebhook(hookUrl, process.env.VALIDATOR_ALERT_WEBHOOK_SECRET);
    const commands = await setMyCommands();
    json(res, 200, { ok: true, hookUrl, webhook, commands });
  } catch (err) {
    json(res, 502, { ok: false, error: err.message });
  }
};
