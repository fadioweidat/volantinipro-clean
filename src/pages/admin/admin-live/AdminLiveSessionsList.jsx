export function AdminLiveSessionsList({ withLifecycle, selectedSessionId, setSelectedSessionId, loading, error, DriverRow, EmptyState, styles }) {
  const { cardStyle, eyebrowStyle } = styles;
  return (
        <aside style={cardStyle}>
          <p style={eyebrowStyle}>Driver e storico</p>
          {withLifecycle.length ? withLifecycle.map((item) => (
            <DriverRow
              key={item.session.id}
              item={item}
              selected={item.session.id === selectedSessionId}
              onSelect={() => setSelectedSessionId(item.session.id)}
            />
          )) : <EmptyState text={loading ? "Caricamento sessioni..." : error ? "Sessioni non disponibili. Usa Aggiorna GPS." : "Nessuna sessione per i filtri selezionati."} />}
        </aside>
  );
}
