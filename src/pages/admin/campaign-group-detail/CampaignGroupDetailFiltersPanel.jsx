export function CampaignGroupDetailFiltersPanel({ filters, setFilters, groupName, styles }) {
  const { toolbarStyle, labelStyle, inputStyle } = styles;
  return (
      <section style={toolbarStyle}>
        <label style={labelStyle}>Periodo
          <select value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))} style={inputStyle}>
            <option value="all">Tutto</option>
            <option value="today">Oggi</option>
            <option value="yesterday">Ieri</option>
            <option value="7d">Ultimi 7 giorni</option>
            <option value="custom">Intervallo custom</option>
          </select>
        </label>
        <label style={labelStyle}>Gruppo
          <input value={groupName} disabled style={inputStyle} />
        </label>
        <label style={labelStyle}>Da
          <input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
        </label>
        <label style={labelStyle}>A
          <input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
        </label>
        <label style={labelStyle}>Operatore
          <input value={filters.operator} onChange={(event) => setFilters((prev) => ({ ...prev, operator: event.target.value }))} style={inputStyle} placeholder="nome operatore" />
        </label>
        <label style={labelStyle}>Stato
          <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} style={inputStyle}>
            <option value="all">Tutti</option>
            <option value="started">Started</option>
            <option value="paused">Paused</option>
            <option value="completed">Completed</option>
            <option value="online">Online</option>
            <option value="warning">Warning</option>
            <option value="offline">Offline</option>
          </select>
        </label>
      </section>
  );
}
