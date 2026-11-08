const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { classifyWatch, foldReading, strikesFor } = require("./classify");

const base = {
  label: "AndrewInUA",
  slot: 1000,
  slotMs: 200,
  lamports: 5_000_000_000,
  rentLamports: 20_000_000
};

describe("classifyWatch", () => {
  it("reports a validator that is voting at the tip", () => {
    const reading = classifyWatch({ ...base, current: { lastVote: 1002 }, delinquent: null });
    assert.equal(reading.code, "voting");
    assert.match(reading.reason, /^✅ /);
    assert.match(reading.reason, /at the tip/);
  });

  it("says the machine looks offline when the identity has left the network", () => {
    const reading = classifyWatch({
      ...base,
      slot: 2000,
      current: null,
      delinquent: { lastVote: 1000 },
      gossip: null
    });
    assert.equal(reading.code, "delinquent_offline");
    assert.match(reading.reason, /^⚠️ /);
    assert.match(reading.reason, /offline or cut off/);
  });

  it("says the machine is listed when gossip still has the identity", () => {
    const reading = classifyWatch({
      ...base,
      slot: 1200,
      current: null,
      delinquent: { lastVote: 1000 },
      gossip: { clientId: "JitoLabs", version: "4.3.2", gossip: "70.40.184.93:8002" }
    });
    assert.equal(reading.code, "delinquent_silent");
    assert.match(reading.reason, /JitoLabs version 4.3.2 at 70.40.184.93/);
  });

  it("warns when the vote account cannot pay the admission ticket", () => {
    const reading = classifyWatch({
      ...base,
      lamports: 100_000_000,
      current: { lastVote: 1000 },
      delinquent: null
    });
    assert.equal(reading.code, "low_balance");
    assert.match(reading.reason, /^⚠️ /);
    assert.match(reading.reason, /is voting\.\n\nThe vote account holds/);
  });

  it("separates a stopped vote from the short balance", () => {
    const reading = classifyWatch({
      ...base,
      slot: 2000,
      lamports: 100_000_000,
      current: null,
      delinquent: { lastVote: 1000 },
      gossip: { clientId: "JitoLabs", version: "4.3.0", gossip: "149.28.86.215:8002" }
    });
    assert.equal(reading.code, "delinquent_silent");
    assert.match(reading.reason, /behind, about 3 minutes\.\n\nThe identity is still listed/);
    assert.match(reading.reason, /not voting\.\n\nThe vote account holds/);
  });
});

describe("strikesFor", () => {
  it("confirms a far-behind delinquent reading on the first check", () => {
    const reading = classifyWatch({
      ...base,
      slot: 1200,
      current: null,
      delinquent: { lastVote: 1000 },
      gossip: null
    });
    assert.equal(strikesFor(reading), 1);
    assert.equal(strikesFor({ level: "ok", code: "voting", lag: 1 }), 2);
  });
});

describe("foldReading", () => {
  it("stays quiet on the first healthy readings", () => {
    const first = foldReading(null, { level: "ok", code: "voting", reason: "up" });
    const second = foldReading(first.state, { level: "ok", code: "voting", reason: "up" });
    assert.equal(first.send, null);
    assert.equal(second.send, null);
  });

  it("keeps the last confirmed reading when the network cannot be read", () => {
    const first = foldReading(null, { level: "ok", code: "voting", reason: "up" });
    const healthy = foldReading(first.state, { level: "ok", code: "voting", reason: "up" });
    const missed = foldReading(healthy.state, { level: "alert", code: "unreadable", reason: "miss" });
    const missedAgain = foldReading(missed.state, { level: "alert", code: "unreadable", reason: "miss" });
    assert.equal(missed.send, null);
    assert.equal(missedAgain.send, null);
    assert.equal(missedAgain.state.alertedCode, "voting");
  });

  it("sends a far-behind failure immediately and a recovery after two healthy readings", () => {
    const down = { level: "alert", code: "delinquent_offline", lag: 200, reason: "down" };
    const once = foldReading(null, down, strikesFor(down));
    assert.equal(once.send.reason, "down");
    const back1 = foldReading(once.state, { level: "ok", code: "voting", reason: "up" });
    const back2 = foldReading(back1.state, { level: "ok", code: "voting", reason: "up" });
    assert.equal(back1.send, null);
    assert.equal(back2.send.reason, "up");
  });
});
