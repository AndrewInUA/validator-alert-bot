function isPubkey(value) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(value || "").trim());
}

function looksLikeSeed(text) {
  const words = String(text || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  return words.length >= 12 && words.length <= 24 && words.every(word => /^[a-z]+$/.test(word));
}

function looksLikeKeypair(text) {
  const raw = String(text || "").trim();
  return raw.startsWith("[") && raw.split(",").length > 8;
}

function shortKey(value) {
  const text = String(value || "");
  if (text.length < 12) return text;
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

function defaultLabel(clusterTitle, vote) {
  return `${clusterTitle} ${shortKey(vote)}`;
}

module.exports = {
  isPubkey,
  looksLikeSeed,
  looksLikeKeypair,
  shortKey,
  defaultLabel
};
