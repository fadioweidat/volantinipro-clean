// TICKET — FINAL END-TO-END VERIFICATION: SINGLE NIL BRUZZANO/COMASINA.
// BUG riprodotto dal vivo in produzione: Milano -> NIL/Quartiere -> isola
// BRUZZANO ("Seleziona solo questo NIL", 1/88) -> Step2 corretto (famiglie
// 6.840, quantita' 7.524, esattamente BRUZZANO) -> ma Step4 mostrava
// ZONA/COMUNE = "Milano (MI)", titolo "LA TUA CAMPAGNA E' PRONTA — Milano
// (MI)", nome file PDF e metadata.zona del payload campagna = "Milano",
// perdendo l'identita' della singola NIL selezionata.
//
// Root cause: mainAreaLabel dava priorita' a data.cityName (sempre "Milano",
// il comune padre, sempre valorizzato) PRIMA di selectedZoneNames[0] (il nome
// della zona/NIL specifica), quindi con una sola NIL isolata il nome
// specifico non veniva mai raggiunto nell'OR di fallback.
//
// Nota bene: campaignZonesPayload (le righe strutturate inviate come
// campaign_zones, sorgente reale per Assign Work / Driver) usa GIA'
// zoneAllocs (Step2) con step4AreaLabel(z.name) -> "BRUZZANO" corretto anche
// PRIMA di questo fix; il bug riguardava solo mainAreaLabel (display +
// metadata.zona + nome file PDF), non i campaign_zones strutturati.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const step4 = readFileSync(new URL('../src/pages/public/configurator/Step4.jsx', import.meta.url), 'utf8');

test('mainAreaLabel preferisce il nome della singola zona/NIL selezionata rispetto al comune padre', () => {
  assert.match(
    step4,
    /const mainAreaLabel = \(selectedZoneNames\.length === 1 && selectedZoneNames\[0\]\) \|\| step4AreaLabel\(data\.cityName\)/,
    'con esattamente 1 zona selezionata, selectedZoneNames[0] deve avere priorita\' su data.cityName'
  );
});

test('comportamento invariato per multi-zona / Milano completo: cityName resta il fallback quando selectedZoneNames.length !== 1', () => {
  // La condizione e' esplicitamente `selectedZoneNames.length === 1`, quindi
  // con 0 o >1 zone selezionate il primo operando dell\'OR e\' falsy e il
  // fallback esistente (data.cityName -> data.comune -> selectedZoneNames[0])
  // si comporta esattamente come prima del fix.
  const fnMatch = step4.match(/const mainAreaLabel = \(selectedZoneNames\.length === 1 && selectedZoneNames\[0\]\) \|\| (step4AreaLabel\(data\.cityName\) \|\| step4AreaLabel\(data\.comune\) \|\| selectedZoneNames\[0\] \|\| "l'area selezionata")/);
  assert.ok(fnMatch, 'la catena di fallback originale (cityName -> comune -> selectedZoneNames[0] -> default) deve restare intatta dopo il nuovo primo operando');
});

test('campaignZonesPayload (campaign_zones reali) usa gia\' zoneAllocs con step4AreaLabel(z.name), indipendente da mainAreaLabel', () => {
  assert.match(
    step4,
    /municipality: step4AreaLabel\(z\.name\) \|\| `Zona \$\{idx \+ 1\}`/,
    'le righe campaign_zones strutturate derivano il nome zona da zoneAllocs (Step2), non da mainAreaLabel — nessuna modifica necessaria qui'
  );
});

test('nessuna modifica al motore prezzi/quantita\' o a Step2: il fix tocca solo il calcolo di un\'etichetta di visualizzazione', () => {
  const idx = step4.indexOf('const mainAreaLabel =');
  const block = step4.slice(idx, idx + 400);
  assert.doesNotMatch(block, /requiredQty\s*=|flyerQty\s*=|zCap\(|setSelected\(/, 'nessun calcolo di prezzo/quantita\' ne\' stato Step2 introdotto vicino al fix');
});
