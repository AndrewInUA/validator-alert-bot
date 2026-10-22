const { classifyWatch, VAT_LAMPORTS } = require("./classify");

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
    slotMs: 200,
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

module.exports = {
  RPC,
  readFacts,
  lookupVote
};
