/**
 * One public reading of a validator.
 * The vote account is the alarm. The identity only explains an alarm.
 * Solana marks a vote account delinquent once its last vote is 128 slots behind.
 */

const DELINQUENT_SLOTS = 128;
const VAT_LAMPORTS = 800_000_000;

function sol(lamports) {
  return (lamports / 1e9).toFixed(3);
}

function lagPhrase(lagSlots, slotMs) {
  if (lagSlots == null) return "at an unknown slot";
  if (lagSlots <= 0) return "at the tip of the chain";
  const sec = Math.round((lagSlots * slotMs) / 1000);
  if (sec < 90) {
    const unit = sec === 1 ? "second" : "seconds";
    return `${lagSlots} slots behind, about ${sec} ${unit}`;
  }
  const min = Math.max(1, Math.round(sec / 60));
  const unit = min === 1 ? "minute" : "minutes";
  return `${lagSlots} slots behind, about ${min} ${unit}`;
}

function classifyWatch(input) {
  const name = input.label;
  const slotMs = input.slotMs || 200;
  const row = input.delinquent || input.current || null;
  const lastVote = row && Number.isFinite(Number(row.lastVote)) ? Number(row.lastVote) : null;
  const lag = lastVote == null ? null : Math.max(0, Number(input.slot) - lastVote);
  const aboveRent =
    input.lamports != null && input.rentLamports != null
      ? Number(input.lamports) - Number(input.rentLamports)
      : null;
  const lowBalance = aboveRent != null && aboveRent < (input.vatLamports ?? VAT_LAMPORTS);

  if (input.unreadable) {
    return {
      level: "alert",
      code: "unreadable",
      lag,
      reason: `${name}: the checker could not read the Solana network, so it cannot tell whether the node is voting.`
    };
  }

  if (!input.current && !input.delinquent) {
    return {
      level: "alert",
      code: "missing",
      lag,
      reason: `${name} is not in the voting set. The vote account is absent from both the active list and the delinquent list.`
    };
  }

  if (input.delinquent) {
    const where = lagPhrase(lag, slotMs);
    let reason;
    let code;
    if (input.gossip === null) {
      code = "delinquent_offline";
      reason = `${name} is delinquent. Its last vote is ${where}. The identity is not in the network list, so the node looks offline or cut off.`;
    } else if (input.gossip) {
      code = "delinquent_silent";
      const client = input.gossip.clientId ? `${input.gossip.clientId} ` : "";
      const ver = input.gossip.version ? `version ${input.gossip.version}` : "an unreported version";
      const ip = input.gossip.gossip ? String(input.gossip.gossip).split(":")[0] : "";
      const at = ip ? ` at ${ip}` : "";
      reason = `${name} is delinquent. Its last vote is ${where}. The identity is still listed (${client}${ver}${at}), so the machine looks online and the validator is not voting.`;
    } else {
      code = "delinquent_unknown";
      reason = `${name} is delinquent. Its last vote is ${where}. The node list could not be read, so this check cannot tell whether the machine is online.`;
    }
    if (lowBalance) {
      reason += ` The vote account also holds ${sol(aboveRent)} SOL above rent, short of the 0.8 SOL admission ticket.`;
    }
    return { level: "alert", code, lag, reason };
  }

  if (lowBalance) {
    return {
      level: "alert",
      code: "low_balance",
      lag,
      reason: `${name} is voting. The vote account holds ${sol(aboveRent)} SOL above rent, short of the 0.8 SOL admission ticket, so the next epoch can leave it out of consensus.`
    };
  }

  return {
    level: "ok",
    code: "voting",
    lag,
    reason: `${name} is voting. Its last vote is ${lagPhrase(lag, slotMs)}.`
  };
}

/**
 * A delinquent reading that is already far behind confirms on the first check.
 * Everything else, including recovery, waits for two matching readings.
 */
function strikesFor(reading) {
  if (
    reading.level === "alert" &&
    String(reading.code).startsWith("delinquent") &&
    reading.lag != null &&
    reading.lag >= DELINQUENT_SLOTS
  ) {
    return 1;
  }
  return 2;
}

/**
 * The first healthy reading is a baseline and stays quiet.
 * A bad reading, including one found at startup, sends once it is confirmed.
 * The same code does not send again. Recovery sends after it is confirmed.
 */
function foldReading(state, reading, strikesNeeded = strikesFor(reading)) {
  const pendingCode = state && state.pendingCode;
  const strikes = pendingCode === reading.code ? Number(state.strikes || 0) + 1 : 1;
  const alertedCode = state && state.alertedCode != null ? state.alertedCode : null;
  const confirmed = strikes >= strikesNeeded;
  let send = null;
  let nextAlerted = alertedCode;
  if (confirmed && reading.code !== alertedCode) {
    const startupHealthy = alertedCode == null && reading.level === "ok";
    if (!startupHealthy) send = reading;
    nextAlerted = reading.code;
  }
  return {
    send,
    state: {
      pendingCode: reading.code,
      strikes,
      alertedCode: nextAlerted
    }
  };
}

module.exports = {
  DELINQUENT_SLOTS,
  VAT_LAMPORTS,
  classifyWatch,
  foldReading,
  strikesFor,
  lagPhrase
};
