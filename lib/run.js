const { classifyWatch, foldReading, strikesFor } = require("./classify");
const { balanceNote, BALANCE_CHANGE_LAMPORTS, TRUSTED_JUMP_LAMPORTS } = require("./balance");
const { linkedLabel } = require("./html");
const { versionWarning } = require("./version-alert");
const { stakeLine } = require("./stake-line");

function watchKey(watch) {
  return `${watch.cluster}:${watch.vote}`;
}

/**
 * One pass over every watched vote account.
 * Sends only when the confirmed reading changes. Each operator gets their own label.
 */
async function runAlerts({ subs, getStatus, setStatus, readFacts, readCluster, readRules, readStake }) {
  const alerts = [];
  const done = new Set();
  const nodesByCluster = new Map();
  const rulesByCluster = new Map();
  async function nodesFor(cluster) {
    if (!readCluster) return null;
    if (!nodesByCluster.has(cluster)) {
      try {
        nodesByCluster.set(cluster, await readCluster(cluster));
      } catch {
        nodesByCluster.set(cluster, null);
      }
    }
    return nodesByCluster.get(cluster);
  }
  async function rulesFor(cluster) {
    if (!readRules) return null;
    if (!rulesByCluster.has(cluster)) {
      try {
        rulesByCluster.set(cluster, await readRules(cluster));
      } catch {
        rulesByCluster.set(cluster, null);
      }
    }
    return rulesByCluster.get(cluster);
  }
  for (const sub of subs) {
    for (const watch of sub.watches || []) {
      const key = watchKey(watch);
      if (done.has(key)) continue;
      done.add(key);
      let facts;
      try {
        facts = await readFacts(watch);
      } catch {
        facts = { unreadable: true, slot: 0 };
      }
      const previous = (await getStatus(key)) || {};
      const reading = classifyWatch({ ...facts, label: watch.label });
      const folded = foldReading(previous, reading, strikesFor(reading));
      const epochNow = Number(facts.epoch);
      const epochWas = Number(previous.seenEpoch);
      const rolled = Number.isFinite(epochNow) && Number.isFinite(epochWas) && epochNow > epochWas;
      const lamportsNow = Number(facts.lamports);
      const lamportsWas = Number(previous.seenLamports);
      const pendingLamports = Number(previous.pendingLamports);
      const jump = Number.isFinite(lamportsNow) && Number.isFinite(lamportsWas)
        && Math.abs(lamportsNow - lamportsWas) > TRUSTED_JUMP_LAMPORTS;
      const jumpConfirmed = jump && Number.isFinite(pendingLamports)
        && Math.abs(lamportsNow - pendingLamports) < BALANCE_CHANGE_LAMPORTS;
      const trustedLamports = !Number.isFinite(lamportsNow) || (jump && !jumpConfirmed)
        ? (Number.isFinite(lamportsWas) ? lamportsWas : null)
        : lamportsNow;
      const balanceMoved = Number.isFinite(trustedLamports) && Number.isFinite(lamportsWas)
        && Math.abs(trustedLamports - lamportsWas) >= BALANCE_CHANGE_LAMPORTS;
      const identity = watch.identity || facts.current?.nodePubkey || facts.delinquent?.nodePubkey;
      const nodes = await nodesFor(watch.cluster);
      const client = identity && nodes ? nodes.find(node => node.pubkey === identity) : null;
      const rules = client?.version ? await rulesFor(watch.cluster) : null;
      const warning = client?.version && rules
        ? versionWarning({
          ...facts,
          label: watch.label,
          cluster: watch.cluster,
          clientId: client.clientId,
          version: client.version,
          rules
        })
        : null;
      const versionKey = warning ? warning.key : (rules ? "ok" : (previous.seenVersionRule ?? null));
      const versionChanged = versionKey !== previous.seenVersionRule
        && (Boolean(warning) || (previous.seenVersionRule && previous.seenVersionRule !== "ok"));
      let stakeText = "";
      if (folded.send && watch.cluster !== "testnet" && readStake) {
        try {
          stakeText = stakeLine(await readStake(watch)) || "";
        } catch {
          stakeText = "";
        }
      }
      await setStatus(key, {
        ...folded.state,
        seenEpoch: Number.isFinite(epochNow) ? epochNow : (previous.seenEpoch ?? null),
        seenLamports: Number.isFinite(trustedLamports) ? trustedLamports : (previous.seenLamports ?? null),
        pendingLamports: jump && !jumpConfirmed ? lamportsNow : null,
        seenVersionRule: versionKey
      });
      const told = new Set();
      for (const other of subs) {
        for (const item of other.watches || []) {
          if (item.cluster !== watch.cluster || item.vote !== watch.vote) continue;
          const once = `${other.chatId}:${item.cluster}:${item.vote}`;
          if (told.has(once)) continue;
          told.add(once);
          if (folded.send) {
            const personal = classifyWatch({
              ...facts,
              label: item.label,
              vote: item.vote,
              cluster: item.cluster
            });
            alerts.push({
              chatId: other.chatId,
              text: stakeText ? `${personal.reason}\n\n${stakeText}` : personal.reason,
              balanceNotes: Boolean(other.balanceNotes)
            });
          }
          if (!(rolled || balanceMoved) || !other.balanceNotes) continue;
          const text = balanceNote({
            ...facts,
            lamports: trustedLamports,
            label: item.label,
            vote: item.vote,
            cluster: item.cluster,
            prevLamports: previous.seenLamports,
            now: Date.now()
          });
          if (text) {
            alerts.push({ chatId: other.chatId, text, balanceNotes: true });
          }
        }
      }
      if (!versionChanged || !warning) continue;
      const toldVersion = new Set();
      for (const other of subs) {
        for (const item of other.watches || []) {
          if (item.cluster !== watch.cluster || item.vote !== watch.vote) continue;
          const once = `${other.chatId}:${item.cluster}:${item.vote}`;
          if (toldVersion.has(once)) continue;
          toldVersion.add(once);
          alerts.push({
            chatId: other.chatId,
            text: warning.text.replace(watch.label, linkedLabel(item.label, item.vote, item.cluster)),
            balanceNotes: Boolean(other.balanceNotes)
          });
        }
      }
    }
  }
  return alerts;
}

module.exports = {
  watchKey,
  runAlerts
};
