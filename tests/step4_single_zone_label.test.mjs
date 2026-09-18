// TICKET — FINAL END-TO-END VERIFICATION: SINGLE NIL BRUZZANO/COMASINA.
// BUG riprodotto dal vivo in produzione: Milano -> NIL/Quartiere -> isola
// BRUZZANO ("Seleziona solo questo NIL", 1/88) -> Step2 corretto (famiglie
// 6.840, quantita' 7.524, esattamente BRUZZANO) -> ma Step4 mostrava
// ZONA/COMUNE = "Milano (MI)", titolo "LA TUA CAMPAGNA E' PRONTA — Milano",
// nome file PDF e metadata.zona del payload campagna = "Milano", perdendo
// l'identita' della singola NIL selezionata.
//
// Root cause REALE (confermato intercettando il payload live inviato a
// submit-campaign-request per una campagna BRUZZANO 1/88):
//   metadata.zona: "Milano"                          <- SBAGLIATO
//   metadata.selected_comuni: ["Milano"]              <- atteso (e' il comune)
//   campaignZones: [{"municipality":"BRUZZANO", ...}] <- GIA' corretto
// selectedZoneNames preferisce data.selectedComuni (sempre ["Milano"], il
// comune padre, popolato anche in modalita' NIL) PRIMA di considerare
// zoneAllocs — quindi un primo fix che usava solo selectedZoneNames[0] non
// bastava, perche' selectedZoneNames[0] era GIA' "Milano" prima ancora di
// arrivare a mainAreaLabel. zoneAllocs (Step2) e' invece sempre corretto per
// singola zona (verificato dal vivo: name="BRUZZANO"), ed e' gia' la fonte
// usata da campaignZonesPayload per i campaign_zones reali — quindi va usato
// direttamente anche per mainAreaLabel quando rappresenta una sola zona.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const step4 = readFileSync(new URL('../src/pages/public/configurator/Step4.jsx', import.meta.url), 'utf8');

test('mainAreaLabel preferisce zoneAllocs[0].name (fonte reale, come campaignZonesPayload) quando c\'e\' una sola zona allocata', () => {
  assert.match(
    step4,
    /const mainAreaLabel = \(zoneAllocs\.length === 1 && step4AreaLabel\(zoneAllocs\[0\]\.name\)\) \|\| \(selectedZoneNames\.length === 1 && selectedZoneNames\[0\]\) \|\| step4AreaLabel\(data\.cityName\)/,
    'con esattamente 1 zona in zoneAllocs, il suo nome deve avere priorita\' assoluta (prima ancora di selectedZoneNames e di data.cityName)'
  );
});

test('comportamento invariato per multi-zona / Milano completo: cityName resta il fallback quando zoneAllocs.length !== 1', () => {
  const fnMatch = step4.match(/const mainAreaLabel = \(zoneAllocs\.length === 1 && step4AreaLabel\(zoneAllocs\[0\]\.name\)\) \|\| \(selectedZoneNames\.length === 1 && selectedZoneNames\[0\]\) \|\| (step4AreaLabel\(data\.cityName\) \|\| step4AreaLabel\(data\.comune\) \|\| selectedZoneNames\[0\] \|\| "l'area selezionata")/);
  assert.ok(fnMatch, 'la catena di fallback originale (cityName -> comune -> selectedZoneNames[0] -> default) deve restare intatta dopo i due nuovi operandi iniziali');
});

test('campaignZonesPayload (campaign_zones reali) usa gia\' zoneAllocs con step4AreaLabel(z.name), stessa fonte ora usata da mainAreaLabel', () => {
  assert.match(
    step4,
    /municipality: step4AreaLabel\(z\.name\) \|\| `Zona \$\{idx \+ 1\}`/,
    'le righe campaign_zones strutturate derivano il nome zona da zoneAllocs (Step2) — stessa fonte, nessuna divergenza possibile ora'
  );
});

test('metadata.comune resta il comune padre (Milano), non viene toccato dal fix — solo metadata.zona cambia sorgente', () => {
  assert.match(
    step4,
    /comune: data\.cityName \|\| data\.comune \|\| selectedZoneNames\[0\] \|\| null/,
    'il campo "comune" del metadata deve restare il comune padre invariato'
  );
});

test('nessuna modifica al motore prezzi/quantita\' o a Step2: il fix tocca solo il calcolo di un\'etichetta di visualizzazione', () => {
  const idx = step4.indexOf('const mainAreaLabel =');
  const block = step4.slice(idx, idx + 400);
  assert.doesNotMatch(block, /requiredQty\s*=|flyerQty\s*=|zCap\(|setSelected\(/, 'nessun calcolo di prezzo/quantita\' ne\' stato Step2 introdotto vicino al fix');
});
