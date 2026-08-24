export function AdminDailyReportKpiPanel({ Kpi, values, styles }) {
  return (
    <section style={styles.kpiGrid}>
      <Kpi label="Driver programmati" value={values.scheduledDrivers.value} color={values.scheduledDrivers.color} detail={values.scheduledDrivers.detail} />
      <Kpi label="Driver che hanno iniziato" value={values.startedDrivers.value} color={values.startedDrivers.color} detail={values.startedDrivers.detail} />
      <Kpi label="Driver completati" value={values.completedDrivers.value} color={values.completedDrivers.color} detail={values.completedDrivers.detail} />
      <Kpi label="Comuni assegnati" value={values.assignedMunicipalities.value} color={values.assignedMunicipalities.color} detail={values.assignedMunicipalities.detail} />
      <Kpi label="Comuni completati" value={values.completedMunicipalities.value} color={values.completedMunicipalities.color} detail={values.completedMunicipalities.detail} />
      <Kpi label="Comuni parziali" value={values.partialMunicipalities.value} color={values.partialMunicipalities.color} detail={values.partialMunicipalities.detail} />
      <Kpi label="Comuni bloccati" value={values.blockedMunicipalities.value} color={values.blockedMunicipalities.color} detail={values.blockedMunicipalities.detail} />
      <Kpi label="Volantini assegnati" value={values.assignedFlyers.value} color={values.assignedFlyers.color} detail={values.assignedFlyers.detail} />
      <Kpi label="Avanzamento reale" value={values.realProgress.value} color={values.realProgress.color} detail={values.realProgress.detail} />
      <Kpi label="Foto ricevute" value={values.photos.value} color={values.photos.color} detail={values.photos.detail} />
      <Kpi label="Sessioni GPS" value={values.gpsSessions.value} color={values.gpsSessions.color} detail={values.gpsSessions.detail} />
      <Kpi label="Alert operativi" value={values.alerts.value} color={values.alerts.color} detail={values.alerts.detail} />
    </section>
  );
}
