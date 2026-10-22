const { classifyWatch, foldReading, strikesFor } = require("./classify");

function watchKey(watch) {
  return `${watch.cluster}:${watch.vote}`;
}

/**
 * One pass over every watched vote account.
 * Sends only when the confirmed reading changes. Each operator gets their own label.
 */
async function runAlerts({ subs, getStatus, setStatus, readFacts }) {
  const alerts = [];
  const done = new Set();
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
      const reading = classifyWatch({ ...facts, label: watch.label });
      const folded = foldReading(await getStatus(key), reading, strikesFor(reading));
      await setStatus(key, folded.state);
      if (!folded.send) continue;
      for (const other of subs) {
        for (const item of other.watches || []) {
          if (item.cluster !== watch.cluster || item.vote !== watch.vote) continue;
          const personal = classifyWatch({ ...facts, label: item.label });
          alerts.push({ chatId: other.chatId, text: personal.reason });
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
