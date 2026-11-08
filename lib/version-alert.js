/**
 * Solana Foundation Delegation Program client floors.
 * The list is the public required-versions API, including epochs that have not started.
 */

function versionParts(value) {
  const text = String(value || "").trim();
  const [num, pre] = text.split("-");
  const nums = num.split(".").map(part => {
    const n = Number(part);
    return Number.isFinite(n) ? n : 0;
  });
  return { nums, pre: pre || null };
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  const len = Math.max(a.nums.length, b.nums.length);
  for (let i = 0; i < len; i += 1) {
    const av = a.nums[i] || 0;
    const bv = b.nums[i] || 0;
    if (av !== bv) return av > bv ? 1 : -1;
  }
  if (a.pre === b.pre) return 0;
  if (!a.pre) return 1;
  if (!b.pre) return -1;
  return a.pre > b.pre ? 1 : -1;
}

function meetsRange(version, min, max) {
  if (min && compareVersions(version, min) < 0) return false;
  if (max && compareVersions(version, max) > 0) return false;
  return true;
}

function clientRule(clientId, version) {
  const id = String(clientId || "");
  const major = versionParts(version).nums[0] || 0;
  if (/frankendancer/i.test(id) || (/firedancer/i.test(id) && major < 20)) {
    return { family: "firedancer", minKey: "firedancer_min_version", maxKey: "firedancer_max_version", name: "Frankendancer" };
  }
  if (/firedancer/i.test(id) || major >= 20) {
    return { family: "firedancer-full", minKey: "firedancer_full_min_version", maxKey: "firedancer_full_max_version", name: "Firedancer" };
  }
  return { family: "agave", minKey: "agave_min_version", maxKey: "agave_max_version", name: "Agave" };
}

function clientLabel(clientId, version) {
  const id = String(clientId || "");
  if (/jito/i.test(id)) return `Jito ${version}`;
  if (/agavebam/i.test(id)) return `AgaveBam ${version}`;
  if (/frankendancer/i.test(id)) return `Frankendancer ${version}`;
  if (/firedancer/i.test(id)) return `Firedancer ${version}`;
  if (/agave/i.test(id)) return `Agave ${version}`;
  return `${id || "client"} ${version}`.trim();
}

function clusterName(cluster) {
  return cluster === "testnet" ? "testnet" : "mainnet";
}

function requirementsUrl(cluster) {
  const anchor = cluster === "testnet" ? "testnet-required-versions" : "mainnet-required-versions";
  return `https://solana.org/delegation-criteria#${anchor}`;
}

function sourceLine(cluster) {
  return `\n\n<a href="${requirementsUrl(cluster)}">Foundation version list</a>`;
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function clockUtc(date) {
  const hh = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  return `${WEEKDAYS[date.getUTCDay()]} ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}, ${hh}:${mm} UTC`;
}

function aheadPhrase(epochsAhead, input) {
  const slotsInEpoch = Number(input.slotsInEpoch);
  const slotIndex = Number(input.slotIndex);
  const slotMs = Number(input.slotMs) || 200;
  if (!Number.isFinite(slotsInEpoch) || slotsInEpoch <= 0 || !Number.isFinite(slotIndex)) return "";
  const slotsLeft = Math.max(0, slotsInEpoch - slotIndex);
  const slots = slotsLeft + Math.max(0, epochsAhead - 1) * slotsInEpoch;
  const ms = slots * slotMs;
  const hours = ms / 3600000;
  const now = Number(input.now);
  const clock = Number.isFinite(now) ? `, around ${clockUtc(new Date(now + ms))}` : "";
  if (hours < 1) return ` That starts in under an hour${clock}.`;
  if (hours < 48) return ` That starts in about ${Math.max(1, Math.round(hours))} hours${clock}.`;
  return ` That starts in about ${Math.max(2, Math.round(hours / 24))} days${clock}.`;
}

/**
 * One warning for the soonest published epoch this client misses.
 * A node that meets every published epoch returns null.
 */
function versionWarning(input) {
  const version = input.version;
  const rules = Array.isArray(input.rules) ? input.rules : [];
  const epoch = Number(input.epoch);
  if (!version || !rules.length || !Number.isFinite(epoch)) return null;
  const rule = clientRule(input.clientId, version);
  const upcoming = rules
    .filter(row => Number(row.epoch) >= epoch)
    .sort((a, b) => Number(a.epoch) - Number(b.epoch));
  const miss = upcoming.find(row => !meetsRange(version, row[rule.minKey], row[rule.maxKey]));
  if (!miss) return null;
  const min = miss[rule.minKey];
  const when = Number(miss.epoch);
  const running = clientLabel(input.clientId, version);
  const network = clusterName(input.cluster);
  const floor = min ? `${rule.name} ${min} or newer` : `${rule.name} within the published range`;
  if (when <= epoch) {
    return {
      key: `${network}:${when}:${rule.family}:${min || ""}:now`,
      text: `⚠️ ${input.label} is running ${running}.\n\nThe Foundation minimum for ${network} epoch ${when} is ${floor}. That rule is already in effect. Upgrade to keep the Foundation stake.${sourceLine(input.cluster)}`
    };
  }
  return {
    key: `${network}:${when}:${rule.family}:${min || ""}:soon`,
    text: `⚠️ ${input.label} is running ${running}.\n\nThe Foundation requires ${floor} from ${network} epoch ${when}.${aheadPhrase(when - epoch, input)} Upgrade before that epoch to keep the Foundation stake.${sourceLine(input.cluster)}`
  };
}

/**
 * Check summary for a client that meets every published floor.
 * A missing list returns an empty string, so Check does not claim the node is fine.
 */
function versionClear(input) {
  if (versionWarning(input)) return "";
  const version = input.version;
  const rules = Array.isArray(input.rules) ? input.rules : [];
  const epoch = Number(input.epoch);
  if (!version || !rules.length || !Number.isFinite(epoch)) return "";
  const running = clientLabel(input.clientId, version);
  return `✅ ${input.label} is running ${running}. That meets every published Foundation floor.${sourceLine(input.cluster)}`;
}

module.exports = {
  compareVersions,
  meetsRange,
  clientRule,
  versionWarning,
  versionClear
};
