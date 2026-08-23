export function ClientsQuotesSearchBar({ search, setSearch, loading, colors }) {
  return (
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Cerca cliente o comune..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: '1 1 260px', background: colors.navyLight, border: '1px solid #374151', borderRadius: 8, padding: '10px 14px', color: colors.white, fontSize: 14 }}
        />
        {loading && <span style={{ color: colors.gray, fontSize: 13 }}>Aggiornamento...</span>}
      </div>
  );
}
