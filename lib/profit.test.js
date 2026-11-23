const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { profitLine } = require("./profit");

const VOTE = "3QPGLackJy5LKctYYoPGmA4P8ncyE197jdxr1zP2ho8K";

describe("profitLine", () => {
  it("says the node fell short of the voting ticket", () => {
    const text = profitLine({
      label: "AndrewInUA",
      vote: VOTE,
      cluster: "mainnet-beta",
      rewards: 0.73183,
      validator_inflation_reward: 0,
      mev_to_validator: 0
    });
    assert.equal(
      text,
      `⚠️ Last epoch <a href="https://explorer.solana.com/address/${VOTE}?cluster=mainnet-beta">AndrewInUA</a> earned +0.732 SOL, paid −0.8 SOL for the voting ticket, and finished 0.068 SOL in the red before servers.`
    );
  });

  it("adds inflation commission and kept MEV to block rewards", () => {
    const text = profitLine({
      label: "AndrewInUA",
      rewards: 0.5,
      validator_inflation_reward: 0.4,
      mev_to_validator: 0.2
    });
    assert.equal(
      text,
      "✅ Last epoch AndrewInUA earned +1.1 SOL, paid −0.8 SOL for the voting ticket, and finished 0.3 SOL in the black before servers."
    );
  });

  it("says the node matched the ticket", () => {
    const text = profitLine({
      label: "AndrewInUA",
      rewards: 0.8,
      validator_inflation_reward: 0,
      mev_to_validator: 0
    });
    assert.equal(
      text,
      "✅ Last epoch AndrewInUA earned +0.8 SOL, paid −0.8 SOL for the voting ticket, and finished even before servers."
    );
  });

  it("stays quiet when a part of the earning is missing", () => {
    assert.equal(profitLine({
      label: "AndrewInUA",
      rewards: 1.2,
      validator_inflation_reward: 0
    }), "");
  });
});
