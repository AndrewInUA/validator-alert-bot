/**
 * Mainnet stake, split into Foundation stake and stake from other sources.
 * SFDP stake is the stake whose withdraw authority is one of the two accounts
 * published on the Foundation delegation dashboard.
 *
 * A stake account slice is 168 bytes from offset 12: staker, withdrawer, then at byte 144
 * the delegated lamports, activation epoch, and deactivation epoch.
 * Stake activated this epoch is still warming up. Stake whose deactivation epoch
 * is this epoch is still active and leaves next epoch.
 */

const STAKE_SLICE = { offset: 12, length: 168 };
const STAKE_FIELDS = { staker: 0, withdrawer: 32, stake: 144, activation: 152, deactivation: 160 };

const DUST_LAMPORTS = 1_000_000_000n;

const SFDP_WITHDRAWERS = [
  Buffer.from([52, 217, 167, 236, 174, 9, 113, 154, 64, 195, 78, 109, 213, 143, 189, 248, 17, 163, 151, 126, 190, 27, 1, 32, 51, 59, 218, 116, 56, 48, 37, 43]),
  Buffer.from([155, 218, 147, 197, 46, 42, 227, 120, 20, 12, 138, 86, 32, 135, 51, 33, 242, 171, 161, 149, 167, 68, 48, 243, 15, 240, 248, 51, 65, 31, 9, 155])
];

function lamportsOf(value) {
  if (typeof value === "bigint") return value > 0n ? value : 0n;
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.round(n));
}

function formatSol(value) {
  const rounded = (lamportsOf(value) + 500_000n) / 1_000_000n;
  const whole = rounded / 1000n;
  const milli = rounded % 1000n;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  if (milli === 0n) return grouped;
  return `${grouped}.${milli.toString().padStart(3, "0").replace(/0+$/, "")}`;
}

function isFoundation(withdrawer) {
  return SFDP_WITHDRAWERS.some(key => key.equals(withdrawer));
}

function readStakeSlice(slice) {
  if (!slice || slice.length < STAKE_FIELDS.deactivation + 8) return null;
  return {
    staker: slice.subarray(STAKE_FIELDS.staker, STAKE_FIELDS.staker + 32),
    withdrawer: slice.subarray(STAKE_FIELDS.withdrawer, STAKE_FIELDS.withdrawer + 32),
    stake: slice.readBigUInt64LE(STAKE_FIELDS.stake),
    activation: slice.readBigUInt64LE(STAKE_FIELDS.activation),
    deactivation: slice.readBigUInt64LE(STAKE_FIELDS.deactivation)
  };
}

/**
 * Sum one validator's stake accounts for the current epoch.
 * Cooling lamports are already included in the active totals.
 */
function summarizeStake(epoch, slices) {
  const current = BigInt(epoch);
  const sums = {
    foundationLamports: 0n,
    otherLamports: 0n,
    warmingFoundationLamports: 0n,
    warmingOtherLamports: 0n,
    coolingFoundationLamports: 0n,
    coolingOtherLamports: 0n
  };
  for (const slice of slices || []) {
    const row = readStakeSlice(slice);
    if (!row) continue;
    const { stake, activation, deactivation } = row;
    const foundation = isFoundation(row.withdrawer);
    if (activation < current && deactivation >= current) {
      if (foundation) sums.foundationLamports += stake;
      else sums.otherLamports += stake;
      if (deactivation === current) {
        if (foundation) sums.coolingFoundationLamports += stake;
        else sums.coolingOtherLamports += stake;
      }
    } else if (activation === current && deactivation > current) {
      if (foundation) sums.warmingFoundationLamports += stake;
      else sums.warmingOtherLamports += stake;
    }
  }
  return sums;
}

function splitSentence(foundation, other, doing) {
  const total = foundation + other;
  if (total < DUST_LAMPORTS) return "";
  if (foundation < DUST_LAMPORTS) {
    return `${formatSol(other)} SOL from other sources is ${doing}.`;
  }
  if (other < DUST_LAMPORTS) {
    return `${formatSol(foundation)} SOL from the Foundation is ${doing}.`;
  }
  return `${formatSol(total)} SOL is ${doing}: ${formatSol(foundation)} from the Foundation and ${formatSol(other)} from other sources.`;
}

/**
 * One monitoring paragraph for a mainnet validator.
 * A testnet watch, or a reading we could not make, returns an empty string.
 */
function stakeLine(input) {
  if (!input || input.cluster === "testnet") return "";
  const foundation = lamportsOf(input.foundationLamports);
  const other = lamportsOf(input.otherLamports);
  const warmingFoundation = lamportsOf(input.warmingFoundationLamports);
  const warmingOther = lamportsOf(input.warmingOtherLamports);
  const coolingFoundation = lamportsOf(input.coolingFoundationLamports);
  const coolingOther = lamportsOf(input.coolingOtherLamports);
  const active = foundation + other;
  const warming = splitSentence(warmingFoundation, warmingOther, "still warming up and counts next epoch");
  const cooling = splitSentence(coolingFoundation, coolingOther, "cooling down and leaves next epoch");
  let lead;
  if (active === 0n && !warming) return "";
  if (active === 0n) {
    lead = "Active stake is 0 SOL.";
  } else if (foundation === 0n) {
    lead = `Active stake is ${formatSol(active)} SOL, all from sources other than the Foundation.`;
  } else if (other === 0n) {
    lead = `Active stake is ${formatSol(active)} SOL, all from the Foundation.`;
  } else {
    lead = `Active stake is ${formatSol(active)} SOL: ${formatSol(foundation)} from the Foundation and ${formatSol(other)} from other sources.`;
  }
  return [lead, warming, cooling].filter(Boolean).join(" ");
}

module.exports = {
  STAKE_SLICE,
  STAKE_FIELDS,
  DUST_LAMPORTS,
  SFDP_WITHDRAWERS,
  readStakeSlice,
  summarizeStake,
  stakeLine,
  formatSol
};
