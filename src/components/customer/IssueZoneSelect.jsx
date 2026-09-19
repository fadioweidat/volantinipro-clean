import React, { useEffect, useRef, useState } from 'react';

// Selettore zona SOLO per il form "Segnala un problema". Il <select> nativo su
// Android Chrome / Samsung Internet apre un pannello con sfondo BIANCO ma
// eredita il testo bianco del tema scuro: le zone erano leggibili solo in
// hover. Le opzioni native non sono affidabilmente stilabili su mobile, quindi
// qui un piccolo listbox leggero con colori espliciti (testo scuro su bianco).
// Non e' un design system generico.

export const ISSUE_ZONE_SELECT_COLORS = Object.freeze({
  fieldBackground: 'rgba(255,255,255,.06)',
  fieldText: '#ffffff',
  listBackground: '#ffffff',
  listText: '#0f172a',
  activeBackground: '#e2e8f0',
  selectedText: '#9a3412',
});

export function IssueZoneSelect({ zones = [], value = '', onChange, placeholder = 'Seleziona la zona *', style = {} }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef(null);
  const selected = zones.find((z) => z.id === value) || null;
  const c = ISSUE_ZONE_SELECT_COLORS;

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc); };
  }, [open]);

  const choose = (zone) => { onChange?.(zone.id); setOpen(false); setActive(-1); };
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(zones.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter' && open && zones[active]) { e.preventDefault(); choose(zones[active]); }
    else if (e.key === 'Escape') setOpen(false);
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
        style={{ ...style, width: '100%', textAlign: 'left', cursor: 'pointer', background: c.fieldBackground, color: c.fieldText, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: selected ? 1 : 0.7 }}>{selected ? selected.zone_name : placeholder}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          style={{ position: 'absolute', zIndex: 50, left: 0, right: 0, top: '100%', margin: '4px 0 0', padding: 4, listStyle: 'none', maxHeight: 240, overflowY: 'auto', background: c.listBackground, borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}
        >
          {zones.map((z, idx) => (
            <li
              key={z.id}
              role="option"
              aria-selected={z.id === value}
              onClick={() => choose(z)}
              onMouseEnter={() => setActive(idx)}
              style={{ padding: '10px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 14, color: z.id === value ? c.selectedText : c.listText, fontWeight: z.id === value ? 800 : 600, background: idx === active ? c.activeBackground : 'transparent' }}
            >
              {z.zone_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
