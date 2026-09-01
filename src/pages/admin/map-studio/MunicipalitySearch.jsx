// Studio Mappa — ricerca comune con autocomplete su dati REALI.
//
// Riuso (non è il motore GPS): stesso provider del configuratore —
// Nominatim `featuretype=city` + `normalizeNominatimGeocodeResult`
// (src/lib/geocoding/canonicalizeItalianMunicipalityName.js). Nessun dato
// finto, nessun elenco hard-coded, nessun fallback Milano.
//
// onSelect riceve { name, province, region, provinceCode, lat, lng }.

import { useEffect, useRef, useState } from 'react';
import { normalizeNominatimGeocodeResult } from '../../../lib/geocoding/canonicalizeItalianMunicipalityName.js';
import { input, smallBtn } from './mapStudioStyles.js';

const MUNICIPALITY_PLACE_TYPES = new Set([
  'city', 'town', 'village', 'municipality', 'administrative', 'hamlet',
]);

function provinceCodeFromResult(raw) {
  const iso = raw?.address?.['ISO3166-2-lvl6'] || raw?.address?.['ISO3166-2-lvl5'] || '';
  const m = /-([A-Z]{2})$/.exec(String(iso));
  return m ? m[1] : null;
}

export function MunicipalitySearch({ onSelect, debounceMs = 300, disabled = false }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); setError(null); setLoading(false); return undefined; }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      if (abortRef.current) abortRef.current.abort();
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      abortRef.current = ctrl;
      try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}`
          + '&countrycodes=it&format=json&addressdetails=1&limit=8&featuretype=city';
        const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: ctrl?.signal });
        const rows = await res.json();
        if (cancelled) return;
        const seen = new Set();
        const list = (Array.isArray(rows) ? rows : [])
          .filter((r) => {
            const pt = r.addresstype || r.type || r.class || '';
            return MUNICIPALITY_PLACE_TYPES.has(pt);
          })
          .map((r) => {
            const norm = normalizeNominatimGeocodeResult(r, { addressLike: false });
            return {
              key: r.place_id,
              name: norm.name || norm.city,
              province: r.address?.county || norm.province || null,
              provinceCode: provinceCodeFromResult(r),
              region: r.address?.state || null,
              lat: Number.parseFloat(r.lat),
              lng: Number.parseFloat(r.lon),
            };
          })
          .filter((x) => x.name && Number.isFinite(x.lat) && Number.isFinite(x.lng))
          .filter((x) => {
            const k = `${x.name}|${x.province || ''}`.toLowerCase();
            if (seen.has(k)) return false;
            seen.add(k);
            return true;
          });
        setResults(list);
        setOpen(true);
        if (list.length === 0) setError('Nessun comune trovato.');
      } catch (e) {
        if (!cancelled && e?.name !== 'AbortError') {
          setError('Ricerca comune non disponibile. Riprova.');
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (debounceMs <= 0) { run(); return () => { cancelled = true; }; }
    const t = setTimeout(run, debounceMs);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, debounceMs]);

  const pick = (r) => {
    setOpen(false);
    setQuery(r.name);
    setResults([]);
    onSelect?.({
      name: r.name,
      province: r.provinceCode || r.province || null,
      provinceCode: r.provinceCode || null,
      region: r.region || null,
      lat: r.lat,
      lng: r.lng,
    });
  };

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={input}
          value={query}
          disabled={disabled}
          placeholder="Cerca comune…  (es. Bergamo, Monza)"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          aria-label="Cerca comune"
        />
        {query && (
          <button type="button" style={smallBtn} onClick={() => { setQuery(''); setResults([]); setError(null); }}>×</button>
        )}
      </div>

      {loading && <p style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', margin: '4px 0 0' }}>Ricerca…</p>}
      {error && !loading && <p style={{ fontSize: 11, color: '#fca5a5', margin: '4px 0 0' }}>{error}</p>}

      {open && results.length > 0 && (
        <div
          style={{
            position: 'absolute', zIndex: 1000, left: 0, right: 0, marginTop: 4,
            background: '#0f172a', border: '1px solid rgba(255,255,255,.18)', borderRadius: 8,
            maxHeight: 220, overflowY: 'auto', boxShadow: '0 12px 28px rgba(0,0,0,.4)',
          }}
        >
          {results.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => pick(r)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', border: 'none',
                background: 'transparent', color: '#fff', padding: '7px 10px', fontSize: 12,
                cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,.06)',
              }}
            >
              <b>{r.name}</b>
              {(r.provinceCode || r.province) && (
                <span style={{ color: 'rgba(255,255,255,.55)' }}> ({r.provinceCode || r.province})</span>
              )}
              {r.region && <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 11 }}> · {r.region}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
