const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { runAlerts } = require("./run");
const { createMemoryStore } = require("./store");

const VOTE = "3QPGLackJy5LKctYYoPGmA4P8ncyE197jdxr1zP2ho8K";

function facts(delinquent) {
  return {
    slot: 2000,
    slotMs: 200,
    current: delinquent ? null : { lastVote: 2000 },
    delinquent: delinquent ? { lastVote: 1000 } : null,
    gossip: delinquent ? null : undefined,
    lamports: 5_000_000_000,
    rentLamports: 20_000_000
  };
}

describe("runAlerts", () => {
  it("messages every chat watching a validator that just went delinquent", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA", identity: "id" }]
    });
    await store.saveSub({
      chatId: "2",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "Same node", identity: "id" }]
    });
    const alerts = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts: async () => facts(true)
    });
    assert.equal(alerts.length, 2);
    assert.match(alerts.find(item => item.chatId === "1").text, /AndrewInUA is delinquent/);
    assert.match(alerts.find(item => item.chatId === "2").text, /Same node is delinquent/);
    const again = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts: async () => facts(true)
    });
    assert.equal(again.length, 0);
  });

  it("does not message anyone while the validator is simply voting", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA", identity: "id" }]
    });
    const alerts = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts: async () => facts(false)
    });
    assert.equal(alerts.length, 0);
  });
});
