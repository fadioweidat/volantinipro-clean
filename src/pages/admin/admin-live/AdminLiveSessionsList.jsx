export function AdminLiveSessionsList({ withLifecycle, selectedSessionId, setSelectedSessionId, DriverRow, EmptyState, styles }) {
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
          )) : <EmptyState text="Nessuna sessione attiva reale." />}
        </aside>
  );
}
