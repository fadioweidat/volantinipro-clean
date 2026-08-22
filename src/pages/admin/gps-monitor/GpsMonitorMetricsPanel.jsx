export function GpsMonitorMetricsPanel({ state, status, activeMs, activeSessionLabel, driverOnline, geofence, coverage, handleRecalculateCoverage, formatDuration, Metric, GeofenceBadge, styles }) {
  const { metricGridStyle } = styles;
  return (
      <div style={metricGridStyle}>
        <Metric label="Stato campagna" value={status} />
        <Metric label="Sessioni" value={state.sessions.length} />
        <Metric label="Punti GPS" value={state.points.length} />
        <Metric label="Sessione mappa" value={activeSessionLabel} />
        <Metric label="Driver" value={driverOnline ? 'online' : 'offline'} />
        <Metric label="Tempo attivo" value={formatDuration(activeMs)} />
        <Metric label="Geofence" value={<GeofenceBadge status={geofence.status} />} />
        {coverage && coverage.calculation_status === 'ready' && (
          <Metric
            label="Copertura calcolata"
            value={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {coverage.coverage_percent}%
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
