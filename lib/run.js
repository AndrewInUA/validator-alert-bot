const { classifyWatch, foldReading, strikesFor, VAT_LAMPORTS } = require("./classify");
const { balanceNote, TARGET_EPOCHS, BALANCE_CHANGE_LAMPORTS, TRUSTED_JUMP_LAMPORTS } = require("./balance");
const { profitLine } = require("./profit");
const { linkedLabel } = require("./html");
const { versionWarning } = require("./version-alert");
const { stakeLine } = require("./stake-line");

function watchKey(watch) {
  return `${watch.cluster}:${watch.vote}`;
}

function balanceKind(lamports, rent) {
  const amount = Number(lamports);
  const exempt = Number(rent);
  if (!Number.isFinite(amount) || !Number.isFinite(exempt)) return null;
  const above = amount - exempt;
  if (above < VAT_LAMPORTS) return "short";
  return Math.floor(above / VAT_LAMPORTS) >= TARGET_EPOCHS ? "ok" : "topup";
}

function notesAudience(subs, watch) {
  return subs.some(sub => sub.balanceNotes && (sub.watches || []).some(item =>
    item.cluster === watch.cluster && item.vote === watch.vote
  ));
}

/**
 * One pass over every watched vote account.
 * Sends only when the confirmed reading changes. Each operator gets their own label.
 */
async function runAlerts({ subs, getStatus, setStatus, readFacts, readCluster, readRules, readStake, readEpochReward }) {
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
      const balanceUntrusted = jump && !jumpConfirmed;
      const trustedLamports = !Number.isFinite(lamportsNow) || balanceUntrusted
        ? (Number.isFinite(lamportsWas) ? lamportsWas : null)
        : lamportsNow;
      const balanceMoved = Number.isFinite(trustedLamports) && Number.isFinite(lamportsWas)
        && Math.abs(trustedLamports - lamportsWas) >= BALANCE_CHANGE_LAMPORTS;
      // Testnet credits the vote account just after the epoch opens, often by
      // more than the trusted jump. Hold the epoch note until that balance
      // settles so the chat gets one message, not the old balance and the new one.
      const waitingEpoch = Boolean(previous.epochNotePending);
      const epochDue = rolled || waitingEpoch;
      const holdEpochNote = epochDue && (balanceUntrusted || (rolled && !waitingEpoch && !balanceMoved));
      const releaseEpochNote = epochDue && !holdEpochNote;
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
      const rulesReady = Array.isArray(rules) && rules.length > 0;
      const versionKey = warning ? warning.key : (rulesReady ? "ok" : (previous.seenVersionRule ?? null));
      let versionSent = Array.isArray(previous.versionSent) ? previous.versionSent.filter(key => typeof key === "string") : [];
      if (!versionSent.length) {
        const remembered = previous.versionAlerted
          || (previous.seenVersionRule && previous.seenVersionRule !== "ok" ? previous.seenVersionRule : null);
        if (remembered) versionSent = [remembered];
      }
      let versionChanged = false;
      if (warning && !versionSent.includes(warning.key)) {
        versionChanged = true;
        versionSent = [...versionSent, warning.key].slice(-8);
      }
      const kind = balanceKind(trustedLamports, facts.rentLamports);
      const notesWanted = releaseEpochNote || (balanceMoved && !epochDue);
      const alreadyTold = Number(previous.balanceNoteEpoch) === epochNow && previous.balanceNoteKind === kind;
      const tellBalance = notesWanted && !alreadyTold && kind && kind !== "short" && notesAudience(subs, watch);
      const closedEpoch = Number.isFinite(epochNow) ? epochNow - 1 : null;
      let seenProfitEpoch = Number(previous.seenProfitEpoch);
      if (!Number.isFinite(seenProfitEpoch)) seenProfitEpoch = null;
      const profitWanted = watch.cluster === "mainnet-beta"
        && closedEpoch != null
        && closedEpoch >= 0
        && (seenProfitEpoch == null || seenProfitEpoch < closedEpoch);
      let rewardRow = null;
      if (profitWanted && readEpochReward && !holdEpochNote) {
        try {
          rewardRow = await readEpochReward(watch, closedEpoch);
          if (rewardRow) seenProfitEpoch = closedEpoch;
        } catch {
          rewardRow = null;
        }
      }
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
        seenLamports: holdEpochNote
          ? (Number.isFinite(lamportsWas) ? lamportsWas : (previous.seenLamports ?? null))
          : (Number.isFinite(trustedLamports) ? trustedLamports : (previous.seenLamports ?? null)),
        pendingLamports: balanceUntrusted ? lamportsNow : null,
        epochNotePending: holdEpochNote,
        balanceNoteEpoch: tellBalance && Number.isFinite(epochNow) ? epochNow : (previous.balanceNoteEpoch ?? null),
        balanceNoteKind: tellBalance ? kind : (previous.balanceNoteKind ?? null),
        seenVersionRule: versionKey,
        versionSent,
        seenProfitEpoch
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
          const noteText = tellBalance && other.balanceNotes
            ? balanceNote({
              ...facts,
              lamports: trustedLamports,
              label: item.label,
              vote: item.vote,
              cluster: item.cluster,
              prevLamports: previous.seenLamports,
              now: Date.now()
            })
            : "";
          const earnedText = rewardRow && other.balanceNotes
            ? profitLine({
              ...rewardRow,
              label: item.label,
              vote: item.vote,
              cluster: item.cluster
            })
            : "";
          const text = [noteText, earnedText].filter(Boolean).join(" ");
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
  const seen = new Set();
  return alerts.filter(alert => {
    const once = `${alert.chatId}\n${alert.text}`;
    if (seen.has(once)) return false;
    seen.add(once);
    return true;
  });
}

module.exports = {
  watchKey,
  runAlerts
};
