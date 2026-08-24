export function CampaignGroupsKpiPanel({ Kpi, values, colors, styles }) {
  return (
    <section style={styles.kpiGridStyle}>
      <Kpi label="Gruppi" value={values.groups} />
      <Kpi label="Operatori" value={values.operators} />
      <Kpi label="Online" value={values.online} color={colors.online} />
      <Kpi label="Offline" value={values.offline} color={colors.offline} />
      <Kpi label="Problemi aperti" value={values.problems} color={colors.problems} />
      <Kpi label="Km totali" value={values.km} />
      <Kpi label="Punti GPS" value={values.points} />
    </section>
  );
}
