export function AdminOperationsDateFilter({ date, setDate, onPreviousDay, onToday, onNextDay, loading, colors, styles }) {
  const { btnStyle } = styles;
  return (
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '24px', background: colors.navyLight, padding: '16px', borderRadius: '8px' }}>
        <button onClick={onPreviousDay} style={btnStyle}>Giorno precedente</button>
        <button onClick={onToday} style={btnStyle}>Oggi</button>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          style={{ background: colors.navyMid, color: colors.white, border: '1px solid #374151', padding: '8px 12px', borderRadius: '4px' }}
        />
        <button onClick={onNextDay} style={btnStyle}>Giorno successivo</button>
        {loading && <span style={{ color: colors.gray, marginLeft: 'auto', fontSize: '14px' }}>Aggiornamento...</span>}
      </div>
  );
}
