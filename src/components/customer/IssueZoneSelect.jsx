import { useEffect, useMemo, useRef, useState } from 'react';

// Selettore zona SOLO per il form "Segnala un problema".
// Evita il select nativo (bianco su bianco su Android/Samsung) e mantiene
// una lista compatta, ricercabile e leggibile anche con molte zone.
export const ISSUE_ZONE_SELECT_COLORS = Object.freeze({
  fieldBackground: 'rgba(255,255,255,.06)',
  fieldText: '#ffffff',
  listBackground: '#ffffff',
  listText: '#0f172a',
  activeBackground: '#e2e8f0',
  selectedText: '#9a3412',
  mutedText: '#64748b',
});

function normalize(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function IssueZoneSelect({ zones = [], value = '', onChange, placeholder = 'Seleziona la zona *', style = {} }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const selected = zones.find((z) => z.id === value) || null;
  const c = ISSUE_ZONE_SELECT_COLORS;

  const filteredZones = useMemo(() => {
    const q = normalize(query);
    const rows = [...zones].sort((a, b) => String(a.zone_name || '').localeCompare(String(b.zone_name || ''), 'it'));
    if (!q) return rows;
    return rows.filter((z) => normalize(z.zone_name).includes(q));
  }, [zones, query]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    const timer = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(-1);
    }
  }, [open]);

  const choose = (zone) => {
    onChange?.(zone.id);
    setOpen(false);
    setActive(-1);
    setQuery('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(filteredZones.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && open && filteredZones[active]) {
      e.preventDefault();
      choose(filteredZones[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} style={{ position: 'relative' }} data-testid="issue-zone-select">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required="true"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        style={{
          ...style,
          width: '100%',
          textAlign: 'left',
          cursor: 'pointer',
          background: c.fieldBackground,
          color: c.fieldText,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: selected ? 1 : 0.7 }}>
          {selected ? selected.zone_name : placeholder}
        </span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            zIndex: 80,
            left: 0,
            right: 0,
            top: 'calc(100% + 4px)',
            padding: 8,
            background: c.listBackground,
            border: '1px solid #cbd5e1',
            borderRadius: 10,
            boxShadow: '0 12px 30px rgba(0,0,0,.35)',
          }}
        >
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(-1);
            }}
            onKeyDown={onKeyDown}
            placeholder="Cerca zona, es. Bruzzano"
            aria-label="Cerca zona"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              padding: '9px 10px',
              marginBottom: 6,
              background: '#fff',
              color: c.listText,
              fontSize: 14,
              outline: 'none',
            }}
          />

          <div style={{ fontSize: 11, color: c.mutedText, padding: '2px 4px 6px' }}>
            {filteredZones.length} {filteredZones.length === 1 ? 'zona' : 'zone'}
          </div>

          <ul
            role="listbox"
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              maxHeight: 220,
              overflowY: 'auto',
              background: c.listBackground,
            }}
          >
            {filteredZones.length === 0 ? (
              <li style={{ padding: '12px', fontSize: 14, color: c.mutedText }}>
                Nessuna zona trovata.
              </li>
            ) : filteredZones.map((z, idx) => (
              <li
                key={z.id}
                role="option"
                aria-selected={z.id === value}
                onClick={() => choose(z)}
                onMouseEnter={() => setActive(idx)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 7,
                  cursor: 'pointer',
                  fontSize: 14,
                  color: z.id === value ? c.selectedText : c.listText,
                  fontWeight: z.id === value ? 800 : 600,
                  background: idx === active ? c.activeBackground : 'transparent',
                }}
              >
                {z.zone_name}
                {z.id === value ? ' ✓' : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
