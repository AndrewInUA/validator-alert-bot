/**
 * Telegram webhook for the validator alert bot.
 * POST /api/telegram
 * Env: VALIDATOR_ALERT_BOT_TOKEN, VALIDATOR_ALERT_WEBHOOK_SECRET, KV_REST_API_*
 */
const { handleText, mainKeyboard } = require("../lib/commands");
const { createStore } = require("../lib/store");
const { lookupVote, readFacts } = require("../lib/solana");
const { botToken, sendMessage } = require("../lib/telegram");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
    } catch {
      return Promise.resolve(null);
    }
  }
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", chunk => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

module.exports = async function telegramWebhook(req, res) {
  if (req.method === "GET") {
    json(res, 200, { ok: true, service: "validator-alert-bot" });
    return;
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    json(res, 405, { ok: false, error: "method not allowed" });
    return;
  }
  if (!botToken()) {
    json(res, 503, { ok: false, error: "VALIDATOR_ALERT_BOT_TOKEN is not set" });
    return;
  }
  const secret = process.env.VALIDATOR_ALERT_WEBHOOK_SECRET;
  if (secret && req.headers["x-telegram-bot-api-secret-token"] !== secret) {
    json(res, 401, { ok: false, error: "unauthorized" });
    return;
  }

  let update;
  try {
    update = await readBody(req);
  } catch {
    json(res, 400, { ok: false, error: "bad json" });
    return;
  }

  const message = update?.message;
  const text = message?.text;
  const chatId = message?.chat?.id;
  if (!text || chatId == null) {
    json(res, 200, { ok: true, ignored: true });
    return;
  }

  const store = createStore();
  try {
    const reply = await handleText(chatId, text, { store, lookup: lookupVote, readFacts });
    const body = reply && typeof reply === "object" ? reply.text : reply;
    const markup = (reply && reply.markup) || mainKeyboard();
    if (body) await sendMessage(chatId, body, { reply_markup: markup });
    json(res, 200, { ok: true });
  } catch (err) {
    console.error("validator alert webhook", err.message);
    try {
      await sendMessage(chatId, "The bot could not finish that. Nothing was changed.");
    } catch {
      /* the chat may be unreachable */
    }
    json(res, 200, { ok: false });
  }
};
