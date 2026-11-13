#!/usr/bin/env node
// Genera src/lib/istat/milanoNilIstatShares.json: famiglie e abitanti dei 88 NIL
// di Milano riproporzionati in modo che la somma sia ESATTAMENTE il dato ISTAT
// del comune (741.887 famiglie, 1.365.698 abitanti, bilancio demografico al
// 31/12/2024), con il metodo del resto maggiore.
//
// Pesi = famiglie / abitanti per NIL dello snapshot "Milano intera"
// (src/lib/quote/milanoWholeCitySnapshot.json, risposta reale di analysis-istat),
// cioe' la quota di superficie usata oggi dalla RPC get_nil_breakdown_in_radius.
// Se il database e' gia' normalizzato (somma = ISTAT) la tabella coincide con le
// righe del database.
//
// Uso: npm run snapshot:milano (facoltativo, aggiorna lo snapshot) e poi
//      node scripts/build-milano-nil-istat-shares.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { largestRemainder } from '../src/lib/istat/largestRemainder.js';
import { MILANO_ISTAT_HOUSEHOLDS, MILANO_ISTAT_POPULATION, MILANO_NIL_COUNT } from '../src/lib/istat/milanoIstatTotals.js';

const SNAPSHOT = fileURLToPath(new URL('../src/lib/quote/milanoWholeCitySnapshot.json', import.meta.url));
const OUT = fileURLToPath(new URL('../src/lib/istat/milanoNilIstatShares.json', import.meta.url));

const snapshot = JSON.parse(readFileSync(SNAPSHOT, 'utf8'));
const rows = (snapshot?.data?.comuni_breakdown || []).filter((r) => r.territory_level === 'nil' && String(r.nil_code ?? '').trim());
const codes = new Set(rows.map((r) => String(r.nil_code).trim()));
if (rows.length !== MILANO_NIL_COUNT || codes.size !== MILANO_NIL_COUNT) {
  console.error(`Snapshot non valido: ${rows.length} righe NIL, ${codes.size} codici (attesi ${MILANO_NIL_COUNT}).`);
  process.exit(1);
}
const key = (r) => String(r.nil_code).trim();
const households = largestRemainder(MILANO_ISTAT_HOUSEHOLDS, rows.map((r) => ({ key: key(r), weight: Number(r.households_total) })));
const population = largestRemainder(MILANO_ISTAT_POPULATION, rows.map((r) => ({ key: key(r), weight: Number(r.population_total) })));

const nils = {};
for (const r of [...rows].sort((a, b) => Number(key(a)) - Number(key(b)))) {
  nils[key(r)] = { name: r.nil_name, households: households.get(key(r)), population: population.get(key(r)) };
}
const sumH = Object.values(nils).reduce((s, n) => s + n.households, 0);
const sumP = Object.values(nils).reduce((s, n) => s + n.population, 0);
if (sumH !== MILANO_ISTAT_HOUSEHOLDS || sumP !== MILANO_ISTAT_POPULATION) {
  console.error(`Somma errata: ${sumH} famiglie, ${sumP} abitanti.`);
  process.exit(1);
}

const out = {
  version: 1,
  source: 'ISTAT, Bilancio demografico e popolazione residente al 31 dicembre 2024 (comune 015146), ripartito sui 88 NIL in proporzione alla superficie',
  method: 'largest_remainder',
  weightsFrom: { file: 'src/lib/quote/milanoWholeCitySnapshot.json', generatedAt: snapshot.generatedAt },
  // Somma dei NIL nel database quando la tabella e' stata generata: serve al
  // normalizzatore per riconoscere i valori attesi (vedi matchesShare).
  databaseNilSum: { households: rows.reduce((s, r) => s + Number(r.households_total), 0), population: rows.reduce((s, r) => s + Number(r.population_total), 0) },
  totals: { households: sumH, population: sumP },
  nils,
};
writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`);
console.log(`Scritto ${OUT}: ${Object.keys(nils).length} NIL, ${sumH} famiglie, ${sumP} abitanti.`);
