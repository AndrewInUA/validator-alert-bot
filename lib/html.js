function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function accountLink(vote, cluster) {
  if (!vote) return "";
  const net = cluster === "testnet" ? "testnet" : "mainnet-beta";
  return `https://explorer.solana.com/address/${vote}?cluster=${net}`;
}

function linkedLabel(label, vote, cluster) {
  const text = escapeHtml(label || "This validator");
  const href = accountLink(vote, cluster);
  if (!href) return text;
  return `<a href="${href}">${text}</a>`;
}

module.exports = {
  escapeHtml,
  accountLink,
  linkedLabel
};
