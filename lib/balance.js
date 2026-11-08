const { VAT_LAMPORTS } = require("./classify");
const { linkedLabel } = require("./html");

const TARGET_EPOCHS = 8;
const BALANCE_CHANGE_LAMPORTS = 10_000_000;
const TRUSTED_JUMP_LAMPORTS = 20_000_000_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function sol(lamports) {
  return (lamports / 1e9).toFixed(3);
}

/**
 * One planning note for a vote account that can still pay the 0.8 SOL fee.
 * A short account returns null. That case already has its own alarm.
 */
function balanceNote(input) {
  const lamports = Number(input.lamports);
  const rent = Number(input.rentLamports);
  if (!Number.isFinite(lamports) || !Number.isFinite(rent)) return null;
  const above = lamports - rent;
  if (above < VAT_LAMPORTS) return null;
  const epochs = Math.floor(above / VAT_LAMPORTS);
  const epochWord = epochs === 1 ? "epoch" : "epochs";
  const prev = Number(input.prevLamports);
  const drop = Number.isFinite(prev) ? prev - lamports : null;
  const paid = drop != null && drop >= 700_000_000 && drop <= 1_000_000_000;
  const linked = linkedLabel(input.label, input.vote, input.cluster);
  const name = input.cluster
    ? `${linked} on ${input.cluster === "testnet" ? "testnet" : "mainnet"}`
    : linked;
  const body = `The vote account balance is ${sol(lamports)} SOL. That is ${sol(above)} SOL above rent, about ${epochs} more ${epochWord}.`;
  const hold = paid
    ? `${name} paid the 0.8 SOL fee for this epoch. ${body}`
    : `${name}: ${body}`;
  const extra = epochs >= TARGET_EPOCHS ? "Nothing to send." : topUpLine(above, epochs, input);
  const mark = epochs > 2 ? "✅" : "⚠️";
  return extra ? `${mark} ${hold} ${extra}` : `${mark} ${hold}`;
}

function topUpLine(above, epochs, input) {
  if (epochs >= TARGET_EPOCHS) return "";
  const slotsInEpoch = Number(input.slotsInEpoch);
  const slotIndex = Number(input.slotIndex);
  const slotMs = Number(input.slotMs) || 200;
  const now = Number(input.now);
  if (!Number.isFinite(slotsInEpoch) || slotsInEpoch <= 0 || !Number.isFinite(slotIndex) || !Number.isFinite(now)) {
    return "";
  }
  const slotsLeft = Math.max(0, slotsInEpoch - slotIndex);
  const ms = (slotsLeft + (epochs - 1) * slotsInEpoch) * slotMs;
  const when = new Date(now + ms);
  const day = `${MONTHS[when.getUTCMonth()]} ${when.getUTCDate()}`;
  const shortfall = TARGET_EPOCHS * VAT_LAMPORTS - above;
  const suggest = Math.ceil(shortfall / 500_000_000) * 0.5;
  const amount = Number.isInteger(suggest) ? String(suggest) : suggest.toFixed(1);
  return `Sending about ${amount} SOL before about ${day} leaves about ${TARGET_EPOCHS} epochs covered.`;
}

module.exports = {
  TARGET_EPOCHS,
  BALANCE_CHANGE_LAMPORTS,
  TRUSTED_JUMP_LAMPORTS,
  balanceNote
};
