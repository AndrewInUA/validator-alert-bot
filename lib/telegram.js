function botToken() {
  return process.env.VALIDATOR_ALERT_BOT_TOKEN || "";
}

async function telegram(method, payload) {
  const token = botToken();
  if (!token) throw new Error("VALIDATOR_ALERT_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(8000)
  });
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new Error(json.description || `Telegram ${method} failed`);
  return json.result;
}

function sendMessage(chatId, text, extra) {
  return telegram("sendMessage", {
    chat_id: chatId,
    text: String(text || "").slice(0, 4000),
    disable_web_page_preview: true,
    ...(extra || {})
  });
}

const COMMANDS = [
  { command: "start", description: "What this validator bot does" },
  { command: "watch", description: "Watch a vote account" },
  { command: "list", description: "Validators this chat watches" },
  { command: "unwatch", description: "Stop watching a vote account" },
  { command: "check", description: "Read every watched validator now" },
  { command: "help", description: "Commands" }
];

function setMyCommands() {
  return telegram("setMyCommands", { commands: COMMANDS });
}

function setWebhook(url, secret) {
  const payload = { url, allowed_updates: ["message"], drop_pending_updates: false };
  if (secret) payload.secret_token = secret;
  return telegram("setWebhook", payload);
}

module.exports = {
  botToken,
  sendMessage,
  setMyCommands,
  setWebhook,
  COMMANDS
};
