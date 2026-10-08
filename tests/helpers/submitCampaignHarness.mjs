// Local harness for supabase/functions/submit-campaign-request/index.ts.
// Runs the real handler in Node against an in-memory Supabase double: no
// network, no real submissions, no database writes. The double reproduces the
// PostgREST behaviours the function relies on: jsonb key re-ordering and
// numeric round-trip, `date` columns truncated to YYYY-MM-DD, `metadata->>key`
// text filters, embedded campaign_zones(*), order/limit/maybeSingle/single.
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register(new URL("./edgeFunctionLoader.mjs", import.meta.url));

const isRecord = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);

// jsonb stores objects with keys re-ordered (length, then bytewise) and no
// duplicate keys; a JSON round-trip with sorted keys is a faithful-enough
// stand-in for "key order is not preserved".
function jsonbRoundTrip(value) {
  const sortDeep = (v) => {
    if (Array.isArray(v)) return v.map(sortDeep);
    if (isRecord(v)) {
      return Object.fromEntries(Object.keys(v).sort((a, b) => a.length - b.length || (a < b ? -1 : a > b ? 1 : 0)).map((k) => [k, sortDeep(v[k])]));
    }
    return v;
  };
  return value === undefined ? null : JSON.parse(JSON.stringify(sortDeep(value)));
}

const dateColumn = (v) => (v == null || v === "" ? null : String(v).slice(0, 10));

export function createMockSupabase({ users = {}, faults = {}, hooks = {} } = {}) {
  const db = { campaigns: [], campaign_zones: [] };
  const calls = [];
  let seq = 0;
  const tick = () => new Promise((r) => setImmediate(r));

  const readColumn = (row, column) => {
    const m = /^metadata->>(.+)$/.exec(column);
    if (m) {
      const value = isRecord(row.metadata) ? row.metadata[m[1]] : undefined;
      return value == null ? null : typeof value === "string" ? value : JSON.stringify(value);
    }
    return row[column];
  };

  function query(table) {
    const state = { table, op: "select", filters: [], order: null, limit: null, columns: "*", rows: null, mode: "many" };
    const builder = {
      select(columns = "*") { if (state.op !== "insert") state.op = "select"; state.columns = columns; state.returning = true; return builder; },
      insert(rows) { state.op = "insert"; state.rows = Array.isArray(rows) ? rows : [rows]; return builder; },
      delete() { state.op = "delete"; return builder; },
      eq(column, value) { state.filters.push((row) => readColumn(row, column) === value); return builder; },
      gte(column, value) { state.filters.push((row) => readColumn(row, column) >= value); return builder; },
      order(column, { ascending = true } = {}) { state.order = { column, ascending }; return builder; },
      limit(n) { state.limit = n; return builder; },
      maybeSingle() { state.mode = "maybeSingle"; return builder; },
      single() { state.mode = "single"; return builder; },
      then(resolve, reject) { return run().then(resolve, reject); },
    };

    const withEmbeds = (row) => {
      if (table === "campaigns" && /campaign_zones\(\*\)/.test(state.columns)) {
        return { ...structuredClone(row), campaign_zones: db.campaign_zones.filter((z) => z.campaign_id === row.id).map((z) => structuredClone(z)) };
      }
      return structuredClone(row);
    };

    async function run() {
      await tick();
      calls.push({ table, op: state.op });
      if (state.op === "insert") {
        if (hooks.beforeInsert) await hooks.beforeInsert(table, state.rows);
        const fault = table === "campaigns" ? faults.campaignsInsert : faults.zonesInsert;
        if (fault) return { data: null, error: { message: fault } };
        const stored = state.rows.map((r) => {
          const row = { ...structuredClone(r), id: `${table === "campaigns" ? "camp" : "zone"}-${String(++seq).padStart(4, "0")}` };
          if (table === "campaigns") {
            row.metadata = jsonbRoundTrip(r.metadata ?? {});
            row.start_date = dateColumn(r.start_date);
            row.end_date = dateColumn(r.end_date);
            row.quantity = r.quantity == null ? null : Math.round(Number(r.quantity));
            row.total_amount = r.total_amount == null ? null : Number(r.total_amount);
          }
          if (table === "campaign_zones" && r.polygon_geojson != null && typeof r.polygon_geojson === "string") {
            try { row.polygon_geojson = jsonbRoundTrip(JSON.parse(r.polygon_geojson)); } catch { /* text kept */ }
          }
          db[table].push(row);
          return row;
        });
        if (!state.returning) return { data: null, error: null };
        if (state.mode === "single") return { data: withEmbeds(stored[0]), error: null };
        return { data: stored.map(withEmbeds), error: null };
      }
      if (state.op === "delete") {
        const before = db[table].length;
        db[table] = db[table].filter((row) => !state.filters.every((f) => f(row)));
        return { data: null, error: null, count: before - db[table].length };
      }
      if (table === "campaigns" && faults.campaignsSelect) return { data: null, error: { message: faults.campaignsSelect } };
      let rows = db[table].filter((row) => state.filters.every((f) => f(row)));
      if (state.order) {
        const { column, ascending } = state.order;
        rows = [...rows].sort((a, b) => (a[column] < b[column] ? -1 : a[column] > b[column] ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (state.limit != null) rows = rows.slice(0, state.limit);
      if (state.mode === "maybeSingle") {
        if (rows.length > 1) return { data: null, error: { message: "multiple rows" } };
        return { data: rows[0] ? withEmbeds(rows[0]) : null, error: null };
      }
      if (state.mode === "single") {
        if (rows.length !== 1) return { data: null, error: { message: "not single" } };
        return { data: withEmbeds(rows[0]), error: null };
      }
      return { data: rows.map(withEmbeds), error: null };
    }
    return builder;
  }

  return {
    db,
    calls,
    client: {
      from: (table) => query(table),
      auth: {
        async getUser(token) {
          const user = users[token];
          return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid token" } };
        },
      },
    },
  };
}

let loadCounter = 0;

/** Loads a fresh copy of the function module and returns an invoke(body, opts) helper. */
export async function loadSubmitFunction(filePath) {
  globalThis.Deno = { env: { get: (k) => ({ SUPABASE_URL: "http://mock.local", SUPABASE_SERVICE_ROLE_KEY: "mock-service-role" })[k] } };
  await import(`${pathToFileURL(filePath).href}?load=${++loadCounter}`);
  const handler = globalThis.__edgeHandler;
  if (typeof handler !== "function") throw new Error("serve() handler not registered");
  return async function invoke(mock, body, { token = null, method = "POST", rawBody = null } = {}) {
    globalThis.__edgeCreateClient = () => mock.client;
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = new Request("http://edge.local/submit-campaign-request", {
      method,
      headers,
      body: method === "OPTIONS" ? undefined : rawBody ?? JSON.stringify(body),
    });
    const res = await handler(req);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* OPTIONS returns "ok" */ }
    return { status: res.status, json, text };
  };
}
