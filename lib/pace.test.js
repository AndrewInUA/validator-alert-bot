const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { PACE_MS, dueForCheck } = require("./pace");

describe("dueForCheck", () => {
  it("runs when the checker has never recorded a pass", () => {
    assert.equal(dueForCheck(null, 1_000_000), true);
  });

  it("skips a call that arrives inside the window", () => {
    const now = 5_000_000;
    assert.equal(dueForCheck({ ranAt: new Date(now - 60_000).toISOString() }, now), false);
  });

  it("runs again once the window has passed", () => {
    const now = 5_000_000;
    assert.equal(dueForCheck({ ranAt: new Date(now - PACE_MS).toISOString() }, now), true);
  });
});
