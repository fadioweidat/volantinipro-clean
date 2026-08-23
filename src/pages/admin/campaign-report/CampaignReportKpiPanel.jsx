export function CampaignReportKpiPanel({ statusValue, progressValue, sessionsValue, operatorsValue, kmValue, durationValue, pointsValue, photosValue, Kpi, styles }) {
  const { kpiGridStyle } = styles;
  return (
      <section style={kpiGridStyle}>
        <Kpi label="Stato" value={statusValue} />
        <Kpi label="Avanzamento" value={progressValue} />
        <Kpi label="Sessioni filtrate" value={sessionsValue} />
        <Kpi label="Operatori" value={operatorsValue} />
        <Kpi label="Km totali" value={kmValue} />
        <Kpi label="Tempo totale" value={durationValue} />
        <Kpi label="Punti GPS" value={pointsValue} />
        <Kpi label="Foto proof" value={photosValue} />
      </section>
  );
}
