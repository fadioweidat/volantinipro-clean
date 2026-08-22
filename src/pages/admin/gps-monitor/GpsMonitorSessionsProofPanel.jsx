export function GpsMonitorSessionsProofPanel({ sessions, activeSession, photos, latest, sessionOnlineLabel, ProofPhoto, EmptyState, formatDateTime, styles }) {
  const { gridTwoStyle, cardStyle, eyebrowStyle, rowStyle, activeSessionRowStyle, activeBadgeStyle } = styles;
  return (
      <section style={gridTwoStyle}>
        <div style={cardStyle}>
          <p style={eyebrowStyle}>Sessioni</p>
          {sessions.length ? sessions.map((session) => (
            <div key={session.id} style={session.id === activeSession?.id ? activeSessionRowStyle : rowStyle}>
              <strong>{session.status}</strong>
              <span>{formatDateTime(session.started_at)} - {formatDateTime(session.ended_at || session.paused_at)}</span>
              <span>{session.driver_id}</span>
              <span>{sessionOnlineLabel(session, activeSession, latest)}</span>
              {session.id === activeSession?.id ? <span style={activeBadgeStyle}>mappa</span> : null}
            </div>
          )) : <EmptyState text="Nessuna sessione registrata" />}
        </div>

        <div style={cardStyle}>
          <p style={eyebrowStyle}>Foto proof</p>
          {photos.length ? photos.map((photo) => (
            <ProofPhoto key={photo.id} photo={photo} />
          )) : <EmptyState text="Nessuna foto prova caricata" />}
        </div>
      </section>
  );
}
