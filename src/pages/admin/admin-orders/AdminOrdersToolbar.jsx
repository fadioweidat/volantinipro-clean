export function AdminOrdersToolbar({ search, setSearch, loading, onExport, colors, styles }) {
  const { exportButtonStyle } = styles;
  return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Cerca per ID, cliente, azienda, email, telefono, comune, gruppo..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 320px', background: colors.navyLight, border: `1px solid ${colors.border}`, borderRadius: 8, padding: '10px 14px', color: colors.white, fontSize: 14 }}
        />
        <button type="button" onClick={onExport} style={exportButtonStyle}>Esporta CSV</button>
        {loading && <span style={{ color: colors.gray, fontSize: 13 }}>Aggiornamento...</span>}
      </div>
  );
}
