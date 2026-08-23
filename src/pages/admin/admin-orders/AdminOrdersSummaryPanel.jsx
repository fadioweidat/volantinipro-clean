export function AdminOrdersSummaryPanel({ kpi, activeFilter, setActiveFilter, quickFilters, Kpi, formatMoney, colors, chipStyle, styles }) {
  const { kpiGridStyle } = styles;
  return (
    <>
      <div style={kpiGridStyle}>
        <Kpi label="Preventivi totali" value={kpi.total} />
        <Kpi label="Nuovi" value={kpi.new} />
        <Kpi label="Da pagare" value={kpi.toPay} tone={colors.yellow} />
        <Kpi label="Pagati" value={kpi.paid} tone={colors.green} />
        <Kpi label="Da assegnare" value={kpi.toAssign} tone={colors.blue} />
        <Kpi label="In lavorazione" value={kpi.inProgress} tone={colors.blue} />
        <Kpi label="Completati" value={kpi.completed} tone={colors.green} />
        <Kpi label="Valore totale" value={formatMoney(kpi.totalValue) || '—'} />
        <Kpi label="Valore pagato" value={formatMoney(kpi.paidValue) || '—'} tone={colors.green} />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {quickFilters.map((f) => (
          <button key={f.key} type="button" onClick={() => setActiveFilter(f.key)} style={chipStyle(activeFilter === f.key)}>{f.label}</button>
        ))}
      </div>
    </>
  );
}
