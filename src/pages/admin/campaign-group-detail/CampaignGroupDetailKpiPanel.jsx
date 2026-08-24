export function CampaignGroupDetailKpiPanel({ operatorsValue, onlineValue, warningValue, offlineValue, kmValue, pointsValue, photosValue, coverageValue, Kpi, styles }) {
  const { kpiGridStyle } = styles;
  return (
      <section style={kpiGridStyle}>
        <Kpi label="Operatori" value={operatorsValue} />
        <Kpi label="Online" value={onlineValue} color="#2ecc8a" />
        <Kpi label="Warning" value={warningValue} color="#fbbf24" />
        <Kpi label="Offline" value={offlineValue} color="#ef4444" />
        <Kpi label="Km gruppo" value={kmValue} />
        <Kpi label="Punti GPS" value={pointsValue} />
        <Kpi label="Foto proof" value={photosValue} />
        <Kpi label="Copertura stimata" value={coverageValue} />
      </section>
  );
}
