/**
 * One mainnet stake reading, one line per pool.
 * Foundation stake is listed first. Stake that matches no pool is one closing line.
 */

const { escapeHtml, linkedLabel } = require("./html");
const { DUST_LAMPORTS, limitSentence, formatSol, readStakeSlice } = require("./stake-line");
const { decodeBase58 } = require("./pool-directory");

function hexOf(pubkey) {
  const key = decodeBase58(pubkey);
  return key ? key.toString("hex") : "";
}

function lookup(row, directory, ids) {
  const withdrawer = row.withdrawer.toString("hex");
  const staker = row.staker.toString("hex");
  const byWithdrawer = directory?.withdrawers?.get(withdrawer);
  if (byWithdrawer) return byWithdrawer;
  const byStaker = directory?.stakers?.get(staker);
  if (byStaker) return byStaker;
  if (ids.voteWithdrawer && withdrawer === ids.voteWithdrawer) return { group: "self", name: "Self-stake" };
  if (ids.identity && withdrawer === ids.identity) return { group: "identity", name: "Identity" };
  return { group: "other", name: "Other delegators" };
}

function bucketStake(epoch, slices, directory, ids) {
  const current = BigInt(epoch);
  const buckets = new Map();
  for (const slice of slices || []) {
    const row = readStakeSlice(slice);
    if (!row || row.stake <= 0n) continue;
    const active = row.activation < current && row.deactivation >= current;
    const warming = row.activation === current && row.deactivation > current;
    if (!active && !warming) continue;
    const source = lookup(row, directory, ids);
    const bucket = buckets.get(source.group) || {
      group: source.group,
      name: source.name,
      active: 0n,
      warming: 0n,
      cooling: 0n,
      accounts: 0
    };
    if (active) {
      bucket.active += row.stake;
      bucket.accounts += 1;
      if (row.deactivation === current) bucket.cooling += row.stake;
    } else {
      bucket.warming += row.stake;
    }
    buckets.set(source.group, bucket);
  }
  return [...buckets.values()];
}

function rank(group) {
  if (group === "SFDP_STAKE") return 0;
  if (group === "self") return 2;
  if (group === "identity") return 3;
  if (group === "other") return 4;
  return 1;
}

function ordered(rows) {
  return rows.slice().sort((a, b) => {
    const place = rank(a.group) - rank(b.group);
    if (place) return place;
    if (a.active === b.active) return a.name.localeCompare(b.name);
    return a.active > b.active ? -1 : 1;
  });
}

function rowLine(row) {
  const notes = [];
  if (row.warming >= DUST_LAMPORTS) notes.push(`${formatSol(row.warming)} SOL warming up`);
  if (row.cooling >= DUST_LAMPORTS) notes.push(`${formatSol(row.cooling)} SOL cooling down`);
  if (row.group === "other" && row.accounts > 1) notes.push(`${row.accounts} accounts`);
  if (row.active > 0n) {
    const extra = notes.length ? ` (${notes.join(", ")})` : "";
    return `${escapeHtml(row.name)}: ${formatSol(row.active)} SOL${extra}`;
  }
  if (!notes.length) return "";
  return `${escapeHtml(row.name)}: ${notes[0]}`;
}

/**
 * The Stake button text for one validator.
 * `slices` are the 168-byte stake account slices from offset 12.
 */
function stakeReport(input) {
  const linked = linkedLabel(input.label, input.vote, input.cluster || "mainnet-beta");
  const ids = {
    voteWithdrawer: hexOf(input.voteWithdrawer),
    identity: hexOf(input.identity)
  };
  const rows = ordered(bucketStake(input.epoch, input.slices, input.directory, ids))
    .map(rowLine)
    .filter(Boolean);
  if (!rows.length) return `${linked} on mainnet has no active stake.`;
  const sums = bucketStake(input.epoch, input.slices, input.directory, ids);
  const active = sums.reduce((total, row) => total + row.active, 0n);
  const foundation = sums.find(row => row.group === "SFDP_STAKE")?.active || 0n;
  return [
    `${linked} on mainnet. Active stake is ${formatSol(active)} SOL.`,
    "",
    ...rows,
    "",
    limitSentence(active - foundation)
  ].join("\n");
}

module.exports = {
  bucketStake,
  stakeReport
};
