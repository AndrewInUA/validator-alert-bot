const { classifyWatch, VAT_LAMPORTS } = require("./classify");
const { STAKE_SLICE, summarizeStake } = require("./stake-line");

const STAKE_PROGRAM = "Stake11111111111111111111111111111111111111";

const RPC = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  testnet: "https://api.testnet.solana.com"
};

async function rpc(url, method, params) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(20000)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message || `RPC ${method} failed`);
  return json.result;
}

async function measureSlotMs(url, slot) {
  const older = slot - 20000;
  if (older < 0) return 200;
  try {
    const [recent, past] = await Promise.all([
      rpc(url, "getBlockTime", [slot - 20]),
      rpc(url, "getBlockTime", [older])
    ]);
    if (!recent || !past || recent <= past) return 200;
    const ms = ((recent - past) / (slot - 20 - older)) * 1000;
    if (ms < 100 || ms > 1000) return 200;
    return Math.round(ms);
  } catch {
    return 200;
  }
}

async function readFacts(watch) {
  const url = RPC[watch.cluster];
  if (!url) throw new Error(`Unknown cluster ${watch.cluster}`);
  const [epoch, votes, account] = await Promise.all([
    rpc(url, "getEpochInfo", []),
    rpc(url, "getVoteAccounts", [{ votePubkey: watch.vote }]),
    rpc(url, "getAccountInfo", [watch.vote, { encoding: "base64" }])
  ]);
  const current = (votes?.current || [])[0] || null;
  const delinquent = (votes?.delinquent || [])[0] || null;
  const space = account?.value?.space;
  const lamports = account?.value?.lamports ?? null;
  let rentLamports = null;
  if (space != null) {
    rentLamports = await rpc(url, "getMinimumBalanceForRentExemption", [space]);
  }
  let gossip;
  if (delinquent || !current) {
    const identity = watch.identity || delinquent?.nodePubkey || current?.nodePubkey;
    try {
      const nodes = await rpc(url, "getClusterNodes", []);
      gossip = (identity && nodes.find(node => node.pubkey === identity)) || null;
    } catch {
      gossip = undefined;
    }
  }
  return {
    label: watch.label,
    slot: epoch.absoluteSlot,
    epoch: epoch.epoch,
    slotsInEpoch: epoch.slotsInEpoch,
    slotIndex: epoch.slotIndex,
    slotMs: await measureSlotMs(url, epoch.absoluteSlot),
    now: Date.now(),
    current,
    delinquent,
    gossip,
    lamports,
    rentLamports,
    vatLamports: VAT_LAMPORTS
  };
}

async function lookupVote(cluster, vote) {
  const facts = await readFacts({ cluster, vote, label: "This validator", identity: null });
  if (!facts.current && !facts.delinquent) return null;
  const row = facts.current || facts.delinquent;
  return {
    identity: row.nodePubkey || null,
    summary: classifyWatch(facts).reason
  };
}

async function readCluster(cluster) {
  const url = RPC[cluster];
  if (!url) throw new Error(`Unknown cluster ${cluster}`);
  return rpc(url, "getClusterNodes", []);
}

function stakeBytes(data) {
  const text = Array.isArray(data) ? data[0] : data;
  return Buffer.from(text || "", "base64");
}

/**
 * Stake accounts delegated to one mainnet vote account.
 * Testnet has no pool breakdown, so this returns null and the caller stays quiet.
 */
async function loadSlices(watch) {
  if (!watch || watch.cluster !== "mainnet-beta") return null;
  const url = RPC[watch.cluster];
  if (!url) throw new Error(`Unknown cluster ${watch.cluster}`);
  const [epoch, accounts] = await Promise.all([
    rpc(url, "getEpochInfo", []),
    rpc(url, "getProgramAccounts", [STAKE_PROGRAM, {
      encoding: "base64",
      dataSlice: STAKE_SLICE,
      filters: [{ memcmp: { offset: 124, bytes: watch.vote } }]
    }])
  ]);
  return {
    cluster: watch.cluster,
    epoch: epoch.epoch,
    slices: (accounts || []).map(row => stakeBytes(row.account?.data))
  };
}

async function readStake(watch) {
  const loaded = await loadSlices(watch);
  if (!loaded) return null;
  return { cluster: loaded.cluster, ...summarizeStake(loaded.epoch, loaded.slices) };
}

async function readStakeDetail(watch) {
  const url = watch && RPC[watch.cluster];
  const [loaded, vote] = await Promise.all([
    loadSlices(watch),
    url ? rpc(url, "getAccountInfo", [watch.vote, { encoding: "jsonParsed" }]).catch(() => null) : null
  ]);
  if (!loaded) return null;
  const info = vote?.value?.data?.parsed?.info || {};
  return {
    ...loaded,
    voteWithdrawer: info.authorizedWithdrawer || null,
    identity: watch.identity || info.nodePubkey || null
  };
}

async function readRules(cluster) {
  const res = await fetch(
    `https://api.solana.org/api/community/v1/sfdp_required_versions?cluster=${encodeURIComponent(cluster)}`,
    { signal: AbortSignal.timeout(20000) }
  );
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Foundation version list could not be read");
  return Array.isArray(json.data) ? json.data : [];
}

module.exports = {
  RPC,
  readFacts,
  lookupVote,
  readCluster,
  readStake,
  readStakeDetail,
  readRules
};
