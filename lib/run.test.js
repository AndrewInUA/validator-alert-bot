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
    assert.match(alerts.find(item => item.chatId === "1").text, /AndrewInUA<\/a> on mainnet is delinquent/);
    assert.match(alerts.find(item => item.chatId === "2").text, /Same node<\/a> on mainnet is delinquent/);
    const again = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts: async () => facts(true)
    });
    assert.equal(again.length, 0);
  });

  it("sends a balance note when the balance changes, only to chats that turned it on", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      balanceNotes: true,
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA", identity: "id" }]
    });
    await store.saveSub({
      chatId: "2",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "Same node", identity: "id" }]
    });
    const key = `mainnet-beta:${VOTE}`;
    await store.setStatus(key, {
      pendingCode: "voting",
      strikes: 2,
      alertedCode: "voting",
      seenEpoch: 1065,
      seenLamports: 2_620_461_367
    });
    const readFacts = async () => ({
      slot: 1,
      epoch: 1065,
      slotsInEpoch: 432000,
      slotIndex: 1000,
      slotMs: 200,
      current: { lastVote: 1 },
      delinquent: null,
      lamports: 6_620_461_367,
      rentLamports: 21_461_367
    });
    const alerts = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].chatId, "1");
    assert.match(alerts[0].text, /balance is 6\.620 SOL/);
    assert.match(alerts[0].text, /Nothing to send/);
    const again = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts
    });
    assert.equal(again.length, 0);
  });

  it("sends a balance note only to chats that turned it on, and when the epoch changes", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      balanceNotes: true,
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA", identity: "id" }]
    });
    await store.saveSub({
      chatId: "2",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "Same node", identity: "id" }]
    });
    const key = `mainnet-beta:${VOTE}`;
    await store.setStatus(key, {
      pendingCode: "voting",
      strikes: 2,
      alertedCode: "voting",
      seenEpoch: 1064,
      seenLamports: 4_240_000_000
    });
    const readFacts = async () => ({
      slot: 1,
      epoch: 1065,
      slotsInEpoch: 432000,
      slotIndex: 0,
      slotMs: 200,
      current: { lastVote: 1 },
      delinquent: null,
      lamports: 3_440_000_000,
      rentLamports: 20_000_000
    });
    const alerts = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts
    });
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].chatId, "1");
    assert.match(alerts[0].text, /paid the 0.8 SOL fee/);
    assert.match(alerts[0].text, /3\.420 SOL above rent, about 4 more epochs/);
    const again = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts
    });
    assert.equal(again.length, 0);
    assert.equal((await store.getStatus(key)).seenEpoch, 1065);
  });

  it("warns once before a Foundation version floor rises", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA", identity: "id" }]
    });
    const readFacts = async () => ({
      slot: 1,
      epoch: 1068,
      slotsInEpoch: 432000,
      slotIndex: 0,
      slotMs: 200,
      current: { lastVote: 1, nodePubkey: "id" },
      delinquent: null,
      lamports: 5_000_000_000,
      rentLamports: 20_000_000
    });
    const readCluster = async () => [{ pubkey: "id", clientId: "AgaveBam", version: "4.3.2" }];
    const readRules = async () => [
      { epoch: 1068, agave_min_version: "4.3.2" },
      { epoch: 1070, agave_min_version: "4.5.0" }
    ];
    const alerts = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts,
      readCluster,
      readRules
    });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].text, /from mainnet epoch 1070/);
    assert.match(alerts[0].text, /about 2 days/);
    const again = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts,
      readCluster,
      readRules
    });
    assert.equal(again.length, 0);
    const met = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts,
      readCluster,
      readRules: async () => [{ epoch: 1068, agave_min_version: "4.3.2" }]
    });
    assert.equal(met.length, 0);
    const quiet = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts,
      readCluster,
      readRules: async () => [{ epoch: 1068, agave_min_version: "4.3.2" }]
    });
    assert.equal(quiet.length, 0);
  });

  it("does not announce a wild balance reading", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA" }],
      balanceNotes: true
    });
    const real = {
      slot: 1,
      epoch: 1070,
      slotsInEpoch: 432000,
      slotIndex: 10,
      slotMs: 200,
      current: { lastVote: 1 },
      delinquent: null,
      lamports: 4_426_476_087,
      rentLamports: 19_761_200
    };
    const run = async (facts) => runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts: async () => facts
    });
    await run(real);
    const wild = await run({ ...real, lamports: 259_109_239_000_000 });
    assert.equal(wild.length, 0);
    const status = await store.getStatus(`mainnet-beta:${VOTE}`);
    assert.equal(status.seenLamports, 4_426_476_087);
  });

  it("stays quiet when the network read fails", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA" }]
    });
    const run = async () => runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts: async () => {
        throw new Error("RPC getEpochInfo failed");
      }
    });
    assert.equal((await run()).length, 0);
    assert.equal((await run()).length, 0);
  });

  it("adds the stake split to a mainnet alert and does not scan stake while nothing changed", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA", identity: "id" }]
    });
    await store.saveSub({
      chatId: "2",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "Same node", identity: "id" }]
    });
    let reads = 0;
    const readStake = async () => {
      reads += 1;
      return {
        cluster: "mainnet-beta",
        foundationLamports: 65_500_373_000_000n,
        otherLamports: 63_677_010_000_000n
      };
    };
    const alerts = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts: async () => facts(true),
      readStake
    });
    assert.equal(alerts.length, 2);
    assert.equal(reads, 1);
    assert.match(alerts[0].text, /is delinquent/);
    assert.match(alerts[0].text, /129,177\.383 SOL: 65,500\.373 from the Foundation and 63,677\.01 from other sources/);
    const again = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts: async () => facts(true),
      readStake
    });
    assert.equal(again.length, 0);
    assert.equal(reads, 1);
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
