/**
 * One pass over every watched validator. Messages a chat only when the reading changes.
 * GET or POST /api/check
 * Auth: Authorization: Bearer CRON_SECRET
 */
const { mainKeyboard } = require("../lib/commands");
const { createStore } = require("../lib/store");
const { readFacts } = require("../lib/solana");
const { runAlerts } = require("../lib/run");
const { botToken, sendMessage } = require("../lib/telegram");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function authorized(req) {
  const header = req.headers.authorization || "";
  const secret = process.env.CRON_SECRET || "";
  if (secret && header === `Bearer ${secret}`) return true;
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) return false;
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/rest/v1/rpc/validator_alert_authorize`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) return false;
    return (await res.json()) === true;
  } catch {
    return false;
  }
}

module.exports = async function check(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    json(res, 405, { ok: false, error: "method not allowed" });
    return;
  }
  if (!(await authorized(req))) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  if (!botToken()) {
    json(res, 503, { ok: false, error: "VALIDATOR_ALERT_BOT_TOKEN is not set" });
    return;
  }
  const store = createStore();
  if (!store.configured()) {
    json(res, 503, { ok: false, error: "Storage is not configured" });
    return;
  }

  try {
    const subs = await store.listSubs();
    const alerts = await runAlerts({
      subs,
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts
    });
    let sent = 0;
    for (const alert of alerts) {
      await sendMessage(alert.chatId, alert.text, { reply_markup: mainKeyboard() });
      sent += 1;
    }
    json(res, 200, { ok: true, watchedChats: subs.length, sent });
  } catch (err) {
    console.error("validator alert check", err.message);
    json(res, 500, { ok: false, error: err.message });
  }
};
