// Studio Mappa — stili condivisi (UI dedicata, NON riusa la UI del Monitor).

export const panel = {
  background: 'rgba(255,255,255,.045)',
  border: '1px solid rgba(255,255,255,.09)',
  borderRadius: 12,
  padding: 12,
  color: '#fff',
  fontSize: 12.5,
};

export const panelTitle = {
  margin: '0 0 8px',
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  color: 'rgba(255,255,255,.55)',
};

export const btn = (active = false) => ({
  border: '1px solid',
  borderColor: active ? '#2563eb' : 'rgba(255,255,255,.16)',
  background: active ? '#2563eb' : 'rgba(255,255,255,.05)',
  color: '#fff',
  borderRadius: 8,
  padding: '7px 11px',
  fontSize: 12,
  fontWeight: 800,
  cursor: 'pointer',
});

export const chip = (active = false) => ({
  border: '1px solid',
  borderColor: active ? '#2563eb' : 'rgba(255,255,255,.16)',
  background: active ? 'rgba(37,99,235,.22)' : 'rgba(255,255,255,.04)',
  color: '#fff',
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 11.5,
  fontWeight: 800,
  cursor: 'pointer',
});

export const smallBtn = {
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(255,255,255,.05)',
  color: '#fff',
  borderRadius: 6,
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
};

export const input = {
  border: '1px solid rgba(255,255,255,.16)',
  background: 'rgba(0,0,0,.25)',
  color: '#fff',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  width: '100%',
  boxSizing: 'border-box',
};

export const kpiTile = {
  background: 'rgba(255,255,255,.04)',
  border: '1px solid rgba(255,255,255,.08)',
  borderRadius: 8,
  padding: '8px 10px',
};
