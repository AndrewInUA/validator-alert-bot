const { classifyWatch } = require("./classify");
const { balanceNote } = require("./balance");
const { versionWarning, versionClear } = require("./version-alert");
const { stakeLine } = require("./stake-line");
const { stakeReport } = require("./stake-report");
const { escapeHtml, linkedLabel } = require("./html");
const { isPubkey, looksLikeSeed, looksLikeKeypair, defaultLabel, shortKey } = require("./text");

const CLUSTERS = {
  mainnet: { id: "mainnet-beta", title: "mainnet" },
  testnet: { id: "testnet", title: "testnet" }
};

const MAX_WATCHES = 20;

const START = [
  "Validator alerts for operators.",
  "",
  "When a watched validator stops voting, this chat gets one message and the reason the public network can show. When it votes again, this chat gets one more message. A mainnet message also shows stake size, split between the Foundation and other sources.",
  "",
  "Stake lists mainnet stake by pool: the Foundation, then each pool and the SOL it delegates.",
  "",
  "Paste the vote account, then a name for yourself:",
  "<vote account> Practice node",
  "For testnet, put the word testnet first.",
  "The buttons below check the list, read stake by pool, add, remove, or turn balance notes on."
].join("\n");

const ADD_HELP = [
  "Paste the vote account, then a name for yourself:",
  "<vote account> Practice node",
  "For testnet, put the word testnet first.",
  "Send it again with a name to rename one you already watch."
].join("\n");

function mainKeyboard(balanceOn) {
  return {
    keyboard: [
      [{ text: "Check" }, { text: "Stake" }],
      [{ text: "Watches" }, { text: "Add" }],
      [{ text: "Remove" }, { text: "Help" }],
      [{ text: balanceOn ? "🔕 Turn balance notes off" : "🔔 Turn balance notes on" }]
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

function pack(text, sub, markup) {
  return { text, markup: markup || mainKeyboard(Boolean(sub?.balanceNotes)) };
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

  let sub = null;
  let storeReady = true;
  try {
    sub = await ctx.store.getSub(chatId);
  } catch {
    storeReady = false;
  }

  const { command } = parseCommand(raw);
  if (command === "start" || command === "help" || ["help", "/help", "/start", "start"].includes(raw.toLowerCase())) {
    return pack(START, sub);
  }
  if (!storeReady) return pack("The watch list is not ready yet. Try again in a minute.", null);

  const picked = matchWatchButton(raw, sub?.watches || []);
  if (picked) {
    return pack(await unwatch(chatId, picked.vote, ctx), sub);
  }

  const button = raw.toLowerCase();
  if (button === "check" || button === "/check") return pack(await checkNow(chatId, ctx), sub);
  if (button === "stake" || button === "/stake") return pack(await stakeNow(chatId, ctx), sub);
  if (button === "watches" || button === "list" || button === "/list") return pack(listWatches(sub), sub);
  if (button === "add") return pack(ADD_HELP, sub);
  const balanceChoice = balanceChoiceFrom(button);
  if (balanceChoice != null) {
    const turned = await setBalance(chatId, sub, ctx, balanceChoice);
    return pack(turned.text, { balanceNotes: turned.balanceNotes });
  }
  if (button === "remove") {
    return pack(removePrompt(sub), sub, sub?.watches?.length ? removeKeyboard(sub.watches) : mainKeyboard(sub?.balanceNotes));
  }
  if (button === "keep them") return pack(listWatches(sub), sub);
  if (button === "remove all") return pack(await unwatch(chatId, "all", ctx), sub);
  const { command: named, body } = parseCommand(raw);
  if (named === "list") return pack(listWatches(sub), sub);
  if (named === "check") return pack(await checkNow(chatId, ctx), sub);
  if (named === "stake") return pack(await stakeNow(chatId, ctx), sub);
  if (named === "unwatch" || named === "stop") return pack(await unwatch(chatId, body, ctx), sub);
  const watchBody = named === "watch" ? body : raw;
  const parsedWatch = parseWatchArgs(watchBody);
  if (named === "watch" || (!named && parsedWatch.vote)) {
    if (parsedWatch.error) return pack(parsedWatch.error, sub);
    return pack(await addWatch(chatId, parsedWatch, ctx), sub);
  }

  if (named) return pack("Tap Help to see what this bot does.", sub);
  return pack("Paste a vote account to watch it, or tap Help.", sub);
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
    return `${watchButton(watch, index)}\n   ${escapeHtml(watch.label)}${identity}`;
  });
  return `Watching ${watches.length} validator${watches.length === 1 ? "" : "s"}.\n\n${lines.join("\n\n")}`;
}

function balanceChoiceFrom(button) {
  if (button.endsWith("turn balance notes on") || button === "balance") return true;
  if (button.endsWith("turn balance notes off")) return false;
  if (button.endsWith("balance notes on") || button === "balance on") return true;
  if (button.endsWith("balance notes off")) return false;
  return null;
}

async function setBalance(chatId, sub, ctx, balanceNotes) {
  if (Boolean(sub?.balanceNotes) !== balanceNotes) {
    await ctx.store.saveSub({
      chatId: String(chatId),
      watches: sub?.watches || [],
      balanceNotes
    });
  }
  if (!balanceNotes) {
    return { balanceNotes, text: "Balance notes are off. Voting alerts stay on." };
  }
  const watches = sub?.watches || [];
  const lines = ["Balance notes are on. This chat gets a message when a vote account balance changes."];
  if (!watches.length) lines.push("Paste a vote account to include it.");
  for (const watch of watches) {
    try {
      const facts = await ctx.readFacts(watch);
      const note = balanceNote({
        ...facts,
        label: watch.label,
        vote: watch.vote,
        cluster: watch.cluster,
        now: Date.now()
      });
      lines.push(note || `⚠️ ${linkedLabel(watch.label, watch.vote, watch.cluster)} is already short of the 0.8 SOL ticket. That alarm stays on.`);
    } catch (err) {
      lines.push(`${linkedLabel(watch.label, watch.vote, watch.cluster)}: the network could not be read (${escapeHtml(err.message)}).`);
    }
  }
  return { balanceNotes, text: lines.join("\n\n") };
}

function uniqueWatches(watches) {
  const seen = new Set();
  const unique = [];
  for (const watch of watches || []) {
    const key = `${watch.cluster}:${watch.vote}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(watch);
  }
  return unique;
}

function networkName(cluster) {
  return cluster === "testnet" ? "testnet" : "mainnet";
}

const HOSTS = {
  "70.40.184.93": "Frankfurt",
  "185.8.107.72": "Chicago",
  "149.50.96.189": "Warsaw"
};

function hostLine(client) {
  const ip = String(client?.gossip || "").split(":")[0];
  if (!ip) return "";
  const name = HOSTS[ip];
  const where = name ? `${escapeHtml(name)} ${escapeHtml(ip)}` : escapeHtml(ip);
  return `Voting from ${where}.`;
}

async function stakeSentence(watch, ctx, cache) {
  if (watch.cluster === "testnet" || !ctx.readStake) return "";
  const key = `${watch.cluster}:${watch.vote}`;
  if (!cache.stake.has(key)) {
    try {
      cache.stake.set(key, stakeLine(await ctx.readStake(watch)) || "");
    } catch {
      cache.stake.set(key, "");
    }
  }
  return cache.stake.get(key);
}

async function clientFor(watch, facts, ctx, cache) {
  if (!ctx.readCluster) return null;
  const identity = watch.identity || facts.current?.nodePubkey || facts.delinquent?.nodePubkey;
  if (!identity) return null;
  if (!cache.nodes.has(watch.cluster)) {
    cache.nodes.set(watch.cluster, await ctx.readCluster(watch.cluster));
  }
  const nodes = cache.nodes.get(watch.cluster);
  return Array.isArray(nodes) ? nodes.find(node => node.pubkey === identity) || null : null;
}

async function openVersionWarning(watch, facts, ctx, cache) {
  if (!ctx.readCluster || !ctx.readRules) return "";
  const identity = watch.identity || facts.current?.nodePubkey || facts.delinquent?.nodePubkey;
  if (!identity) return "";
  try {
    if (!cache.nodes.has(watch.cluster)) {
      cache.nodes.set(watch.cluster, await ctx.readCluster(watch.cluster));
    }
    const nodes = cache.nodes.get(watch.cluster);
    const client = Array.isArray(nodes) ? nodes.find(node => node.pubkey === identity) : null;
    if (!client?.version) return "";
    if (!cache.rules.has(watch.cluster)) {
      cache.rules.set(watch.cluster, await ctx.readRules(watch.cluster));
    }
    const rules = cache.rules.get(watch.cluster);
    if (!Array.isArray(rules) || !rules.length) return "";
    const warning = versionWarning({
      ...facts,
      label: watch.label,
      cluster: watch.cluster,
      clientId: client.clientId,
      version: client.version,
      rules
    });
    const text = warning
      ? warning.text
      : versionClear({
        ...facts,
        label: watch.label,
        cluster: watch.cluster,
        clientId: client.clientId,
        version: client.version,
        rules
      });
    if (!text) return "";
    return text.replace(watch.label, linkedLabel(watch.label, watch.vote, watch.cluster));
  } catch {
    return "";
  }
}

async function stakeNow(chatId, ctx) {
  const sub = await ctx.store.getSub(chatId);
  const watches = uniqueWatches(sub?.watches);
  if (!watches.length) return "You are not watching a validator yet. Paste a vote account.";
  const mainnet = watches.filter(watch => watch.cluster !== "testnet");
  if (!mainnet.length) return "Stake by pool is a mainnet reading. Paste a mainnet vote account to see it.";
  if (!ctx.readStakeDetail || !ctx.readPools) return "The pool list is not ready yet. Try again in a minute.";
  let directory;
  try {
    directory = await ctx.readPools();
  } catch {
    return "The pool list could not be read. Try again in a minute.";
  }
  if (!directory) return "The pool list could not be read. Try again in a minute.";
  const blocks = [];
  for (const watch of mainnet) {
    try {
      const detail = await ctx.readStakeDetail(watch);
      if (!detail) {
        blocks.push(`${linkedLabel(watch.label, watch.vote, watch.cluster)} on mainnet: stake could not be read.`);
        continue;
      }
      blocks.push(stakeReport({
        ...detail,
        label: watch.label,
        vote: watch.vote,
        cluster: watch.cluster,
        directory
      }));
    } catch (err) {
      blocks.push(`${linkedLabel(watch.label, watch.vote, watch.cluster)} on mainnet: the stake accounts could not be read (${escapeHtml(err.message)}).`);
    }
  }
  return blocks.join("\n\n");
}

async function checkNow(chatId, ctx) {
  const sub = await ctx.store.getSub(chatId);
  const watches = uniqueWatches(sub?.watches);
  if (!watches.length) return "You are not watching a validator yet. Send a vote account.";
  if (watches.length !== (sub.watches || []).length) {
    await ctx.store.saveSub({ ...sub, watches });
  }
  const lines = [];
  const cache = { nodes: new Map(), rules: new Map(), stake: new Map() };
  for (const watch of watches) {
    try {
      const facts = await ctx.readFacts(watch);
      const reason = classifyWatch({
        ...facts,
        label: watch.label,
        vote: watch.vote,
        cluster: watch.cluster
      }).reason;
      const stake = await stakeSentence(watch, ctx, cache);
      let host = "";
      try {
        host = hostLine(await clientFor(watch, facts, ctx, cache));
      } catch {
        host = "";
      }
      const version = await openVersionWarning(watch, facts, ctx, cache);
      lines.push([reason, stake, host, version].filter(Boolean).join("\n\n"));
    } catch (err) {
      lines.push(`${linkedLabel(watch.label, watch.vote, watch.cluster)} on ${networkName(watch.cluster)}: the network could not be read (${escapeHtml(err.message)}).`);
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
    return `Name saved. Watching ${escapeHtml(parsed.label)} on ${cluster.title}.`;
  }
  if (sub.watches.length >= MAX_WATCHES) {
    return `This chat is already watching ${MAX_WATCHES} validators.`;
  }
  let found;
  try {
    found = await ctx.lookup(cluster.id, parsed.vote);
  } catch (err) {
    return `The ${cluster.title} network could not be read (${escapeHtml(err.message)}). Nothing was added.`;
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
  let now = `Right now: ${found.summary}`;
  if (cluster.id !== "testnet" && ctx.readStake) {
    try {
      const line = stakeLine(await ctx.readStake({ vote: parsed.vote, cluster: cluster.id }));
      if (line) now = `${now}\n\n${line}`;
    } catch {
      /* the watch is saved; the next check can read stake */
    }
  }
  return `Watching ${escapeHtml(label)} on ${cluster.title}. I will message this chat when it changes.\n\n${now}`;
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
