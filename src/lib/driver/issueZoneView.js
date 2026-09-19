// Segnalazioni cliente lato Driver: le segnalazioni sono per ZONA. Mostra come
// "attive" solo quelle della zona in corso (o assegnate all'incarico senza zona
// specifica dall'Admin); quelle di zone future restano visibili come
// "Segnalazione futura" ma NON danno azioni e NON attivano/avviano la zona.

export const ISSUE_DONE_STATUSES = Object.freeze(['resolved', 'not_resolvable']);

export function isIssueDone(issue) {
  return ISSUE_DONE_STATUSES.includes(issue?.status);
}

export function partitionIssuesByZone(issues = [], activeZoneId = null) {
  const active = [];
  const future = [];
  const done = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    if (isIssueDone(issue)) { done.push(issue); continue; }
    const zoneId = issue.zone_id || null;
    if (zoneId == null || (activeZoneId != null && zoneId === activeZoneId)) active.push(issue);
    else future.push(issue);
  }
  return { active, future, done };
}

export const RESOLUTION_NOTE_REQUIRED_MESSAGE = 'La nota di risoluzione e\' obbligatoria.';

export function validateResolutionNote(note) {
  const text = String(note ?? '').trim();
  return text ? { ok: true, note: text } : { ok: false, error: RESOLUTION_NOTE_REQUIRED_MESSAGE };
}
