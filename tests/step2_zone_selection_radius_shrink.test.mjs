// P1 — BUG riprodotto dal vivo in produzione: Milano, Via Antonio Oroboni,
// Raggio 3km -> 1km (rapido). "Mostra dettagli zone" continuava a mostrare
// le 5 NIL del raggio 1km precedente (BRUZZANO/COMASINA/AFFORI/BOVISASCA/
// PARCO NORD) mentre copertura %, "12 NIL + 8 Comuni limitrofi" e la lista
// NIL principale già mostravano correttamente il raggio 3km (20 zone) —
// stato contraddittorio, non un errore generico di rete.
//
// Root cause: resolveZoneAutoSelection() confrontava `validPrev` (currentSelected
// filtrato agli id ancora disponibili) con `avail` per CONTENUTO ("stessa
// selezione, nessun cambiamento reale") ma restituiva `currentSelected`
// (l'array ORIGINALE, non filtrato) invece di `validPrev` (l'array filtrato).
// Quando il raggio si RESTRINGE, gli id del raggio precedente che sono
// SOTTOINSIEME del nuovo raggio (es. le 5 NIL da 1km, tutte contenute anche
// nelle 20 del raggio 3km precedente) fanno combaciare `validPrev` con
// `avail` per contenuto — ma `currentSelected` a quel punto ha ancora TUTTI
// i 20 id del raggio precedente, non solo i 5. Il codice restituiva quei 20
// id stale invece dei 5 corretti.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveZoneAutoSelection } from '../src/lib/step2/zoneSelection.js';

test('BUG — raggio si restringe (3km -> 1km): la selezione si riduce alle sole zone ancora disponibili, non resta sui 20 id del raggio precedente', () => {
  // 3km: 20 zone (12 NIL Milano + 8 comuni limitrofi), tutte selezionate.
  const zones3km = Array.from({ length: 20 }, (_, i) => `zone_3km_${i}`);
  // 1km: sottoinsieme reale delle 3km — 5 delle 20 zone (le più vicine al punto).
  const zones1km = [zones3km[0], zones3km[1], zones3km[2], zones3km[3], zones3km[4]];

  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: zones1km,
    prevAvailableIds: zones3km,
    currentSelected: zones3km, // ancora le 20 del raggio precedente (3km)
  });

  assert.deepEqual(
    out.slice().sort(),
    zones1km.slice().sort(),
    'la selezione deve ridursi esattamente alle 5 zone del nuovo raggio (1km), mai restare sui 20 id del raggio precedente'
  );
  assert.equal(out.length, 5, 'zoneListSourceCount/selZones.length non deve mai riportare 20 quando il raggio reale è 1km con 5 zone');
});

test('caso limite: validPrev e avail combaciano per contenuto E per lunghezza (nessuna zona persa) -> stesso riferimento (no-op, invariato)', () => {
  const all = ['a', 'b', 'c'];
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: ['a', 'b', 'c'],
    prevAvailableIds: ['a', 'b', 'c'],
    currentSelected: all,
  });
  assert.strictEqual(out, all, 'quando nessun id sparisce, il riferimento resta invariato (bail-out React preservato)');
});

test('caso limite: raggio si AMPLIA da un sottoinsieme manuale reale -> non forza inaspettatamente lo shrink', () => {
  // Selezione manuale reale (utente ha scelto solo 1 zona su 3 disponibili in precedenza).
  const manual = ['a'];
  const out = resolveZoneAutoSelection({
    hasUsefulApiZones: true,
    availableIds: ['a', 'b', 'c', 'd'], // il raggio si amplia, 'a' resta disponibile
    prevAvailableIds: ['a', 'b', 'c'],
    currentSelected: manual,
  });
  assert.strictEqual(out, manual, 'la scelta manuale di 1 zona su 3 precedenti resta intatta anche quando il raggio si amplia');
});
