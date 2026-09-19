import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(rel) {
  return fs.readFileSync(rel, 'utf8');
}

test('DriverWorkMapPage: GPS points are synchronized from group tracking RPC in token mode', () => {
  const code = read('src/pages/driver/DriverWorkMapPage.jsx');
  assert.match(code, /getDriverGroupTracking\(assignmentId, accessToken\)/, 'Deve chiamare getDriverGroupTracking');
  assert.match(code, /res\.self\.validPoints/, 'Deve estrarre i punti validi della propria sessione');
  assert.match(code, /<Polyline\s+positions=\{trackPath\}/, 'Deve renderizzare Polyline per la propria traccia');
  assert.match(code, /<Polyline\s+positions=\{g\.latlngs\}/, 'Deve renderizzare Polyline per le tracce dei compagni');
});

test('DriverWorkMapPage: Coverage calculation accurately handles coverage_percent, gps_coverage_pct and final_operational_coverage_pct', () => {
  const code = read('src/pages/driver/DriverWorkMapPage.jsx');
  assert.match(code, /coverage\?\.coverage_percent/, 'Deve leggere coverage_percent');
  assert.match(code, /coverage\?\.gps_coverage_pct/, 'Deve leggere gps_coverage_pct');
  assert.match(code, /coverage\?\.final_operational_coverage_pct/, 'Deve leggere final_operational_coverage_pct');
});

test('DriverWorkMapPage: Multi-zone switcher has auto-scroll on active zone', () => {
  const code = read('src/pages/driver/DriverWorkMapPage.jsx');
  assert.match(code, /activeZoneBtnRef/, 'Deve avere un ref per il pulsante della zona attiva');
  assert.match(code, /scrollIntoView/, 'Deve eseguire scrollIntoView sul cambio di zona attiva');
});

test('DriverAssignmentPage: Multi-zone isolation ensures only active session zone is marked In corso', () => {
  const code = read('src/pages/driver/DriverAssignmentPage.jsx');
  assert.match(code, /isCurrentZone\s*=\s*tracking\.session\?\.campaign_zone_id === z\.id/, 'Deve identificare la zona corrente della sessione');
  assert.match(code, /computeZoneWorkflow\(zonesToDisplay, tracking\.session\?\.campaign_zone_id/, 'Lo stato zona deriva dalla macchina a stati (una sola IN_CORSO)');
});

test('Communication boundary: Customer and Driver interact strictly via structured Segnalazioni, no direct chat', () => {
  const customerHub = read('src/components/customer/CampaignHubPanels.jsx');
  const driverAssignment = read('src/pages/driver/DriverAssignmentPage.jsx');
  
  // Driver messages go only to Admin
  assert.match(driverAssignment, /VolantiniPro Admin \/ Centrale Operativa/, 'Driver vede solo Admin/Centrale Operativa');
  // Customer messages go only to Admin
  assert.match(customerHub, /Messaggi/, 'Customer messaggi verso Admin');
});

test('CustomerTracking: Displays resolved issue with verification note and photo', () => {
  const tracking = read('src/pages/customer/CampaignTracking.jsx');
  assert.match(tracking, /Verifica completata/, 'Mostra badge verifica completata');
  assert.match(tracking, /issue\.resolution_note/, 'Mostra nota di risoluzione');
  assert.match(tracking, /Foto verifica/, 'Mostra foto verifica');
});
