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

  it("does not add a vote account the cluster does not know", async () => {
    const store = createMemoryStore();
    const reply = await handleText(7, `/watch ${VOTE}`, ctx(store, { lookup: async () => null }));
    assert.match(reply.text, /Nothing was added/);
    assert.equal(await store.getSub(7), null);
  });
});
