export const AI_SOURCE_IDS = Object.freeze({
  CLIENTS: "clienti",
  CAMPAIGNS: "campaigns",
  LEGACY_CAMPAIGNS: "campagne",
  DELIVERY_SESSIONS: "delivery_sessions",
  GPS_POINTS: "gps_tracking_points",
  PROOF_PHOTOS: "proof_photos",
  ASSIGNED_ZONES: "assigned_zones",
  COVERAGE_CORRECTIONS: "admin_coverage_corrections",
  WAITLIST: "smart_pairing_waitlist",
  ACTIVITY_LOG: "activity_log",
  AUDIT_LOG: "audit_log",
});

const source = (id, label, timestampFields) => Object.freeze({
  id,
  label,
  kind: "database",
  table: id,
  timestampFields: Object.freeze(timestampFields),
});

export const AI_SOURCE_CATALOG = Object.freeze({
  [AI_SOURCE_IDS.CLIENTS]: source(AI_SOURCE_IDS.CLIENTS, "Profilo cliente", ["updated_at", "created_at"]),
  [AI_SOURCE_IDS.CAMPAIGNS]: source(AI_SOURCE_IDS.CAMPAIGNS, "Campagne operative", ["updated_at", "created_at"]),
  [AI_SOURCE_IDS.LEGACY_CAMPAIGNS]: source(AI_SOURCE_IDS.LEGACY_CAMPAIGNS, "Campagne cliente", ["updated_at", "created_at"]),
  [AI_SOURCE_IDS.DELIVERY_SESSIONS]: source(AI_SOURCE_IDS.DELIVERY_SESSIONS, "Sessioni di distribuzione", ["ended_at", "started_at", "updated_at"]),
  [AI_SOURCE_IDS.GPS_POINTS]: source(AI_SOURCE_IDS.GPS_POINTS, "Punti GPS", ["recorded_at", "created_at"]),
  [AI_SOURCE_IDS.PROOF_PHOTOS]: source(AI_SOURCE_IDS.PROOF_PHOTOS, "Foto di prova", ["reviewed_at", "captured_at", "created_at"]),
  [AI_SOURCE_IDS.ASSIGNED_ZONES]: source(AI_SOURCE_IDS.ASSIGNED_ZONES, "Zone assegnate", ["updated_at", "created_at"]),
  [AI_SOURCE_IDS.COVERAGE_CORRECTIONS]: source(AI_SOURCE_IDS.COVERAGE_CORRECTIONS, "Correzioni copertura Admin", ["updated_at", "created_at"]),
  [AI_SOURCE_IDS.WAITLIST]: source(AI_SOURCE_IDS.WAITLIST, "Coda Smart Pairing", ["updated_at", "created_at"]),
  [AI_SOURCE_IDS.ACTIVITY_LOG]: source(AI_SOURCE_IDS.ACTIVITY_LOG, "Registro attivita", ["created_at"]),
  [AI_SOURCE_IDS.AUDIT_LOG]: source(AI_SOURCE_IDS.AUDIT_LOG, "Audit log", ["created_at"]),
});

export function getAiSource(sourceId) {
  return AI_SOURCE_CATALOG[sourceId] ?? null;
}

export function isKnownAiSource(sourceId) {
  return getAiSource(sourceId) !== null;
}

export function makeAiSourceReference(sourceId, detail = null) {
  const known = getAiSource(sourceId);
  if (!known) throw new TypeError(`Fonte AI sconosciuta: ${String(sourceId)}`);
  return Object.freeze({ id: known.id, label: known.label, detail: detail || null });
}
