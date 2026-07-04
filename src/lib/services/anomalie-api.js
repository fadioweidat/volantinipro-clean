import { getRealCampaigns, getLiveDrivers, selectOptionalTable } from './admin-api.js';
import { logAuditEvent } from '../audit.js';

// AI Copilot — verticale "Rilevamento anomalie". Nessun LLM: regole di
// business deterministiche su dati reali gia' presenti (campagne, sessioni
// GPS, foto prova, audit log). Nessuna tabella nuova — calcolato al volo a
// ogni apertura della pagina, coerente con "l'AI non deve modificare dati
// autonomamente": qui non modifica nulla, segnala soltanto.

const SOGLIE = {
  clienteInsolventeGiorni: 30,
  campagnaFermaSenzaPingOre: 24,
  gpsVelocitaMaxKmH: 60, // oltre e' implausibile per un distributore a piedi/bici
  gpsAccuratezzaMaxM: 150,
  erroriRipetutiSoglia: 3,
  erroriRipetutiFinestraOre: 24,
};

function oreDa(iso) {
  if (!iso) return Infinity;
  const ms = Date.now() - new Date(iso).getTime();
  return ms / 3600000;
}

export async function detectAnomalie() {
  const [campaignsResult, drivers, gpsPoints, sessionsResult, photosResult, auditResult] = await Promise.all([
    getRealCampaigns({ includeTest: false }),
    getLiveDrivers(),
    selectOptionalTable('gps_tracking_points', 'recorded_at'),
    selectOptionalTable('delivery_sessions'),
    selectOptionalTable('proof_photos'),
    selectOptionalTable('audit_log'),
  ]);

  const anomalie = [];
  const availability = {
    campagne: campaignsResult.availability.campaigns,
    gps: gpsPoints.available,
    sessioni: sessionsResult.available,
    foto: photosResult.available,
    auditLog: auditResult.available,
  };

  // 1) Operatori inattivi/offline (riusa la classificazione gia' esistente in gps-api.js)
  drivers.filter((d) => d.status === 'offline').forEach((d) => {
    anomalie.push({
      id: `operatore-${d.session?.id}`,
      tipo: 'operatore_inattivo',
      gravita: 'media',
      titolo: `Operatore offline: ${d.driverName}`,
      dettaglio: `Gruppo ${d.groupName || 'n/d'} · ultimo ping: ${d.lastPing ? new Date(d.lastPing).toLocaleString('it-IT') : 'mai registrato'}`,
      resourceType: 'delivery_sessions',
      resourceId: d.session?.id,
    });
  });

  // 2) Campagne ferme: attive, con gruppi assegnati, ma nessun operatore online
  campaignsResult.rows.filter((c) => c.status === 'active' && (c.ops?.groups || 0) > 0 && (c.ops?.online || 0) === 0).forEach((c) => {
    anomalie.push({
      id: `campagna-ferma-${c.id}`,
      tipo: 'campagna_ferma',
      gravita: 'alta',
      titolo: `Campagna ferma: ${c.client}`,
      dettaglio: `${c.ops.groups} gruppi assegnati, 0 operatori online. Ultimo ping: ${c.ops.lastPing ? new Date(c.ops.lastPing).toLocaleString('it-IT') : 'mai'} (${oreDa(c.ops.lastPing).toFixed(0)}h fa).`,
      resourceType: 'campagna',
      resourceId: c.id,
    });
  });

  // 3) Clienti insolventi: campagna creata da oltre N giorni, nessun segnale di pagamento nello stato grezzo
  const now = Date.now();
  campaignsResult.rows.filter((c) => {
    const ageDays = (now - new Date(c.date).getTime()) / 86400000;
    return Number.isFinite(ageDays) && ageDays > SOGLIE.clienteInsolventeGiorni && !String(c.rawStatus || '').includes('pagat');
  }).forEach((c) => {
    anomalie.push({
      id: `insolvente-${c.id}`,
      tipo: 'cliente_insolvente',
      gravita: 'alta',
      titolo: `Pagamento in sospeso: ${c.client}`,
      dettaglio: `Campagna del ${c.date}, nessun pagamento risulta registrato da oltre ${SOGLIE.clienteInsolventeGiorni} giorni.`,
      resourceType: 'campagna',
      resourceId: c.id,
    });
  });

  // 4) GPS anomalo: velocita' implausibile o accuratezza troppo scarsa
  //    Assunzione: `speed` e' in m/s (standard Geolocation API) — se il dato
  //    reale fosse gia' in km/h questa soglia andrebbe rivista.
  gpsPoints.rows.forEach((p) => {
    const speedKmH = Number(p.speed || 0) * 3.6;
    if (speedKmH > SOGLIE.gpsVelocitaMaxKmH) {
      anomalie.push({
        id: `gps-velocita-${p.id}`,
        tipo: 'gps_anomalo',
        gravita: 'bassa',
        titolo: `Velocità GPS implausibile (${speedKmH.toFixed(0)} km/h)`,
        dettaglio: `Punto registrato ${new Date(p.recorded_at || p.created_at).toLocaleString('it-IT')}, campagna ${p.campaign_id || 'n/d'}.`,
        resourceType: 'gps_tracking_points',
        resourceId: p.id,
      });
    }
    if (Number(p.accuracy) > SOGLIE.gpsAccuratezzaMaxM) {
      anomalie.push({
        id: `gps-accuratezza-${p.id}`,
        tipo: 'gps_anomalo',
        gravita: 'bassa',
        titolo: `Precisione GPS scarsa (±${Number(p.accuracy).toFixed(0)}m)`,
        dettaglio: `Punto registrato ${new Date(p.recorded_at || p.created_at).toLocaleString('it-IT')}, campagna ${p.campaign_id || 'n/d'}.`,
        resourceType: 'gps_tracking_points',
        resourceId: p.id,
      });
    }
  });

  // 5) Foto mancanti: sessioni concluse senza nessuna foto prova associata
  const sessioniConclusePerCampagna = new Map();
  sessionsResult.rows.filter((s) => s.status === 'completed').forEach((s) => {
    if (!sessioniConclusePerCampagna.has(s.campaign_id)) sessioniConclusePerCampagna.set(s.campaign_id, []);
    sessioniConclusePerCampagna.get(s.campaign_id).push(s);
  });
  const fotoPerCampagna = new Set(photosResult.rows.map((f) => f.campaign_id));
  sessioniConclusePerCampagna.forEach((sessioni, campaignId) => {
    if (!fotoPerCampagna.has(campaignId)) {
      anomalie.push({
        id: `foto-mancanti-${campaignId}`,
        tipo: 'foto_mancanti',
        gravita: 'media',
        titolo: `Nessuna foto prova per la campagna`,
        dettaglio: `${sessioni.length} sessione/i conclusa/e, 0 foto prova caricate.`,
        resourceType: 'campagna',
        resourceId: campaignId,
      });
    }
  });

  // 6) Errori ripetuti: eventi audit falliti (success=false) ripetuti sulla stessa azione
  const finestraMs = SOGLIE.erroriRipetutiFinestraOre * 3600000;
  const erroriRecenti = auditResult.rows.filter((row) => row.success === false && Date.now() - new Date(row.created_at).getTime() <= finestraMs);
  const erroriPerAzione = new Map();
  erroriRecenti.forEach((row) => {
    const key = row.action;
    if (!erroriPerAzione.has(key)) erroriPerAzione.set(key, []);
    erroriPerAzione.get(key).push(row);
  });
  erroriPerAzione.forEach((rows, azione) => {
    if (rows.length >= SOGLIE.erroriRipetutiSoglia) {
      anomalie.push({
        id: `errori-ripetuti-${azione}`,
        tipo: 'errori_ripetuti',
        gravita: 'alta',
        titolo: `Errori ripetuti: ${azione}`,
        dettaglio: `${rows.length} fallimenti nelle ultime ${SOGLIE.erroriRipetutiFinestraOre}h.`,
        resourceType: 'audit_log',
        resourceId: azione,
      });
    }
  });

  console.info('[AI_ANOMALIE_SCAN]', { count: anomalie.length, availability });
  logAuditEvent({ action: 'ai_anomaly_scan_performed', metadata: { count: anomalie.length } });

  return { anomalie, availability };
}

export const SOGLIE_ANOMALIE = SOGLIE;
