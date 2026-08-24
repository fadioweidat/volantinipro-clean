export function CampaignAssignmentsSummaryPanel({ assignments, statusCounts, statusFilter, setStatusFilter, Kpi, styles }) {
  const { kpiGridStyle, cardStyle, eyebrowStyle, chipStyle, activeChipStyle } = styles;
  return (
    <>
      {/* KPI strip */}
      <section style={kpiGridStyle}>
        <Kpi label="Totale" value={assignments.length} />
        <Kpi label="Attive" value={statusCounts.active || 0} color="#2ecc8a" />
        <Kpi label="Revocate" value={statusCounts.revoked || 0} color="#ef4444" />
        <Kpi label="Completate" value={statusCounts.completed || 0} color="#60a5fa" />
      </section>

      {/* Filter bar */}
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Filtra per stato</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['all', 'active', 'revoked', 'completed'].map(s => (
            <button
              key={s}
              type="button"
              style={statusFilter === s ? activeChipStyle : chipStyle}
              onClick={() => setStatusFilter(s)}
            >
              {s === 'all' ? 'Tutti' : s}
              {s !== 'all' && statusCounts[s] ? ` (${statusCounts[s]})` : ''}
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
