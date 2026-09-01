import { useEffect, useMemo, useState } from 'react';
import { AdminLayout } from './AdminLayout.jsx';
import { CoverageAdjustmentPanel } from '../../components/admin/CoverageAdjustmentPanel.jsx';
import { ZoneCoverageMap } from '../../components/admin/ZoneCoverageMap.jsx';
import { ZoneProgressPanel } from '../../components/zone-progress/ZoneProgressPanel.jsx';
import { AdminIssuesPanel } from '../../components/admin/AdminIssuesPanel.jsx';
import { useZoneProgress } from '../../hooks/useZoneProgress.js';
import { useZoneBoundaries } from '../../hooks/useZoneBoundaries.js';
import { getCampaignSessionTracks, getCampaignRecord } from '../../lib/services/gps-api.js';
import { listCampaignAssignments } from '../../lib/services/admin-api.js';
import { getOperatorColor } from '../../lib/geo/operatorColor.js';
import { geoJsonApproxCentroid } from '../../lib/geo/pointInPolygon.js';

// EDITOR COPERTURA AVANZATO — pagina Admin dedicata (ticket "3 esperienze GPS").
//
// UNA sola sorgente dati / motore: riusa lo STESSO CoverageAdjustmentPanel del
// vecchio tab "AUTOMATICO/MANUALE ADMIN" (nessuna riscrittura), le stesse RPC
// admin_*_coverage_adjustment e calculate_campaign_final_coverage, gli stessi
// hook territoriali (useZoneBoundaries/useZoneProgress). Qui vivono TUTTI gli
// strumenti tecnici (50/60/70/80/90/100, slider, origine, ambito, rete
// stradale, matita, gomma, area/linea, larghezza, operatore associato, tipo
// correzione, note, storico) — nel Monitor Admin restano solo i KPI + il
// pulsante "Correggi copertura" che apre questa pagina sulla stessa campagna.
//
// NON tocca gps_tracking_points / delivery_sessions / schema Supabase.

function readZoneFromQuery() {
  if (typeof window === 'undefined') return null;
  try {
    return new URLSearchParams(window.location.search).get('zone') || null;
  } catch {
    return null;
  }
}

export function CoverageEditor({ campaignId, onNav }) {
  const [tracks, setTracks] = useState([]);
  const [campaign, setCampaign] = useState(null);
  const [assignmentRows, setAssignmentRows] = useState([]);
  const [editorTab, setEditorTab] = useState('auto'); // 'auto' | 'manual'
  const [selectedZoneId, setSelectedZoneId] = useState(() => readZoneFromQuery());

  const zoneProgress = useZoneProgress({ campaignId, includeHistory: true });
  const { zoneRows, resolvedBoundaries } = useZoneBoundaries(campaignId);

  useEffect(() => {
    let cancelled = false;
    if (!campaignId) return undefined;
    Promise.all([
      getCampaignSessionTracks(campaignId).catch(() => []),
      getCampaignRecord(campaignId).catch(() => null),
      listCampaignAssignments(campaignId).catch(() => []),
    ]).then(([sessionTracks, record, rows]) => {
      if (cancelled) return;
      setTracks(Array.isArray(sessionTracks) ? sessionTracks : []);
      setCampaign(record);
      setAssignmentRows(Array.isArray(rows) ? rows : []);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  // Zona selezionata: query ?zone=, altrimenti la prima zona reale con confine
  // gia' risolto (stesso ordine stabile di useZoneBoundaries).
  useEffect(() => {
    if (selectedZoneId && zoneRows.some((z) => z.id === selectedZoneId)) return;
    const fallback = zoneRows[0]?.id || null;
    if (fallback) setSelectedZoneId(fallback);
  }, [zoneRows, selectedZoneId]);

  const points = useMemo(() => tracks.flatMap((t) => t.points || []), [tracks]);

  // Operatori REALI della campagna (assegnazioni attive/non revocate), stessa
  // forma passata dal Monitor al pannello: nessun access_token nel payload.
  const campaignOperators = useMemo(
    () => assignmentRows
      .filter((a) => !a.revoked_at && (a.status == null || a.status === 'active'))
      .map((a) => ({
        assignmentId: a.id,
        operatorId: a.operator_id || null,
        name: a.operator_name && a.operator_name !== a.operator_id ? a.operator_name : null,
        zoneId: a.zone_id || null,
        groupId: a.group_id || null,
      })),
    [assignmentRows],
  );

  // Operatori GPS reali (driver_id distinti) con nome + colore STABILE
  // (getOperatorColor) — lo stesso della traccia GPS e delle correzioni manuali.
  const gpsOperators = useMemo(() => {
    const byId = new Map();
    tracks.forEach((t) => {
      const id = t.session?.driver_id;
      if (!id || byId.has(id)) return;
      const match = campaignOperators.find((o) => o.operatorId && o.operatorId === id);
      byId.set(id, { id, name: match?.name || null, color: getOperatorColor(id) });
    });
    return [...byId.values()];
  }, [tracks, campaignOperators]);

  const gpsOperatorCount = useMemo(
    () => new Set(tracks.map((t) => t.session?.driver_id).filter(Boolean)).size,
    [tracks],
  );

  const selectedZoneRow = zoneRows.find((z) => z.id === selectedZoneId) || null;
  const selectedZoneGeometry = selectedZoneId ? resolvedBoundaries[selectedZoneId] || null : null;
  const activeZoneName = selectedZoneRow?.zone_name || null;

  // Ambito automatico multi-zona: SOLO campaign_zones reali con nome + confine
  // risolto (nessun boundary inventato) — identico a GpsMonitor.campaignZonesForAuto.
  const campaignZonesForAuto = useMemo(
    () => zoneRows
      .map((z) => ({ id: z.id, municipalityName: z.zone_name, boundaryGeometry: resolvedBoundaries[z.id] || null }))
      .filter((z) => z.municipalityName && z.boundaryGeometry),
    [zoneRows, resolvedBoundaries],
  );

  // Centro iniziale della mappa di disegno = centroide del confine reale della
  // zona selezionata (mai la posizione del Driver, mai Milano di default).
  const zoneCentroid = selectedZoneGeometry ? geoJsonApproxCentroid(selectedZoneGeometry) : null;
  const manualPanelZoneCenter = zoneCentroid
    ? { center_lat: zoneCentroid.lat, center_lng: zoneCentroid.lng }
    : { center_lat: selectedZoneRow?.center_lat, center_lng: selectedZoneRow?.center_lng };

  const selectedAutoZoneProgress = selectedZoneId
    ? zoneProgress.zones.find((z) => z.campaign_zone_id === selectedZoneId) || null
    : null;

  const campaignLabel = campaign?.name || campaign?.title || `Campagna ${campaignId}`;
  const panelKey = `${editorTab}-${selectedZoneRow?.id || 'none'}`;

  const breadcrumbs = [
    { label: 'Dashboard', href: '/admin' },
    { label: 'Campagne', href: '/admin' },
    { label: `Campagna ${campaignId}` },
    { label: 'Editor copertura' },
  ];

  return (
    <AdminLayout title={`Editor Copertura — ${campaignLabel}`} subtitle="Strumenti tecnici avanzati (Admin). Motore e dati identici al Monitor." breadcrumbs={breadcrumbs} onNav={onNav}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <button type="button" onClick={() => onNav?.(`admin-gps:${campaignId}`)} style={backButtonStyle}>
          ⟵ Torna al monitor
        </button>
        {activeZoneName && <span style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,.7)' }}>Zona: {activeZoneName}</span>}
      </div>

      {zoneRows.length > 1 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {zoneRows.map((zone) => (
            <button key={zone.id} type="button" onClick={() => setSelectedZoneId(zone.id)} style={zoneChipStyle(zone.id === selectedZoneId)}>
              {zone.zone_name}
            </button>
          ))}
        </div>
      )}

      {/* [Automatico] [Manuale] — come da acceptance criteria §12. Ogni tab
          monta lo STESSO CoverageAdjustmentPanel con il livello di default
          giusto; il selettore livello interno (gps/automatic/manual) resta
          disponibile per la GOMMA sul GPS reale. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '4px 0 12px' }}>
        {[
          { value: 'auto', label: 'Automatico' },
          { value: 'manual', label: 'Manuale' },
        ].map((tab) => (
          <button key={tab.value} type="button" onClick={() => setEditorTab(tab.value)} style={editorTabStyle(editorTab === tab.value)}>
            {tab.label}
          </button>
        ))}
      </div>

      <section style={cardStyle}>
        {editorTab === 'auto' ? (
          <>
            <CoverageAdjustmentPanel
              key={panelKey}
              campaignId={campaignId}
              points={points}
              zones={selectedZoneRow ? [{ id: selectedZoneRow.id, ...manualPanelZoneCenter }] : []}
              boundaryGeometry={selectedZoneGeometry}
              gpsOperatorCount={gpsOperatorCount}
              defaultSourceLevel="automatic_verified"
              municipalityName={activeZoneName}
              campaignZones={campaignZonesForAuto}
              campaignOperators={campaignOperators}
              gpsOperators={gpsOperators}
              automaticPercent={selectedAutoZoneProgress ? (selectedAutoZoneProgress.manual_override_enabled ? selectedAutoZoneProgress.manual_percent : selectedAutoZoneProgress.automatic_percent) : null}
            />

            {/* Diagnostica (sola lettura): la selezione stradale automatica come
                nuvola di punti. NON e' la copertura finale — quella e'
                l'anteprima nel pannello sopra. */}
            <details style={{ marginTop: 14 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.6)' }}>
                Diagnostica: selezione stradale automatica (sola lettura)
              </summary>
              {selectedAutoZoneProgress ? (
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: '#64748b', fontWeight: 800 }}>
                    {activeZoneName ? `${activeZoneName} — ` : ''}
                    Legacy — Automatico grezzo: {formatPercent(selectedAutoZoneProgress.manual_override_enabled ? selectedAutoZoneProgress.manual_percent : selectedAutoZoneProgress.automatic_percent)} · Effettivo cache: {formatPercent(selectedAutoZoneProgress.effective_percent)}
                    <br /><span style={{ color: '#94a3b8', fontWeight: 600 }}>Questi valori NON sono la Copertura Verificata: fanno riferimento alla cache campaign_zone_progress. Il valore reale e' "FINALE VERIFICATA" nel pannello sopra.</span>
                  </p>
                  <ZoneCoverageMap
                    key={selectedZoneId || 'none'}
                    boundaryGeometry={selectedZoneGeometry}
                    municipalityName={activeZoneName}
                    gpsOperatorCount={gpsOperatorCount}
                    points={points}
                    automaticPercent={selectedAutoZoneProgress.manual_override_enabled ? selectedAutoZoneProgress.manual_percent : selectedAutoZoneProgress.automatic_percent}
                    effectivePercent={selectedAutoZoneProgress.effective_percent}
                  />
                </div>
              ) : (
                <p style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>Seleziona una zona per la diagnostica.</p>
              )}
            </details>

            {/* Override legacy (percentuale manuale) — MANTENUTO per audit /
                compatibilita', ma NON alimenta la Copertura Verificata. */}
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'rgba(255,255,255,.6)' }}>
                Override legacy percentuale (non alimenta la Copertura Verificata)
              </summary>
              <p style={{ margin: '8px 0', fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>
                Sistema precedente basato su percentuale fissa. Per correggere la copertura usa Matita/Gomma qui sopra.
              </p>
              <ZoneProgressPanel
                zones={selectedZoneId ? zoneProgress.zones.filter((z) => z.campaign_zone_id === selectedZoneId) : zoneProgress.zones}
                history={zoneProgress.history}
                loading={zoneProgress.loading}
                refreshing={zoneProgress.refreshing}
                error={zoneProgress.error}
                notice={zoneProgress.notice}
                isAdmin
                mutatingZoneId={zoneProgress.mutatingZoneId}
                onRefresh={zoneProgress.refresh}
                onSetManual={zoneProgress.setManualProgress}
                onClearManual={zoneProgress.clearManualProgress}
              />
            </details>
          </>
        ) : (
          <>
            <CoverageAdjustmentPanel
              key={panelKey}
              campaignId={campaignId}
              points={points}
              zones={selectedZoneRow ? [{ id: selectedZoneRow.id, ...manualPanelZoneCenter }] : []}
              boundaryGeometry={selectedZoneGeometry}
              gpsOperatorCount={gpsOperatorCount}
              campaignZones={campaignZonesForAuto}
              campaignOperators={campaignOperators}
              gpsOperators={gpsOperators}
            />
            <AdminIssuesPanel campaignId={campaignId} />
          </>
        )}
      </section>
    </AdminLayout>
  );
}

function formatPercent(value) {
  return value != null
    ? `${Number(value).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`
    : 'n/d';
}

const cardStyle = { background: 'rgba(255,255,255,.045)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 14, padding: 18, boxShadow: '0 10px 26px rgba(0,0,0,.24)', color: '#fff' };

const backButtonStyle = {
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(255,255,255,.04)',
  color: '#fff',
  borderRadius: 999,
  padding: '8px 16px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
};

function zoneChipStyle(active) {
  return {
    border: '1px solid',
    borderColor: active ? '#e8571a' : 'rgba(255,255,255,.16)',
    background: active ? 'rgba(232,87,26,.22)' : 'rgba(255,255,255,.04)',
    color: '#fff',
    borderRadius: 999,
    padding: '6px 12px',
    fontSize: 12,
    fontWeight: active ? 900 : 700,
    cursor: 'pointer',
  };
}

function editorTabStyle(active) {
  return {
    border: '1px solid',
    borderColor: active ? '#e8571a' : 'rgba(255,255,255,.16)',
    background: active ? '#e8571a' : 'rgba(255,255,255,.04)',
    color: '#fff',
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 12,
    fontWeight: 900,
    letterSpacing: '.04em',
    cursor: 'pointer',
  };
}
