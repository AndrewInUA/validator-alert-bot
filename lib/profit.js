/**
 * One sentence comparing what the node kept last epoch with the 0.8 SOL voting ticket.
 * The kept amount is block rewards after the burn, inflation commission, and MEV the
 * validator kept. Server cost is left out. A row we cannot read returns an empty string.
 */

const { VAT_LAMPORTS } = require("./classify");
const { escapeHtml, linkedLabel } = require("./html");

const SOL_FIELDS = ["rewards", "validator_inflation_reward", "mev_to_validator"];

function lamportsFromSol(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  const [whole, frac = ""] = n.toFixed(9).split(".");
  return BigInt(whole) * 1_000_000_000n + BigInt((frac + "000000000").slice(0, 9));
}

function milli(lamports) {
  const sign = lamports < 0n ? -1n : 1n;
  const abs = lamports < 0n ? -lamports : lamports;
  return sign * ((abs + 500_000n) / 1_000_000n);
}

function textFromMilli(value) {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const whole = abs / 1000n;
  const frac = abs % 1000n;
  if (frac === 0n) return `${sign}${whole}`;
  return `${sign}${whole}.${frac.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

function earnedMilli(row) {
  if (!row) return null;
  let total = 0n;
  for (const field of SOL_FIELDS) {
    const part = lamportsFromSol(row[field]);
    if (part == null) return null;
    total += part;
  }
  return milli(total);
}

function profitLine(input) {
  const earned = earnedMilli(input);
  if (earned == null) return "";
  const name = input.vote
    ? linkedLabel(input.label, input.vote, input.cluster)
    : escapeHtml(input.label || "The node");
  const ticket = milli(BigInt(VAT_LAMPORTS));
  const gap = earned - ticket;
  const earnedText = textFromMilli(earned);
  const ticketText = textFromMilli(ticket);
  if (gap === 0n) {
    return `✅ Last epoch ${name} earned +${earnedText} SOL, paid −${ticketText} SOL for the voting ticket, and finished even before servers.`;
  }
  const diff = textFromMilli(gap < 0n ? -gap : gap);
  if (gap > 0n) {
    return `✅ Last epoch ${name} earned +${earnedText} SOL, paid −${ticketText} SOL for the voting ticket, and finished ${diff} SOL in the black before servers.`;
  }
  return `⚠️ Last epoch ${name} earned +${earnedText} SOL, paid −${ticketText} SOL for the voting ticket, and finished ${diff} SOL in the red before servers.`;
}

module.exports = {
  earnedMilli,
  profitLine
};
