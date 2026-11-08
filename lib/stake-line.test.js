const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { SFDP_WITHDRAWERS, summarizeStake, stakeLine } = require("./stake-line");

const EPOCH = 1080n;

function slice({ foundation, stake, activation, deactivation }) {
  const buf = Buffer.alloc(168);
  buf.set(foundation ? SFDP_WITHDRAWERS[0] : Buffer.alloc(32, 7), 32);
  buf.writeBigUInt64LE(BigInt(stake), 144);
  buf.writeBigUInt64LE(BigInt(activation), 152);
  buf.writeBigUInt64LE(BigInt(deactivation), 160);
  return buf;
}

describe("summarizeStake", () => {
  it("keeps active Foundation and other stake, and holds warming stake aside", () => {
    const sums = summarizeStake(EPOCH, [
      slice({ foundation: true, stake: 65_500_373_000_000n, activation: 1000n, deactivation: (1n << 64n) - 1n }),
      slice({ foundation: false, stake: 63_677_010_000_000n, activation: 1000n, deactivation: (1n << 64n) - 1n }),
      slice({ foundation: false, stake: 1_200_000_000_000n, activation: EPOCH, deactivation: (1n << 64n) - 1n }),
      slice({ foundation: true, stake: 400_000_000_000n, activation: 1000n, deactivation: EPOCH }),
      slice({ foundation: false, stake: 9_000_000_000n, activation: 900n, deactivation: 1079n })
    ]);
    assert.equal(sums.foundationLamports, 65_900_373_000_000n);
    assert.equal(sums.otherLamports, 63_677_010_000_000n);
    assert.equal(sums.coolingFoundationLamports, 400_000_000_000n);
    assert.equal(sums.warmingOtherLamports, 1_200_000_000_000n);
    assert.equal(sums.warmingFoundationLamports, 0n);
  });
});

describe("stakeLine", () => {
  it("shows the room under the Foundation retirement line", () => {
    const text = stakeLine({
      cluster: "mainnet-beta",
      foundationLamports: 65_500_373_000_000n,
      otherLamports: 63_677_010_000_000n
    });
    assert.match(text, /Active stake is 129,177\.383 SOL: 65,500\.373 from the Foundation and 63,677\.01 from other sources/);
    assert.match(text, /Other stake is 236,322\.99 SOL under 300,000, where Foundation membership retires/);
    assert.match(text, /href="https:\/\/solana\.org\/faq#retired_status"/);
  });

  it("names both published limits once other stake is past 300,000 SOL", () => {
    const text = stakeLine({
      cluster: "mainnet-beta",
      foundationLamports: 50_000_000_000_000n,
      otherLamports: 370_000_000_000_000n
    });
    assert.match(text, /70,000 SOL over 300,000, where Foundation membership retires/);
    assert.match(text, /630,000 SOL under the 1,000,000 SOL residual cap/);
  });

  it("says when other stake is past the residual cap", () => {
    const text = stakeLine({
      foundationLamports: 0n,
      otherLamports: 1_200_000_000_000_000n
    });
    assert.match(text, /all from sources other than the Foundation/);
    assert.match(text, /over the 1,000,000 SOL residual cap/);
  });

  it("mentions stake that is warming up or cooling down", () => {
    const text = stakeLine({
      foundationLamports: 15_000_000_000_000n,
      otherLamports: 10_000_000_000_000n,
      warmingOtherLamports: 1_200_000_000_000n,
      coolingFoundationLamports: 400_000_000_000n
    });
    assert.match(text, /1,200 SOL from other sources is still warming up and counts next epoch/);
    assert.match(text, /400 SOL from the Foundation is cooling down and leaves next epoch/);
  });

  it("stays quiet for testnet and for a reading that failed", () => {
    assert.equal(stakeLine({ cluster: "testnet", otherLamports: 10_000_000_000_000n }), "");
    assert.equal(stakeLine(null), "");
    assert.equal(stakeLine({ cluster: "mainnet-beta" }), "");
  });
});
