export function AdminOperationsKpiPanel({ kpis, Kpi, styles }) {
  const { kpiGridStyle } = styles;
  return (
      <div style={kpiGridStyle}>
        <Kpi label="Driver attivi oggi" value={kpis.drivers} />
        <Kpi label="Programmi assegnati" value={kpis.campaigns} />
        <Kpi label="Comuni totali" value={kpis.municipalities} />
        <Kpi label="Volantini assegnati" value={kpis.flyers.toLocaleString('it-IT')} />
        <Kpi label="Zone in corso" value={kpis.inProgress} tone="green" />
        <Kpi label="Zone completate" value={kpis.completed} />
        <Kpi label="Zone con problema" value={kpis.problem} tone={kpis.problem > 0 ? "red" : "default"} />
        <Kpi label="Alert attivi" value={kpis.alerts} tone={kpis.alerts > 0 ? "yellow" : "default"} />
        <Kpi label="Critici" value={kpis.criticalAlerts} tone={kpis.criticalAlerts > 0 ? "red" : "default"} />
      </div>
  );
}
