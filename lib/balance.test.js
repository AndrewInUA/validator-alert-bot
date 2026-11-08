const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { balanceNote } = require("./balance");

const NOW = Date.UTC(2026, 9, 22, 15, 30);

describe("balanceNote", () => {
  it("says when the fee was paid and when to send more", () => {
    const text = balanceNote({
      label: "AndrewInUA",
      lamports: 3_440_000_000,
      rentLamports: 20_000_000,
      prevLamports: 4_240_000_000,
      slotsInEpoch: 432000,
      slotIndex: 0,
      slotMs: 200,
      now: NOW
    });
    assert.equal(
      text,
      "✅ AndrewInUA paid the 0.8 SOL fee for this epoch. The vote account balance is 3.440 SOL. That is 3.420 SOL above rent, about 4 more epochs. Sending about 3 SOL before about Oct 26 leaves about 8 epochs covered."
    );
  });

  it("asks for attention when two epochs or fewer remain", () => {
    const text = balanceNote({
      label: "AndrewInUA",
      lamports: 1_620_000_000,
      rentLamports: 20_000_000,
      slotsInEpoch: 432000,
      slotIndex: 0,
      slotMs: 200,
      now: NOW
    });
    assert.match(text, /^⚠️ /);
    assert.match(text, /about 2 more epochs/);
  });

  it("says nothing needs sending once eight epochs are covered", () => {
    const text = balanceNote({
      label: "AndrewInUA",
      lamports: 6_420_000_000,
      rentLamports: 20_000_000,
      now: NOW
    });
    assert.match(text, /^✅ /);
    assert.match(text, /balance is 6\.420 SOL/);
    assert.match(text, /Nothing to send/);
    assert.doesNotMatch(text, /Sending about/);
    const linked = balanceNote({
      label: "AndrewInUA",
      vote: "3QPGLackJy5LKctYYoPGmA4P8ncyE197jdxr1zP2ho8K",
      cluster: "mainnet-beta",
      lamports: 6_420_000_000,
      rentLamports: 20_000_000,
      now: NOW
    });
    assert.match(linked, /<a href="https:\/\/explorer\.solana\.com\/address\/3QPGLackJy5LKctYYoPGmA4P8ncyE197jdxr1zP2ho8K\?cluster=mainnet-beta">AndrewInUA<\/a>/);
    assert.doesNotMatch(linked, /\nhttps:\/\//);
  });

  it("stays quiet when the vote account is already short", () => {
    assert.equal(balanceNote({
      label: "Lana",
      lamports: 428_000_000,
      rentLamports: 20_000_000,
      now: NOW
    }), null);
  });
});
