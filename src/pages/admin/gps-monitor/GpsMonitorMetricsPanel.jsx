import { formatCoveragePercent } from '../../../lib/gps/coverageDisplay.js';

// Header Admin GPS Monitor.
// - Driver: presenza condivisa (classifyDriverPresence) — stessa della riga
//   operatore e del Cliente: ONLINE / SEGNALE DEBOLE / OFFLINE.
// - Geofence: stesso stato e stessa distanza della mappa Admin e del Cliente
//   (zona assegnata alla sessione attiva, evaluateSessionGeofence).
// - Copertura campagna: final_operational_coverage_pct, stessa derivazione
//   del KPI Cliente. La copertura della sola zona della sessione resta
//   disponibile ma etichettata come tale.
export function GpsMonitorMetricsPanel({ state, status, activeMs, activeSessionLabel, driverPresence, liveZoneStatus, outsideDistanceKm, campaignCoverageDisplay, coverage, handleRecalculateCoverage, formatDuration, Metric, LiveZoneStatusBadge, styles }) {
  const { metricGridStyle } = styles;
  return (
      <div style={metricGridStyle}>
        <Metric label="Stato campagna" value={status} />
        <Metric label="Sessioni" value={state.sessions.length} />
        <Metric label="Punti GPS" value={state.points.length} />
        <Metric label="Sessione mappa" value={activeSessionLabel} />
        <Metric label="Driver" value={driverPresence?.label} />
        <Metric label="Tempo attivo" value={formatDuration(activeMs)} />
        <Metric label="Geofence" value={<LiveZoneStatusBadge status={liveZoneStatus} distanceKm={outsideDistanceKm} />} />
        <Metric label="Copertura campagna" value={campaignCoverageDisplay} />
        {coverage && coverage.calculation_status === 'ready' && (
          <Metric
            label="Copertura zona sessione"
            value={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {formatCoveragePercent(coverage.coverage_percent)}
                <button
                  onClick={handleRecalculateCoverage}
                  disabled={coverage.calculating}
                  style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 4, color: '#fff', fontSize: 10, padding: '2px 6px', cursor: 'pointer' }}
                  title="Ricalcola manualmente"
                >
                  {coverage.calculating ? '...' : 'Ricalcola'}
                </button>
              </div>
            }
          />
        )}
      </div>
  );
}
