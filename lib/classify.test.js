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
    assert.match(reading.reason, /admission ticket/);
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
