/**
 * Who watches which vote account, and the last alert sent for each one.
 * Prefers the dashboard Supabase project, in its own tables.
 * Vercel KV remains a fallback. Neither store is the delegator bot's data.
 */

const PREFIX = "valert:";

function kvConfigured() {
  return Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function redis(command) {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    const err = new Error("KV_REST_API_URL and KV_REST_API_TOKEN are not set on this project.");
    err.code = "KV_MISSING";
    throw err;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(8000)
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error || `KV HTTP ${res.status}`);
  return json.result;
}

function parseJson(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function createKvStore() {
  return {
    configured: kvConfigured,
    async getSub(chatId) {
      return parseJson(await redis(["GET", `${PREFIX}sub:${chatId}`]));
    },
    async saveSub(sub) {
      const chatId = String(sub.chatId);
      await redis(["SADD", `${PREFIX}chats`, chatId]);
      await redis(["SET", `${PREFIX}sub:${chatId}`, JSON.stringify(sub)]);
      return sub;
    },
    async listSubs() {
      const ids = await redis(["SMEMBERS", `${PREFIX}chats`]);
      const list = Array.isArray(ids) ? ids.map(String) : [];
      const subs = [];
      for (const id of list) {
        const sub = parseJson(await redis(["GET", `${PREFIX}sub:${id}`]));
        if (sub) subs.push(sub);
      }
      return subs;
    },
    async getStatus(key) {
      return parseJson(await redis(["GET", `${PREFIX}status:${key}`]));
    },
    async setStatus(key, value) {
      await redis(["SET", `${PREFIX}status:${key}`, JSON.stringify(value)]);
    }
  };
}

function createMemoryStore() {
  const subs = new Map();
  const status = new Map();
  return {
    configured: () => true,
    async getSub(chatId) {
      return subs.get(String(chatId)) || null;
    },
    async saveSub(sub) {
      subs.set(String(sub.chatId), sub);
      return sub;
    },
    async listSubs() {
      return [...subs.values()];
    },
    async getStatus(key) {
      return status.get(key) || null;
    },
    async setStatus(key, value) {
      status.set(key, value);
    }
  };
}

function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function sb(table, { method = "GET", query = "", body, prefer } = {}) {
  const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${base}/rest/v1/${table}${query}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(prefer ? { Prefer: prefer } : {})
    },
    body: body == null ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }
  if (!res.ok) throw new Error(json?.message || `Supabase HTTP ${res.status}`);
  return json;
}

function createSupabaseStore() {
  return {
    configured: () => true,
    async getSub(chatId) {
      const rows = await sb("validator_alert_subs", {
        query: `?chat_id=eq.${encodeURIComponent(String(chatId))}&select=chat_id,watches`
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      return { chatId: row.chat_id, watches: row.watches || [] };
    },
    async saveSub(sub) {
      await sb("validator_alert_subs", {
        method: "POST",
        query: "?on_conflict=chat_id",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          chat_id: String(sub.chatId),
          watches: sub.watches || [],
          updated_at: new Date().toISOString()
        }
      });
      return sub;
    },
    async listSubs() {
      const rows = await sb("validator_alert_subs", { query: "?select=chat_id,watches" });
      return (Array.isArray(rows) ? rows : []).map(row => ({
        chatId: row.chat_id,
        watches: row.watches || []
      }));
    },
    async getStatus(key) {
      const rows = await sb("validator_alert_status", {
        query: `?watch_key=eq.${encodeURIComponent(key)}&select=state`
      });
      const row = Array.isArray(rows) ? rows[0] : null;
      return row ? row.state : null;
    },
    async setStatus(key, value) {
      await sb("validator_alert_status", {
        method: "POST",
        query: "?on_conflict=watch_key",
        prefer: "resolution=merge-duplicates,return=minimal",
        body: {
          watch_key: key,
          state: value,
          updated_at: new Date().toISOString()
        }
      });
    }
  };
}

function createStore() {
  if (supabaseConfigured()) return createSupabaseStore();
  if (kvConfigured()) return createKvStore();
  return {
    configured: () => false,
    async getSub() {
      throw new Error("Storage is not configured.");
    },
    async saveSub() {
      throw new Error("Storage is not configured.");
    },
    async listSubs() {
      throw new Error("Storage is not configured.");
    },
    async getStatus() {
      throw new Error("Storage is not configured.");
    },
    async setStatus() {
      throw new Error("Storage is not configured.");
    }
  };
}

module.exports = {
  PREFIX,
  createKvStore,
  createSupabaseStore,
  createStore,
  createMemoryStore
};
