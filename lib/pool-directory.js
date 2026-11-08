/**
 * Stake-pool names for the Stake button.
 * Keys are the withdraw or staker authority on a stake account.
 * The list is the public stake-pool registry, refreshed when the network allows,
 * with a saved copy used when that fetch fails.
 */

const FALLBACK = require("./pools.json");

const REGISTRY_URL = "https://raw.githubusercontent.com/stakemap-sol/Solana-Stake-Pools-Research/main/stakepools_list.csv";
const ALPH = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const TTL_MS = 6 * 60 * 60 * 1000;

const NAMES = {
  SFDP_STAKE: "Foundation",
  FIREDANCER: "Firedancer",
  SF_INCENTIVE: "Foundation incentive",
  DOUBLEZERO: "DoubleZero",
  JITO_POOL: "Jito",
  MAR_SELECT: "Marinade Select",
  JPOOL_POOL: "JPool",
  BLAZESTAKE: "BlazeStake",
  EDGEVANA: "Edgevana",
  SHINOBI_POOL: "Shinobi",
  STKE_POOL: "SOL Strategies",
  VAULT_POOL: "Vault",
  PHASE_POOL: "Phase",
  JAG_POOL: "Jagpool",
  DYNO_POOL: "DynoSOL",
  DEFIN_POOL: "Definity",
  STAR_POOL: "StarPool",
  SHARK_POOL: "Shark Pool",
  LAYER33_POOL: "Layer33",
  MARINADE: "Marinade",
  BOND_STAKE: "Marinade bond",
  MINOR_POOL: "Minor pools",
  DRIFT_POOL: "Drift",
  SANCTUM_POOL: "Sanctum",
  SOLAYER_POOL: "Solayer",
  MARGINFI_POOL: "MarginFi",
  JUPITER_POOL: "Jupiter",
  PHANTOM_POOL: "Phantom",
  BINANCE_POOL: "Binance",
  BYBIT_POOL: "Bybit",
  MEXC_POOL: "MEXC",
  BITGET_POOL: "Bitget",
  CRYPTO_COM_POOL: "Crypto.com",
  BACKPACK_POOL: "Backpack",
  LIDO_POOL: "Lido",
  DAO_POOL: "DAOPool",
  LAINE_POOL: "Laine",
  ZIPPY_STAKE: "Zippy",
  SOCEAN_POOL: "Socean",
  EVERSOL_STAKE: "Everstake",
  PICO_POOL: "PicoSOL",
  STRONGHOLD_POOL: "Stronghold",
  DFDVSOL_POOL: "DeFi Dev Corp",
  MANGO_SOL: "Mango",
  STARKE_POOL: "Starke",
  HANABI_POOL: "Hanabi",
  LANTERN_POOL: "Lantern",
  ADRA_POOL: "Adra",
  BONK_POOL: "Bonk",
  RAIKU_SOL: "Raiku",
  HELIUS_POOL: "Helius",
  FORWARD_SOL: "Forward",
  GATE_SOL: "Gate",
  AXIOM_SOL: "Axiom",
  BULK_SOL: "BULK",
  HYLO_SOL: "Hylo",
  SAVE_SOL: "Save",
  PRISMA_SOL: "Prisma",
  CORVUS_SOL: "Corvus",
  THETA_SOL: "Theta",
  RAKURAI_SOL: "Rakurai",
  SFSOL_LST: "Staking Facilities",
  ALAMEDA_PLUS: "Alameda",
  ALAMEDA_MAIN: "Alameda",
  BIG_OLD_ONCE_LOCKED: "Old locked stake",
  BIG_CURRENT_LOCKED: "Locked stake"
};

let cached = null;
let cachedAt = 0;

function decodeBase58(text) {
  const value = String(text || "");
  let n = 0n;
  for (const c of value) {
    const i = ALPH.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  let hex = n.toString(16);
  if (hex.length % 2) hex = `0${hex}`;
  let zeros = 0;
  for (const c of value) {
    if (c === "1") zeros += 1;
    else break;
  }
  const out = Buffer.concat([Buffer.alloc(zeros), Buffer.from(hex || "00", "hex")]);
  return out.length === 32 ? out : null;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "");
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

function displayName(group, longName) {
  return NAMES[group] || String(longName || group || "Pool").trim();
}

function directoryFromEntries(entries) {
  const withdrawers = new Map();
  const stakers = new Map();
  for (const entry of entries || []) {
    const key = decodeBase58(entry.pubkey);
    if (!key) continue;
    const item = { group: entry.group, name: entry.name || displayName(entry.group, entry.longName) };
    const map = entry.type === "S" ? stakers : withdrawers;
    const hex = key.toString("hex");
    if (!map.has(hex)) map.set(hex, item);
  }
  return { withdrawers, stakers };
}

function directoryFromCsv(text) {
  const entries = [];
  for (const row of parseCsv(text)) {
    const type = row[1];
    const group = row[2];
    const pubkey = row[4];
    if (type !== "W" && type !== "S") continue;
    if (!pubkey || pubkey.startsWith("YOUR_NODE")) continue;
    entries.push({ type, group, pubkey, longName: row[5] });
  }
  return directoryFromEntries(entries);
}

function fallbackDirectory() {
  return directoryFromEntries((FALLBACK || []).map(row => ({
    type: row[0],
    group: row[1],
    pubkey: row[2],
    longName: row[3]
  })));
}

async function readPools() {
  if (cached && Date.now() - cachedAt < TTL_MS) return cached;
  try {
    const res = await fetch(REGISTRY_URL, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error("pool list");
    const directory = directoryFromCsv(await res.text());
    if (directory.withdrawers.size < 2) throw new Error("pool list");
    cached = directory;
    cachedAt = Date.now();
    return directory;
  } catch (err) {
    if (cached) return cached;
    const fallback = fallbackDirectory();
    if (fallback.withdrawers.size) return fallback;
    throw err;
  }
}

module.exports = {
  NAMES,
  decodeBase58,
  parseCsv,
  directoryFromEntries,
  directoryFromCsv,
  fallbackDirectory,
  readPools
};
