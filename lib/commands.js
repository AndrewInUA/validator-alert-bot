const { classifyWatch } = require("./classify");
const { isPubkey, looksLikeSeed, looksLikeKeypair, defaultLabel, shortKey } = require("./text");

const CLUSTERS = {
  mainnet: { id: "mainnet-beta", title: "mainnet" },
  testnet: { id: "testnet", title: "testnet" }
};

const MAX_WATCHES = 20;

const START = [
  "Validator alerts for operators.",
  "",
  "When a watched validator stops voting, this chat gets one message and the reason the public network can show. When it votes again, this chat gets one more message.",
  "",
  "Paste the vote account, then a name for yourself:",
  "<vote account> Practice node",
  "For testnet, put the word testnet first.",
  "The buttons below check the list, read it now, add, or remove."
].join("\n");

const ADD_HELP = [
  "Paste the vote account, then a name for yourself:",
  "<vote account> Practice node",
  "For testnet, put the word testnet first.",
  "Send it again with a name to rename one you already watch."
].join("\n");

function mainKeyboard() {
  return {
    keyboard: [
      [{ text: "Check" }, { text: "Watches" }],
      [{ text: "Add" }, { text: "Remove" }],
      [{ text: "Help" }]
    ],
    resize_keyboard: true,
    is_persistent: true,
    input_field_placeholder: "Paste a vote account"
  };
}

function removeKeyboard(watches) {
  return {
    keyboard: [
      ...watches.map((watch, index) => [{ text: watchButton(watch, index) }]),
      [{ text: "Keep them" }, { text: "Remove all" }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

function watchButton(watch, index) {
  return `${index + 1}. ${clusterTitle(watch.cluster)} ${shortKey(watch.vote)}`;
}

function pack(text, markup) {
  return { text, markup: markup || mainKeyboard() };
}

function parseCommand(text) {
  const match = String(text || "").trim().match(/^\/([a-z]+)(?:@\S+)?\s*/i);
  if (!match) return { command: null, body: String(text || "").trim() };
  return {
    command: match[1].toLowerCase(),
    body: String(text).trim().slice(match[0].length).trim()
  };
}

function parseWatchArgs(body) {
  const parts = String(body || "").split(/\s+/).filter(Boolean);
  if (!parts.length) return { error: "Send a vote account. Example: /watch <vote account>" };
  let clusterKey = "mainnet";
  let vote = null;
  const labelParts = [];
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === "mainnet" || lower === "testnet") {
      clusterKey = lower;
      continue;
    }
    if (!vote && isPubkey(part)) {
      vote = part;
      continue;
    }
    labelParts.push(part);
  }
  if (!vote) return { error: "That is not a vote account. Send the public vote address, not an identity and not a seed." };
  return { vote, clusterKey, label: labelParts.join(" ").trim() };
}

function clusterTitle(clusterId) {
  return clusterId === "testnet" ? "testnet" : "mainnet";
}

async function handleText(chatId, text, ctx) {
  const raw = String(text || "").trim();
  if (!raw) return pack("Paste a vote account, or tap Help.");
  if (looksLikeSeed(raw) || looksLikeKeypair(raw)) {
    return pack("Send the public vote account only.");
  }

  const { command } = parseCommand(raw);
  if (command === "start" || command === "help" || ["help", "/help", "/start", "start"].includes(raw.toLowerCase())) {
    return pack(START);
  }

  let sub = null;
  try {
    sub = await ctx.store.getSub(chatId);
  } catch {
    return pack("The watch list is not ready yet. Try again in a minute.");
  }
  const picked = matchWatchButton(raw, sub?.watches || []);
  if (picked) {
    return pack(await unwatch(chatId, picked.vote, ctx));
  }

  const button = raw.toLowerCase();
  if (button === "check" || button === "/check") return pack(await checkNow(chatId, ctx));
  if (button === "watches" || button === "list" || button === "/list") return pack(listWatches(sub));
  if (button === "add") return pack(ADD_HELP);
  if (button === "remove") return pack(removePrompt(sub), sub?.watches?.length ? removeKeyboard(sub.watches) : mainKeyboard());
  if (button === "keep them") return pack(listWatches(sub));
  if (button === "remove all") return pack(await unwatch(chatId, "all", ctx));
  const { command: named, body } = parseCommand(raw);
  if (named === "list") return pack(listWatches(sub));
  if (named === "check") return pack(await checkNow(chatId, ctx));
  if (named === "unwatch" || named === "stop") return pack(await unwatch(chatId, body, ctx));
  const watchBody = named === "watch" ? body : raw;
  const parsedWatch = parseWatchArgs(watchBody);
  if (named === "watch" || (!named && parsedWatch.vote)) {
    if (parsedWatch.error) return pack(parsedWatch.error);
    return pack(await addWatch(chatId, parsedWatch, ctx));
  }

  if (named) return pack("Tap Help to see what this bot does.");
  return pack("Paste a vote account to watch it, or tap Help.");
}

function matchWatchButton(text, watches) {
  const match = String(text || "").trim().match(/^(\d+)\.\s/);
  if (!match) return null;
  return watches[Number(match[1]) - 1] || null;
}

function removePrompt(sub) {
  const watches = sub?.watches || [];
  if (!watches.length) return "You are not watching a validator yet. Paste a vote account.";
  return "Tap a validator to stop watching it.";
}

function listWatches(sub) {
  const watches = sub?.watches || [];
  if (!watches.length) return "You are not watching a validator yet. Paste a vote account.";
  const lines = watches.map((watch, index) => {
    const identity = watch.identity ? `\n   Identity ${shortKey(watch.identity)}` : "";
    return `${watchButton(watch, index)}\n   ${watch.label}${identity}`;
  });
  return `Watching ${watches.length} validator${watches.length === 1 ? "" : "s"}.\n\n${lines.join("\n\n")}`;
}

async function checkNow(chatId, ctx) {
  const sub = await ctx.store.getSub(chatId);
  const watches = sub?.watches || [];
  if (!watches.length) return "You are not watching a validator yet. Send a vote account.";
  const lines = [];
  for (const watch of watches) {
    try {
      const facts = await ctx.readFacts(watch);
      lines.push(classifyWatch({ ...facts, label: watch.label }).reason);
    } catch (err) {
      lines.push(`${watch.label}: the network could not be read (${err.message}).`);
    }
  }
  return lines.join("\n\n");
}

async function unwatch(chatId, body, ctx) {
  const sub = await ctx.store.getSub(chatId);
  const watches = sub?.watches || [];
  if (!watches.length) return "You are not watching a validator yet.";
  if (!body) return "Send /unwatch and the vote account. /unwatch all drops every validator in this chat.";
  if (body.toLowerCase() === "all") {
    await ctx.store.saveSub({ ...sub, watches: [] });
    return "This chat is no longer watching any validator.";
  }
  const parsed = parseWatchArgs(body);
  if (parsed.error) return parsed.error;
  const cluster = CLUSTERS[parsed.clusterKey].id;
  const next = watches.filter(watch => !(watch.vote === parsed.vote && watch.cluster === cluster));
  if (next.length === watches.length) return "That vote account is not on your list.";
  await ctx.store.saveSub({ ...sub, watches: next });
  return "Removed. This chat will not be alerted for that validator.";
}

async function addWatch(chatId, parsed, ctx) {
  const cluster = CLUSTERS[parsed.clusterKey];
  const sub = (await ctx.store.getSub(chatId)) || { chatId: String(chatId), watches: [] };
  const existing = sub.watches.find(watch => watch.vote === parsed.vote && watch.cluster === cluster.id);
  if (existing) {
    if (!parsed.label || parsed.label === existing.label) {
      return "You are already watching that vote account.";
    }
    existing.label = parsed.label;
    await ctx.store.saveSub(sub);
    return `Name saved. Watching ${parsed.label} on ${cluster.title}.`;
  }
  if (sub.watches.length >= MAX_WATCHES) {
    return `This chat is already watching ${MAX_WATCHES} validators.`;
  }
  let found;
  try {
    found = await ctx.lookup(cluster.id, parsed.vote);
  } catch (err) {
    return `The ${cluster.title} network could not be read (${err.message}). Nothing was added.`;
  }
  if (!found) return `That vote account is not in the ${cluster.title} voting set. Nothing was added.`;
  const label = parsed.label || defaultLabel(cluster.title, parsed.vote);
  sub.watches.push({
    vote: parsed.vote,
    cluster: cluster.id,
    identity: found.identity,
    label
  });
  sub.chatId = String(chatId);
  await ctx.store.saveSub(sub);
  return `Watching ${label} on ${cluster.title}. I will message this chat when it changes.\n\nRight now: ${found.summary}`;
}

module.exports = {
  CLUSTERS,
  MAX_WATCHES,
  START,
  mainKeyboard,
  parseCommand,
  parseWatchArgs,
  handleText
};
