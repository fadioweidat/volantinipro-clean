// Comune autocomplete: Supabase RPC search_municipalities first, automatic
// Nominatim fallback when the RPC is missing/failing/empty. Plus the
// migration contract (security definer, grants, escaping, limits).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  searchItalianMunicipalities,
  searchMunicipalitiesRpc,
  mapMunicipalityRow,
  __resetMunicipalitySearchForTests,
} from "../src/lib/geocoding/searchItalianMunicipalities.js";

const ENV = { url: "https://proj.supabase.co", anonKey: "sb_publishable_test_key_000" };
const RPC_ROWS = [
  { municipality_name: "Cormano", province_code: "015", province_name: "Milano", centroid_lat: 45.5449, centroid_lng: 9.1696 },
];
const NOMINATIM_ROWS = [
  { place_id: 1, display_name: "Cormano, Milano, Lombardia, Italia", name: "Cormano", lat: "45.55", lon: "9.16", address: { city: "Cormano", county: "Milano", country_code: "it" }, addresstype: "town" },
];

function spyFetch(handlers) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), method: options?.method || "GET", headers: options?.headers || {} });
    const h = handlers.find(([match]) => match.test(String(url)));
    if (!h) throw new Error(`unexpected fetch ${url}`);
    return h[1]();
  };
  return { calls, fetchImpl };
}
const json = (status, body) => () => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("RPC available: 'Corm' -> Cormano from ISTAT, no Nominatim call, read-only GET with anon key", async () => {
  __resetMunicipalitySearchForTests();
  const { calls, fetchImpl } = spyFetch([[/rpc\/search_municipalities/, json(200, RPC_ROWS)]]);
  const list = await searchItalianMunicipalities("Corm", { fetchImpl, env: ENV });
  assert.equal(list[0].name, "Cormano");
  assert.equal(list[0].province, "Milano");
  assert.equal(list[0].source, "istat");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
  assert.match(calls[0].url, /\/rest\/v1\/rpc\/search_municipalities\?prefix=Corm$/);
  assert.equal(calls[0].headers.apikey, ENV.anonKey);
});

test("RPC not deployed (404): falls back to Nominatim and stops calling the RPC", async () => {
  __resetMunicipalitySearchForTests();
  const { calls, fetchImpl } = spyFetch([
    [/rpc\/search_municipalities/, json(404, { code: "PGRST202" })],
    [/nominatim/, json(200, NOMINATIM_ROWS)],
  ]);
  const first = await searchItalianMunicipalities("Cormano", { fetchImpl, env: ENV });
  assert.equal(first[0].name, "Cormano");
  const second = await searchItalianMunicipalities("Cormano", { fetchImpl, env: ENV });
  assert.equal(second[0].name, "Cormano");
  assert.equal(calls.filter((c) => /rpc/.test(c.url)).length, 1, "RPC tried once per session after a 404");
  assert.equal(calls.filter((c) => /nominatim/.test(c.url)).length, 2);
});

test("RPC error, network failure or empty result: Nominatim fallback", async () => {
  for (const rpc of [json(500, { message: "boom" }), () => { throw new TypeError("Failed to fetch"); }, json(200, [])]) {
    __resetMunicipalitySearchForTests();
    const { calls, fetchImpl } = spyFetch([[/rpc\/search_municipalities/, rpc], [/nominatim/, json(200, NOMINATIM_ROWS)]]);
    const list = await searchItalianMunicipalities("Cormano", { fetchImpl, env: ENV });
    assert.equal(list[0].name, "Cormano");
    assert.ok(calls.some((c) => /nominatim/.test(c.url)));
  }
});

test("no Supabase config or prefix shorter than 2: RPC skipped", async () => {
  __resetMunicipalitySearchForTests();
  const { calls, fetchImpl } = spyFetch([]);
  assert.equal(await searchMunicipalitiesRpc("Corm", { fetchImpl, env: {} }), null);
  assert.equal(await searchMunicipalitiesRpc("C", { fetchImpl, env: ENV }), null);
  assert.equal(calls.length, 0);
});

test("row mapping drops rows without a usable centroid", () => {
  assert.equal(mapMunicipalityRow({ municipality_name: "X", centroid_lat: null, centroid_lng: 9 }), null);
  const ok = mapMunicipalityRow(RPC_ROWS[0]);
  assert.deepEqual([ok.name, ok.lat, ok.lng, ok.provinceCode], ["Cormano", 45.5449, 9.1696, "015"]);
});

test("migration contract", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261017120000_search_municipalities.sql", import.meta.url), "utf8");
  const rollback = readFileSync(new URL("../supabase/migrations/rollback/20261017120000_search_municipalities.rollback.sql", import.meta.url), "utf8");
  assert.match(sql, /create or replace function public\.search_municipalities\(prefix text\)/);
  assert.match(sql, /\bstable\b/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /returns table \(\s*municipality_name text,\s*province_code text,\s*province_name text,\s*centroid_lat numeric,\s*centroid_lng numeric\s*\)/);
  assert.match(sql, /char_length\(raw\) >= 2/);
  assert.match(sql, /limit 10;/);
  assert.match(sql, /replace\(replace\(replace\(q, '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\)/);
  assert.match(sql, /like p\.like_pattern escape '\\'/);
  assert.match(sql, /order by \(x\.normalized_name = p\.q\) desc/);
  assert.match(sql, /revoke all on function public\.search_municipalities\(text\) from public;/);
  assert.match(sql, /revoke all on function public\.search_municipalities\(text\) from service_role;/);
  assert.match(sql, /grant execute on function public\.search_municipalities\(text\) to anon, authenticated;/);
  assert.doesNotMatch(sql, /\b(insert|update|delete)\s+(into|public\.|from)/i);
  assert.doesNotMatch(sql, /create policy|alter table/i);
  assert.match(rollback, /drop function if exists public\.search_municipalities\(text\);/);
});
