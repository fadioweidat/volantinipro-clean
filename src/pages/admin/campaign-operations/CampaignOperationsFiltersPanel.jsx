export function CampaignOperationsFiltersPanel({ filters, setFilters, campaignId, styles }) {
  const { cardStyle, eyebrowStyle, filterGridStyle, labelStyle, inputStyle } = styles;
  return (
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Filtri storico</p>
        <div style={filterGridStyle}>
          <label style={labelStyle}>Periodo
            <select value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))} style={inputStyle}>
              <option value="all">Tutto</option>
              <option value="today">Oggi</option>
              <option value="yesterday">Ieri</option>
              <option value="7d">Ultimi 7 giorni</option>
              <option value="custom">Intervallo date</option>
            </select>
          </label>
          <label style={labelStyle}>Da
            <input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
          </label>
          <label style={labelStyle}>A
            <input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
          </label>
          <label style={labelStyle}>Campagna
            <input value={campaignId} disabled style={inputStyle} />
          </label>
          <label style={labelStyle}>Operatore
            <input value={filters.driver} onChange={(event) => setFilters((prev) => ({ ...prev, driver: event.target.value }))} style={inputStyle} placeholder="nome o id" />
          </label>
          <label style={labelStyle}>Gruppo
            <input value={filters.group} onChange={(event) => setFilters((prev) => ({ ...prev, group: event.target.value }))} style={inputStyle} placeholder="nome gruppo" />
          </label>
          <label style={labelStyle}>Stato sessione
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} style={inputStyle}>
              <option value="all">Filtra storiche (default)</option>
              <option value="all_history">Tutte (incluso storico)</option>
              <option value="live">Live (in corso)</option>
              <option value="started">Started</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
              <option value="history">Solo Storiche/Test</option>
            </select>
          </label>
        </div>
      </section>
  );
}
