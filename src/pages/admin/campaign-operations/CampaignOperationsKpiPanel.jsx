export function CampaignOperationsKpiPanel({ statusValue, driversValue, sessionsValue, timeLabel, timeValue, kmLabel, kmValue, pointsValue, photosValue, progressValue, Kpi, styles }) {
  const { kpiGridStyle } = styles;
  return (
      <section style={kpiGridStyle}>
        <Kpi label="Status campagna" value={statusValue} />
        <Kpi label="Driver assegnati" value={driversValue} />
        <Kpi label="Sessioni" value={sessionsValue} />
        <Kpi label={timeLabel} value={timeValue} />
        <Kpi label={kmLabel} value={kmValue} />
        <Kpi label="Punti GPS" value={pointsValue} />
        <Kpi label="Foto proof" value={photosValue} />
        <Kpi label="Avanzamento stimato" value={progressValue} />
      </section>
  );
}
