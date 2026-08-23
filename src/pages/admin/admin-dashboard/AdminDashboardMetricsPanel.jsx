export function AdminDashboardMetricsPanel({ metrics, Metric }) {
  return (
      <section className="admin-home__metrics" aria-label="Riepilogo di oggi">
        <Metric label="Gruppi oggi" value={metrics.groups} tone="blue" />
        <Metric label="Online" value={metrics.online} tone="green" />
        <Metric label="Da confermare" value={metrics.pending} tone="yellow" />
        <Metric label="Problemi" value={metrics.problems} tone="red" />
      </section>
  );
}
