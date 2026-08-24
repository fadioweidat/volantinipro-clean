export function AdminLiveFiltersPanel({ filters, setFilters, campaigns, styles }) {
  const { cardStyle, eyebrowStyle, filterGridStyle, labelStyle, inputStyle } = styles;
  return (
      <section style={cardStyle}>
        <p style={eyebrowStyle}>Filtri storico</p>
        <div style={filterGridStyle}>
          <label style={labelStyle}>
            Periodo
            <select value={filters.period} onChange={(event) => setFilters((prev) => ({ ...prev, period: event.target.value }))} style={inputStyle}>
              <option value="today">Oggi</option>
              <option value="yesterday">Ieri</option>
              <option value="7d">Ultimi 7 giorni</option>
              <option value="custom">Intervallo date</option>
              <option value="all">Tutto</option>
            </select>
          </label>
          <label style={labelStyle}>
            Da
            <input type="date" value={filters.fromDate} onChange={(event) => setFilters((prev) => ({ ...prev, fromDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            A
            <input type="date" value={filters.toDate} onChange={(event) => setFilters((prev) => ({ ...prev, toDate: event.target.value }))} disabled={filters.period !== 'custom'} style={inputStyle} />
          </label>
          <label style={labelStyle}>
            Campagna
            <select value={filters.campaign} onChange={(event) => setFilters((prev) => ({ ...prev, campaign: event.target.value }))} style={inputStyle}>
              <option value="all">Tutte</option>
              {campaigns.map((campaignId) => <option key={campaignId} value={campaignId}>{campaignId}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            Stato sessione
            <select value={filters.status} onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))} style={inputStyle}>
              <option value="all_history">Tutti (incl. storico)</option>
              <option value="all">Solo operativi correnti</option>
              <option value="started">Started</option>
              <option value="paused">Paused</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label style={labelStyle}>
            Driver
            <input value={filters.driver} onChange={(event) => setFilters((prev) => ({ ...prev, driver: event.target.value }))} style={inputStyle} placeholder="nome operatore" />
          </label>
          <label style={labelStyle}>
            Gruppo
            <input value={filters.group} onChange={(event) => setFilters((prev) => ({ ...prev, group: event.target.value }))} style={inputStyle} placeholder="nome gruppo" />
          </label>
        </div>
      </section>
  );
}
