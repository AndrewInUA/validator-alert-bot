const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { decodeBase58, directoryFromCsv, directoryFromEntries, fallbackDirectory } = require("./pool-directory");
const { stakeReport } = require("./stake-report");

const EPOCH = 1080n;
const FOREVER = (1n << 64n) - 1n;
const FOUNDATION = "4ZJhPQAgUseCsWhKvJLTmmRRUV74fdoTpQLNfKoekbPY";
const JITO = "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS";
const MARINADE_STAKER = "stWirqFCf2Uts1JBL1Jsd3r6VBWhgnpdPxCTe1MFjrq";
const SELF = "7cgg6KhPd1G8oaoB48RyPDWu7uZs51jUpDYB3eq4VebH";

function slice({ withdrawer, staker, stake, activation = 1000n, deactivation = FOREVER }) {
  const buf = Buffer.alloc(168);
  if (staker) buf.set(staker, 0);
  if (withdrawer) buf.set(withdrawer, 32);
  buf.writeBigUInt64LE(BigInt(stake), 144);
  buf.writeBigUInt64LE(BigInt(activation), 152);
  buf.writeBigUInt64LE(BigInt(deactivation), 160);
  return buf;
}

const directory = directoryFromEntries([
  { type: "W", group: "SFDP_STAKE", pubkey: FOUNDATION },
  { type: "W", group: "JITO_POOL", pubkey: JITO },
  { type: "S", group: "MARINADE", pubkey: MARINADE_STAKER },
  { type: "W", group: "MARINADE", pubkey: "9eG63CdHjsfhHmobHgLtESGC8GabbmRcaSpHAZrtmhco" }
]);

describe("stakeReport", () => {
  it("lists the Foundation first, then each pool, then stake that is not from a pool", () => {
    const text = stakeReport({
      label: "AndrewInUA",
      vote: "3QPGLackJy5LKctYYoPGmA4P8ncyE197jdxr1zP2ho8K",
      cluster: "mainnet-beta",
      epoch: EPOCH,
      directory,
      voteWithdrawer: SELF,
      slices: [
        slice({ withdrawer: decodeBase58(JITO), stake: 30_000_000_000_000n }),
        slice({ withdrawer: decodeBase58(FOUNDATION), stake: 10_000_000_000_000n }),
        slice({
          staker: decodeBase58(MARINADE_STAKER),
          withdrawer: Buffer.alloc(32, 4),
          stake: 2_500_000_000_000n,
          activation: EPOCH
        }),
        slice({ withdrawer: decodeBase58(SELF), stake: 114_000_000_000n }),
        slice({ withdrawer: Buffer.alloc(32, 9), stake: 50_000_000_000n }),
        slice({ withdrawer: Buffer.alloc(32, 8), stake: 25_000_000_000n })
      ]
    });
    const foundationAt = text.indexOf("Foundation: 10,000 SOL");
    const jitoAt = text.indexOf("Jito: 30,000 SOL");
    assert.ok(foundationAt >= 0 && foundationAt < jitoAt);
    assert.match(text, /Marinade: 2,500 SOL warming up/);
    assert.match(text, /Self-stake: 114 SOL/);
    assert.match(text, /Other delegators: 75 SOL \(2 accounts\)/);
    assert.match(text, /Active stake is 40,189 SOL/);
    assert.doesNotMatch(text, /300,000/);
  });
});

describe("pool directory", () => {
  it("reads a quoted registry row and keeps a saved copy of the pool list", () => {
    const parsed = directoryFromCsv([
      "short_name,type,group,category,public_key,long_name",
      `"JITO","W","JITO_POOL","POOLS","${JITO}","Jito, the pool"`
    ].join("\n"));
    assert.equal(parsed.withdrawers.get(decodeBase58(JITO).toString("hex")).name, "Jito");
    assert.ok(fallbackDirectory().withdrawers.size > 50);
  });
});
