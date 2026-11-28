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

  it("adds last epoch's earnings to the balance note, once", async () => {
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
      seenEpoch: 1093,
      seenLamports: 4_240_000_000,
      seenProfitEpoch: 1092
    });
    const readFacts = async () => ({
      slot: 1,
      epoch: 1094,
      slotsInEpoch: 432000,
      slotIndex: 0,
      slotMs: 200,
      current: { lastVote: 1 },
      delinquent: null,
      lamports: 3_440_000_000,
      rentLamports: 20_000_000
    });
    let reads = 0;
    const readEpochReward = async (watch, epoch) => {
      reads += 1;
      assert.equal(watch.vote, VOTE);
      assert.equal(epoch, 1093);
      return { epoch, rewards: 0.73183, validator_inflation_reward: 0, mev_to_validator: 0 };
    };
    const alerts = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts,
      readEpochReward
    });
    assert.equal(reads, 1);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].chatId, "1");
    assert.match(alerts[0].text, /paid the 0.8 SOL fee/);
    assert.match(alerts[0].text, /⚠️ Last epoch .* earned \+0\.732 SOL, paid −0\.8 SOL for the voting ticket, and finished 0\.068 SOL in the red before servers/);
    assert.equal((await store.getStatus(key)).seenProfitEpoch, 1093);
    const again = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts,
      readEpochReward
    });
    assert.equal(again.length, 0);
    assert.equal(reads, 1);
  });

  it("waits for the epoch reward and then sends the line on its own", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      balanceNotes: true,
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA" }]
    });
    const key = `mainnet-beta:${VOTE}`;
    await store.setStatus(key, {
      pendingCode: "voting",
      strikes: 2,
      alertedCode: "voting",
      seenEpoch: 1094,
      seenLamports: 3_440_000_000,
      seenProfitEpoch: 1092
    });
    const readFacts = async () => ({
      slot: 1,
      epoch: 1094,
      slotsInEpoch: 432000,
      slotIndex: 1000,
      slotMs: 200,
      current: { lastVote: 1 },
      delinquent: null,
      lamports: 3_440_000_000,
      rentLamports: 20_000_000
    });
    let ready = false;
    const readEpochReward = async () => (
      ready ? { epoch: 1093, rewards: 1.24, validator_inflation_reward: 0, mev_to_validator: 0 } : null
    );
    const waiting = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts,
      readEpochReward
    });
    assert.equal(waiting.length, 0);
    assert.equal((await store.getStatus(key)).seenProfitEpoch, 1092);
    ready = true;
    const alerts = await runAlerts({
      subs: await store.listSubs(),
      getStatus: key => store.getStatus(key),
      setStatus: (key, value) => store.setStatus(key, value),
      readFacts,
      readEpochReward
    });
    assert.equal(alerts.length, 1);
    assert.match(alerts[0].text, /✅ Last epoch .* earned \+1\.24 SOL, paid −0\.8 SOL for the voting ticket, and finished 0\.44 SOL in the black before servers/);
    assert.doesNotMatch(alerts[0].text, /vote account balance/);
    assert.equal((await store.getStatus(key)).seenProfitEpoch, 1093);
  });

  it("sends one testnet epoch note after a large credit settles", async () => {
    const store = createMemoryStore();
    const vote = "3ocjgxryNJa1AYGUf16QuNPGVoijMXNgFau8ZL4TDnxR";
    await store.saveSub({
      chatId: "1",
      balanceNotes: true,
      watches: [{ vote, cluster: "testnet", label: "AndrewInUA" }]
    });
    const key = `testnet:${vote}`;
    const oldLamports = 267_616_672_741_233;
    const newLamports = 267_898_993_681_282;
    await store.setStatus(key, {
      pendingCode: "voting",
      strikes: 2,
      alertedCode: "voting",
      seenEpoch: 1100,
      seenLamports: oldLamports
    });
    const reading = (epoch, lamports) => ({
      slot: 1,
      epoch,
      slotsInEpoch: 432000,
      slotIndex: 20,
      slotMs: 400,
      current: { lastVote: 1 },
      delinquent: null,
      lamports,
      rentLamports: 10_000_000
    });
    const run = (epoch, lamports) => runAlerts({
      subs: [{ chatId: "1", balanceNotes: true, watches: [{ vote, cluster: "testnet", label: "AndrewInUA" }] }],
      getStatus: k => store.getStatus(k),
      setStatus: (k, value) => store.setStatus(k, value),
      readFacts: async () => reading(epoch, lamports)
    });
    const opened = await run(1101, oldLamports);
    assert.equal(opened.length, 0);
    assert.equal((await store.getStatus(key)).epochNotePending, true);
    assert.equal((await store.getStatus(key)).seenLamports, oldLamports);
    const credited = await run(1101, newLamports);
    assert.equal(credited.length, 0);
    assert.equal((await store.getStatus(key)).pendingLamports, newLamports);
    const settled = await run(1101, newLamports);
    assert.equal(settled.length, 1);
    assert.match(settled[0].text, /267898\.994/);
    assert.match(settled[0].text, /Nothing to send/);
    assert.equal((await store.getStatus(key)).epochNotePending, false);
    assert.equal((await store.getStatus(key)).seenLamports, newLamports);
    const again = await run(1101, newLamports);
    assert.equal(again.length, 0);
    const extra = newLamports + 30_000_000_000;
    assert.equal((await run(1101, extra)).length, 0);
    assert.equal((await run(1101, extra)).length, 0);
  });

  it("sends again in the same epoch only when the top-up advice changes", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "1",
      balanceNotes: true,
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA" }]
    });
    const key = `mainnet-beta:${VOTE}`;
    await store.setStatus(key, {
      pendingCode: "voting",
      strikes: 2,
      alertedCode: "voting",
      seenEpoch: 1100,
      seenLamports: 10_000_000_000,
      balanceNoteEpoch: 1100,
      balanceNoteKind: "ok"
    });
    const reading = (lamports) => ({
      slot: 1,
      epoch: 1100,
      slotsInEpoch: 432000,
      slotIndex: 1000,
      slotMs: 200,
      current: { lastVote: 1 },
      delinquent: null,
      lamports,
      rentLamports: 20_000_000
    });
    const run = async (lamports) => runAlerts({
      subs: await store.listSubs(),
      getStatus: k => store.getStatus(k),
      setStatus: (k, value) => store.setStatus(k, value),
      readFacts: async () => reading(lamports)
    });
    assert.equal((await run(9_500_000_000)).length, 0);
    const short = await run(4_000_000_000);
    assert.equal(short.length, 1);
    assert.match(short[0].text, /Sending about/);
    assert.equal((await run(3_500_000_000)).length, 0);
  });

  it("does not repeat a version warning after one clear reading", async () => {
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
    const behind = [
      { epoch: 1068, agave_min_version: "4.3.2" },
      { epoch: 1070, agave_min_version: "4.5.0" }
    ];
    const met = [{ epoch: 1068, agave_min_version: "4.3.2" }];
    const run = async (rules) => runAlerts({
      subs: await store.listSubs(),
      getStatus: k => store.getStatus(k),
      setStatus: (k, value) => store.setStatus(k, value),
      readFacts,
      readCluster: async () => [{ pubkey: "id", clientId: "AgaveBam", version: "4.3.2" }],
      readRules: async () => rules
    });
    const first = await run(behind);
    assert.equal(first.length, 1);
    assert.equal((await run(met)).length, 0);
    assert.equal((await run(met)).length, 0);
    assert.equal((await run(behind)).length, 0);
    const later = await run([
      { epoch: 1068, agave_min_version: "4.3.2" },
      { epoch: 1072, agave_min_version: "4.6.0" }
    ]);
    assert.equal(later.length, 1);
    assert.match(later[0].text, /from mainnet epoch 1072/);
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
