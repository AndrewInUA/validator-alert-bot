const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { compareVersions, versionWarning, versionClear } = require("./version-alert");

describe("versionWarning", () => {
  it("treats a beta newer than the floor as fine", () => {
    assert.equal(compareVersions("4.4.0-beta.0", "4.3.2") > 0, true);
    assert.equal(versionWarning({
      label: "Testnet AndrewInUA",
      cluster: "testnet",
      epoch: 1071,
      clientId: "JitoLabs",
      version: "4.4.0-beta.0",
      rules: [{ epoch: 1071, agave_min_version: "4.3.2" }]
    }), null);
  });

  it("warns before a later epoch raises the floor", () => {
    const early = versionWarning({
      label: "AndrewInUA",
      cluster: "mainnet-beta",
      epoch: 1068,
      slotsInEpoch: 432000,
      slotIndex: 0,
      slotMs: 200,
      clientId: "AgaveBam",
      version: "4.3.2",
      rules: [
        { epoch: 1068, agave_min_version: "4.3.2" },
        { epoch: 1070, agave_min_version: "4.5.0" }
      ]
    });
    assert.match(early.text, /running AgaveBam 4\.3\.2/);
    assert.match(early.text, /from mainnet epoch 1070/);
    assert.match(early.text, /about 2 days/);
    assert.doesNotMatch(early.text, /UTC/);
    assert.match(early.text, /^⚠️ /);
    assert.match(early.text, /href="https:\/\/solana.org\/delegation-criteria#mainnet-required-versions"/);
  });

  it("says how long until the epoch that needs an upgrade", () => {
    const now = Date.UTC(2026, 9, 30, 17, 0, 0);
    const warning = versionWarning({
      label: "AndrewInUA",
      cluster: "mainnet-beta",
      epoch: 1071,
      slotsInEpoch: 432000,
      slotIndex: 216000,
      slotMs: 200,
      now,
      clientId: "AgaveBam",
      version: "4.3.2",
      rules: [
        { epoch: 1071, agave_min_version: "4.3.2" },
        { epoch: 1073, agave_min_version: "4.4.0-rc.1" }
      ]
    });
    assert.match(warning.text, /from mainnet epoch 1073/);
    assert.match(warning.text, /about 36 hours, around Sun 1 Nov, 05:00 UTC/);
  });

  it("says the rule is already in effect when the node is short now", () => {
    const warning = versionWarning({
      label: "AndrewInUA",
      cluster: "mainnet-beta",
      epoch: 1068,
      clientId: "AgaveBam",
      version: "4.3.1",
      rules: [{ epoch: 1068, agave_min_version: "4.3.2" }]
    });
    assert.match(warning.text, /already in effect/);
    assert.match(warning.text, /href="https:\/\/solana.org\/delegation-criteria#mainnet-required-versions"/);
  });

  it("links the testnet warning to the testnet schedule", () => {
    const warning = versionWarning({
      label: "AndrewInUA",
      cluster: "testnet",
      epoch: 1073,
      clientId: "AgaveBam",
      version: "4.3.2",
      rules: [
        { epoch: 1073, agave_min_version: "4.3.2" },
        { epoch: 1075, agave_min_version: "4.4.0" }
      ]
    });
    assert.match(warning.text, /from testnet epoch 1075/);
    assert.match(warning.text, /href="https:\/\/solana.org\/delegation-criteria#testnet-required-versions"/);
  });

  it("says a matching client is fine for Check and stays silent for a warning", () => {
    const input = {
      label: "AndrewInUA",
      cluster: "testnet",
      epoch: 1073,
      clientId: "AgaveBam",
      version: "4.4.0",
      rules: [
        { epoch: 1073, agave_min_version: "4.3.2" },
        { epoch: 1075, agave_min_version: "4.4.0" }
      ]
    };
    assert.equal(versionWarning(input), null);
    assert.match(versionClear(input), /running AgaveBam 4\.4\.0/);
    assert.match(versionClear(input), /meets every published Foundation floor/);
    assert.equal(versionClear({ ...input, rules: [] }), "");
  });
});
