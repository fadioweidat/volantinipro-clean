export function GpsMonitorGeofenceHistory({ geofence, geofenceZones, formatDateTime, EmptyState, styles }) {
  const { cardStyle, eyebrowStyle, rowStyle } = styles;
  return (
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Storico geofence (sessione mappa)</p>
        {geofence.events.length ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {geofence.events.map((event, index) => (
              <div key={index} style={rowStyle}>
                <span style={{ fontSize: 11, fontWeight: 900, color: event.type === 'exited' ? '#b91c1c' : '#0f766e' }}>
                  {event.type === 'exited' ? 'Uscita confermata' : 'Rientro confermato'}
                </span>
                <span>{formatDateTime(new Date(event.at).toISOString())}</span>
                <span style={{ fontSize: 12, color: '#64748b' }}>{event.lat.toFixed(5)}, {event.lng.toFixed(5)}</span>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState text={geofenceZones.length ? 'Nessuna uscita dalla zona rilevata sui punti disponibili.' : 'Zona campagna non ancora configurata: verifica non disponibile.'} />
        )}
      </section>
  );
}
