// Ricerca civici Step 2 — TEST REALI (rete). Non fanno parte di `npm test`.
// Esecuzione: npm run test:geocoding-live
// Interrogano lo stradario ufficiale del Comune di Milano (ds634, CC BY 4.0)
// e, se presente VITE_MAPBOX_TOKEN, Mapbox con il dominio di produzione come
// Referer (il token e' limitato ai domini volantinipro.it).
import test from "node:test";
import assert from "node:assert/strict";
import { CIVIC_REGISTRY_STATUS, lookupMilanoCivic } from "../../src/lib/step2/milanoCivicRegistry.js";
import { matchesRequestedCivic, parseRequestedCivic } from "../../src/lib/step2/civicAddressMatch.js";

test("reale: Viale Certosa 330 non e' nello stradario (civici 1-316)", async () => {
  const r = await lookupMilanoCivic(parseRequestedCivic("Viale Certosa 330, Milano"));
  assert.equal(r.status, CIVIC_REGISTRY_STATUS.NOT_IN_REGISTRY, JSON.stringify(r));
  assert.equal(r.range.min, 1);
  assert.ok(r.range.max < 330, `ultimo civico ${r.range.max}`);
});

test("reale: Viale Certosa 316 e 282/A verificati con le coordinate del Comune", async () => {
  const a = await lookupMilanoCivic(parseRequestedCivic("Viale Certosa 316"));
  assert.equal(a.status, CIVIC_REGISTRY_STATUS.VERIFIED);
  assert.ok(Math.abs(a.result.lat - 45.5036) < 0.001 && Math.abs(a.result.lng - 9.1222) < 0.001);
  const b = await lookupMilanoCivic(parseRequestedCivic("Viale Certosa 282/A"));
  assert.equal(b.status, CIVIC_REGISTRY_STATUS.VERIFIED);
  assert.equal(b.result.houseNumber, "282A");
});

test("reale: PV1 Bruzzano — Via Oroboni 10 verificata (NIL BRUZZANO)", async () => {
  const r = await lookupMilanoCivic(parseRequestedCivic("Via Oroboni 10, Milano"));
  assert.equal(r.status, CIVIC_REGISTRY_STATUS.VERIFIED);
  assert.equal(r.result.street, "Via Antonio Oroboni");
  assert.equal(r.result.nil, "BRUZZANO");
});

test("reale: Mapbox restituisce un '330' che lo stradario non conferma", { skip: !process.env.VITE_MAPBOX_TOKEN && "VITE_MAPBOX_TOKEN assente" }, async () => {
  const q = "Viale Certosa 330, Milano";
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json?access_token=${process.env.VITE_MAPBOX_TOKEN}&country=IT&types=address&language=it&limit=3`;
  const res = await fetch(url, { headers: { Referer: "https://www.volantinipro.it/" } });
  assert.equal(res.status, 200);
  const f = (await res.json()).features?.[0];
  const hit = { street: f?.text, houseNumber: f?.address };
  assert.equal(matchesRequestedCivic(q, hit), true, "Mapbox dichiara il civico 330");
  const registry = await lookupMilanoCivic(parseRequestedCivic(q));
  assert.equal(registry.status, CIVIC_REGISTRY_STATUS.NOT_IN_REGISTRY, "ma il Comune non lo ha: il punto non va accettato");
});
