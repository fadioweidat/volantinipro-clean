/**
 * tests/step2_territory_controls_wiring.test.mjs
 *
 * Test di regressione statico/deterministico per il bug critico rilevato
 * nel regression audit del 2026-08-24: Step2TerritoryControlsPanel.jsx
 * (componente estratto da Step2.jsx nel refactor 368bfd7) referenziava 6
 * identificatori (svcType, pill, geocodeSuggestions,
 * selectAddressPointInMilano, appendMunicipalityToActiveZone,
 * searchedLocation) rimasti nel parent Step2.jsx e mai passati come props,
 * causando un ReferenceError al primo render del configuratore pubblico
 * (Step 2, tab Comune/Raggio, utenti non-admin).
 *
 * Questo test legge i sorgenti come testo (nessun import React/JSX, nessun
 * bundler/jsdom necessario — coerente con lo stile già usato altrove nel
 * repo, es. tests/admin_operational_home.test.mjs) e verifica per ciascuna
 * delle 6 dipendenze critiche che sia:
 *   1. presente nella destructuring props del child
 *   2. passata dal punto di render nel parent Step2.jsx
 *
 * Deve fallire sul codice rotto (pre-fix) e passare dopo il fix.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CHILD_PATH = '../src/pages/public/configurator/step2/Step2TerritoryControlsPanel.jsx';
const PARENT_PATH = '../src/pages/public/configurator/Step2.jsx';

const CRITICAL_DEPENDENCIES = [
  'svcType',
  'pill',
  'geocodeSuggestions',
  'selectAddressPointInMilano',
  'appendMunicipalityToActiveZone',
  'searchedLocation',
];

const childSource = readFileSync(new URL(CHILD_PATH, import.meta.url), 'utf8');
const parentSource = readFileSync(new URL(PARENT_PATH, import.meta.url), 'utf8');

// La firma della funzione del componente: `export function Step2TerritoryControlsPanel({ ... }) {`
// Estrae SOLO la lista dei nomi destrutturati tra le graffe (non l'intero
// corpo), cosi' un identificatore usato solo nel body ma non destrutturato
// non conta come "presente nelle props".
function extractChildPropsList(source) {
  const match = source.match(/export function Step2TerritoryControlsPanel\(\{([\s\S]*?)\}\)\s*\{/);
  assert.ok(match, 'Non trovo la firma di Step2TerritoryControlsPanel: il file e\' cambiato in modo inatteso');
  return match[1];
}

// Il blocco JSX dove il parent renderizza <Step2TerritoryControlsPanel ... />,
// dal tag di apertura alla chiusura `/>` che lo segue.
function extractParentRenderBlock(source) {
  const start = source.indexOf('<Step2TerritoryControlsPanel');
  assert.ok(start !== -1, 'Non trovo il punto di render <Step2TerritoryControlsPanel ... /> in Step2.jsx');
  const end = source.indexOf('/>', start);
  assert.ok(end !== -1, 'Non trovo la chiusura /> del render di Step2TerritoryControlsPanel');
  return source.slice(start, end + 2);
}

describe('Step2TerritoryControlsPanel — wiring props critiche (regressione 2026-08-24)', () => {
  const childProps = extractChildPropsList(childSource);
  const parentRenderBlock = extractParentRenderBlock(parentSource);

  for (const dep of CRITICAL_DEPENDENCIES) {
    test(`"${dep}" è presente nella destructuring props del child`, () => {
      const propNamePattern = new RegExp(`(^|[,{]\\s*)${dep}(\\s*[,}])`);
      assert.ok(
        propNamePattern.test(childProps),
        `"${dep}" deve comparire nella destructuring props di Step2TerritoryControlsPanel — se manca, ogni uso nel body e' un ReferenceError al render`
      );
    });

    test(`"${dep}" è passata dal parent Step2.jsx al render di Step2TerritoryControlsPanel`, () => {
      const passedAsPropPattern = new RegExp(`\\b${dep}=\\{${dep}\\}`);
      assert.ok(
        passedAsPropPattern.test(parentRenderBlock),
        `Step2.jsx deve passare ${dep}={${dep}} nel render di <Step2TerritoryControlsPanel ... /> — altrimenti il child riceve undefined`
      );
    });
  }

  test('ogni dipendenza critica realmente usata nel body del child è coperta dalle 6 verificate sopra', () => {
    // Guardia aggiuntiva: se in futuro il child inizia a usare uno dei 6
    // nomi con un uso diverso (es. rinominato), la sola assenza dalla lista
    // props sarebbe comunque intercettata dai test sopra. Qui verifichiamo
    // solo che i 6 nomi compaiano effettivamente nel body (altrimenti la
    // dipendenza sarebbe morta e il test perderebbe di senso).
    for (const dep of CRITICAL_DEPENDENCIES) {
      const usedInBodyPattern = new RegExp(`\\b${dep}\\b`, 'g');
      const occurrences = (childSource.match(usedInBodyPattern) || []).length;
      // Almeno 2 occorrenze: una nella destructuring, una nell'uso reale.
      assert.ok(
        occurrences >= 2,
        `"${dep}" dovrebbe comparire sia nella destructuring sia in almeno un punto d'uso nel body di Step2TerritoryControlsPanel.jsx`
      );
    }
  });
});
