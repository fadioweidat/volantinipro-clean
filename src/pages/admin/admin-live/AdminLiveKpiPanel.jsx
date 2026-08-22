export function AdminLiveKpiPanel({ currentRows, liveCount, warningCount, offlineRecentCount, historyCount, Kpi, styles }) {
  const { kpiGridStyle } = styles;
  return (
      <section style={kpiGridStyle}>
        <Kpi label="Sessioni filtrate" value={currentRows.length} />
        <Kpi label="Live" value={liveCount} tone="green" />
        <Kpi label="Warning" value={warningCount} tone="yellow" />
        <Kpi label="Offline recente" value={offlineRecentCount} tone="red" />
        <Kpi label="Storico terminato" value={historyCount} />
      </section>
  );
}
