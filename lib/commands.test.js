const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { handleText, parseWatchArgs } = require("./commands");
const { createMemoryStore } = require("./store");

const VOTE = "3QPGLackJy5LKctYYoPGmA4P8ncyE197jdxr1zP2ho8K";

function ctx(store, extras = {}) {
  return {
    store,
    lookup: async () => ({ identity: "Av8EnYrPBnSJHK5e2wmTdnCpSy7nzmBgyFaUKSyLnBfe", summary: "This validator is voting." }),
    readFacts: async () => ({
      slot: 10,
      current: { lastVote: 10 },
      delinquent: null,
      lamports: 5_000_000_000,
      rentLamports: 20_000_000
    }),
    ...extras
  };
}

describe("parseWatchArgs", () => {
  it("reads a testnet vote account and a name", () => {
    const parsed = parseWatchArgs(`testnet ${VOTE} Practice node`);
    assert.equal(parsed.clusterKey, "testnet");
    assert.equal(parsed.vote, VOTE);
    assert.equal(parsed.label, "Practice node");
  });
});

describe("handleText", () => {
  it("introduces a validator bot and refuses a seed", async () => {
    const store = createMemoryStore();
    const start = await handleText(1, "/start", ctx(store));
    assert.match(start.text, /operators/);
    assert.doesNotMatch(start.text, /delegators/);
    assert.equal(start.markup.keyboard[0][0].text, "Check");
    assert.equal(start.markup.keyboard[0][1].text, "Stake");
    const seed = await handleText(1, "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about", ctx(store));
    assert.match(seed.text, /vote account only/);
  });

  it("adds a mainnet vote account and lists it", async () => {
    const store = createMemoryStore();
    const added = await handleText(7, VOTE, ctx(store));
    assert.match(added.text, /Watching mainnet 3QPG/);
    assert.match(added.text, /Right now/);
    const listed = await handleText(7, "Watches", ctx(store));
    assert.match(listed.text, /Watching 1 validator/);
    assert.match(listed.text, /Identity Av8E/);
    const again = await handleText(7, `/watch ${VOTE}`, ctx(store));
    assert.match(again.text, /already watching/);
    const named = await handleText(7, `${VOTE} Practice node`, ctx(store));
    assert.match(named.text, /Name saved/);
    assert.match(named.text, /Practice node/);
  });

  it("turns balance notes on and off", async () => {
    const store = createMemoryStore();
    await store.saveSub({ chatId: "7", watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA" }] });
    const on = await handleText(7, "🔔 Turn balance notes on", ctx(store));
    assert.match(on.text, /Balance notes are on/);
    assert.match(on.text, /when a vote account balance changes/);
    assert.match(on.text, /AndrewInUA<\/a> on mainnet: The vote account balance is 5\.000 SOL\. That is 4\.980 SOL above rent, about 6 more epochs/);
    assert.equal(on.markup.keyboard[3][0].text, "🔕 Turn balance notes off");
    assert.equal((await store.getSub(7)).balanceNotes, true);
    const off = await handleText(7, "🔕 Turn balance notes off", ctx(store));
    assert.match(off.text, /Balance notes are off/);
    assert.equal(off.markup.keyboard[3][0].text, "🔔 Turn balance notes on");
    assert.equal((await store.getSub(7)).balanceNotes, false);
    const stay = await handleText(7, "🔕 Balance notes off", ctx(store));
    assert.match(stay.text, /Balance notes are off/);
    assert.equal((await store.getSub(7)).balanceNotes, false);
  });

  it("checks each vote account once and includes the explorer page", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "7",
      watches: [
        { vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA" },
        { vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA" }
      ]
    });
    const reply = await handleText(7, "Check", ctx(store));
    assert.match(reply.text, /<a href="https:\/\/explorer\.solana\.com\/address\/3QPGLackJy5LKctYYoPGmA4P8ncyE197jdxr1zP2ho8K\?cluster=mainnet-beta">AndrewInUA<\/a> on mainnet is voting/);
    assert.equal(reply.text.match(/is voting/g).length, 1);
    assert.doesNotMatch(reply.text, /\nhttps:\/\//);
    assert.equal((await store.getSub(7)).watches.length, 1);
  });

  it("keeps an open version requirement in the check summary until the node meets it", async () => {
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "7",
      watches: [{ vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA", identity: "id" }]
    });
    const facts = {
      slot: 10,
      epoch: 1071,
      slotsInEpoch: 432000,
      slotIndex: 0,
      slotMs: 200,
      current: { lastVote: 10, nodePubkey: "id" },
      delinquent: null,
      lamports: 5_000_000_000,
      rentLamports: 20_000_000
    };
    const readCluster = async () => [{ pubkey: "id", clientId: "AgaveBam", version: "4.3.2" }];
    const short = await handleText(7, "Check", ctx(store, {
      readFacts: async () => facts,
      readCluster,
      readRules: async () => [
        { epoch: 1071, agave_min_version: "4.3.2" },
        { epoch: 1073, agave_min_version: "4.4.0-rc.1" }
      ]
    }));
    assert.match(short.text, /on mainnet is voting/);
    assert.match(short.text, /requires Agave 4\.4\.0-rc\.1 or newer from mainnet epoch 1073/);
    assert.doesNotMatch(short.text, /Voting from/);
    const placed = await handleText(7, "Check", ctx(store, {
      readFacts: async () => facts,
      readCluster: async () => [{ pubkey: "id", clientId: "AgaveBam", version: "4.4.1", gossip: "185.8.107.72:8002" }],
      readRules: async () => [{ epoch: 1071, agave_min_version: "4.3.2" }]
    }));
    assert.match(placed.text, /Voting from Chicago 185\.8\.107\.72/);
    const met = await handleText(7, "Check", ctx(store, {
      readFacts: async () => facts,
      readCluster,
      readRules: async () => [{ epoch: 1071, agave_min_version: "4.3.2" }]
    }));
    assert.match(met.text, /on mainnet is voting/);
    assert.match(met.text, /running AgaveBam 4\.3\.2/);
    assert.match(met.text, /meets every published Foundation floor/);
    assert.match(met.text, /delegation-criteria#mainnet-required-versions/);
    assert.doesNotMatch(met.text, /requires Agave/);
  });

  it("adds the mainnet stake split on check and when a validator is added", async () => {
    const store = createMemoryStore();
    const readStake = async () => ({
      cluster: "mainnet-beta",
      foundationLamports: 65_500_373_000_000n,
      otherLamports: 63_677_010_000_000n
    });
    const added = await handleText(7, VOTE, ctx(store, { readStake }));
    assert.match(added.text, /65,500\.373 from the Foundation/);
    assert.match(added.text, /236,322\.99 SOL under 300,000/);
    const reply = await handleText(7, "Check", ctx(store, { readStake }));
    assert.match(reply.text, /on mainnet is voting/);
    assert.match(reply.text, /63,677\.01 from other sources/);
    assert.match(reply.text, /faq#retired_status/);
    const testnet = await handleText(7, `testnet ${VOTE} Practice`, ctx(store, {
      readStake: async () => {
        throw new Error("testnet should not ask for mainnet stake");
      }
    }));
    assert.match(testnet.text, /Watching Practice on testnet/);
    assert.doesNotMatch(testnet.text, /Foundation/);
  });

  it("lists stake by pool from the Stake button", async () => {
    const { decodeBase58, directoryFromEntries } = require("./pool-directory");
    const store = createMemoryStore();
    await store.saveSub({
      chatId: "7",
      watches: [
        { vote: VOTE, cluster: "mainnet-beta", label: "AndrewInUA" },
        { vote: VOTE, cluster: "testnet", label: "Practice" }
      ]
    });
    const foundation = "4ZJhPQAgUseCsWhKvJLTmmRRUV74fdoTpQLNfKoekbPY";
    const jito = "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS";
    const slice = (pubkey, stake) => {
      const buf = Buffer.alloc(168);
      buf.set(decodeBase58(pubkey), 32);
      buf.writeBigUInt64LE(BigInt(stake), 144);
      buf.writeBigUInt64LE(1000n, 152);
      buf.writeBigUInt64LE((1n << 64n) - 1n, 160);
      return buf;
    };
    const read = {
      readPools: async () => directoryFromEntries([
        { type: "W", group: "SFDP_STAKE", pubkey: foundation },
        { type: "W", group: "JITO_POOL", pubkey: jito }
      ]),
      readStakeDetail: async () => ({
        epoch: 1080,
        slices: [
          slice(foundation, 65_500_000_000_000n),
          slice(jito, 30_000_000_000_000n)
        ]
      })
    };
    const reply = await handleText(7, "Stake", ctx(store, read));
    assert.match(reply.text, /AndrewInUA<\/a> on mainnet/);
    assert.match(reply.text, /Foundation: 65,500 SOL/);
    assert.match(reply.text, /Jito: 30,000 SOL/);
    assert.doesNotMatch(reply.text, /Practice/);
    const command = await handleText(7, "/stake", ctx(store, read));
    assert.match(command.text, /Foundation: 65,500 SOL/);
    const failed = await handleText(7, "Stake", ctx(store, {
      readPools: async () => { throw new Error("down"); },
      readStakeDetail: async () => ({ epoch: 1080, slices: [] })
    }));
    assert.match(failed.text, /pool list could not be read/);
    const testnetOnly = createMemoryStore();
    await testnetOnly.saveSub({ chatId: "7", watches: [{ vote: VOTE, cluster: "testnet", label: "Practice" }] });
    const skipped = await handleText(7, "Stake", ctx(testnetOnly, read));
    assert.match(skipped.text, /mainnet reading/);
  });

  it("does not add a vote account the cluster does not know", async () => {
    const store = createMemoryStore();
    const reply = await handleText(7, `/watch ${VOTE}`, ctx(store, { lookup: async () => null }));
    assert.match(reply.text, /Nothing was added/);
    assert.equal(await store.getSub(7), null);
  });
});
