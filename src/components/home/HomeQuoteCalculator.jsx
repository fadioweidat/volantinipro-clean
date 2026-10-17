import React, { useEffect, useMemo, useRef, useState } from 'react';
import ProcessIcon from './ProcessIcon.jsx';
import { useServiceAnalysis } from '../../hooks/useServiceAnalysis.js';
import { canonicalizeItalianMunicipalityName } from '../../lib/geocoding/canonicalizeItalianMunicipalityName.js';
import { searchItalianMunicipalities } from '../../lib/geocoding/searchItalianMunicipalities.js';
import { apiToZones } from '../../lib/step2/zoneGeoHelpers.js';
import { formatOperationalMarginNote, getOperationalMarginPct, getZoneFullCoverageFlyers } from '../../lib/doorToDoorCoverage.js';
import { formatHeroMetric } from './homepageHeroData.js';

// Same single-comune request as Preventivo Rapido (QuickQuotePage.jsx):
// analysis-istat, 3 km technical radius, selectionScope "municipality".
const SINGLE_COMUNE_RADIUS_KM = 3;

// Nominatim can return the same comune more than once (boundary + place node).
export function uniqueByComune(list) {
  const seen = new Set();
  return list.filter((s) => {
    const key = `${String(s.name || '').toLowerCase()}|${String(s.province || '').toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildConfiguratorHref(comuneName) {
  const params = new URLSearchParams({ service: 'd2d', comune: comuneName, source: 'homepage_calculator' });
  return `/configuratore?${params.toString()}`;
}

export default function HomeQuoteCalculator({ onConfigure }) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [comune, setComune] = useState(null);
  const listId = 'vpq-comune-suggestions';
  const blurTimer = useRef(null);

  useEffect(() => {
    const query = input.trim();
    if (comune && query === comune.name) return undefined;
    if (query.length < 2) { setSuggestions([]); setSearchError(false); setSearching(false); return undefined; }
    let stale = false;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const ranked = await searchItalianMunicipalities(query, { language: 'it' });
        if (stale) return;
        setSuggestions(uniqueByComune(ranked));
        setSearchError(false);
        setActiveIndex(-1);
      } catch {
        if (!stale) { setSuggestions([]); setSearchError(true); }
      } finally {
        if (!stale) setSearching(false);
      }
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [input, comune]);

  useEffect(() => () => clearTimeout(blurTimer.current), []);

  const { data, loading, error } = useServiceAnalysis(
    comune?.lat, comune?.lng, SINGLE_COMUNE_RADIUS_KM, 'd2d', comune?.name || null, null, 'comune', null, comune ? 'municipality' : null, null
  );

  // Same conversion and quantity rule as Step 2 (apiToZones -> zone ->
  // getZoneFullCoverageFlyers): the homepage shows exactly what the
  // configurator will recommend for the same comune.
  const zone = useMemo(() => {
    if (!comune || !data || error) return null;
    const zones = apiToZones(data, null) || [];
    return zones.find((z) => !z.isNil && canonicalizeItalianMunicipalityName(z.name, z).toLowerCase() === comune.name.toLowerCase()) || null;
  }, [comune, data, error]);
  const families = zone && zone.families > 0 ? zone.families : null;
  const recommended = zone ? getZoneFullCoverageFlyers(zone) || null : null;
  const marginNote = formatOperationalMarginNote(getOperationalMarginPct(families, recommended));
  const coverage = zone && Number.isFinite(zone.coverage) ? Math.min(100, Math.round(zone.coverage)) : null;

  const status = !comune ? 'idle'
    : loading || (!data && !error) ? 'loading'
      // analysis-istat answers this for comuni outside the ISTAT dataset: no data, not an outage.
      : error === 'TERRITORIAL_DATA_NOT_AVAILABLE' ? 'unavailable'
      : error ? 'error'
        : families !== null && recommended !== null ? 'ready'
          : 'unavailable';

  const choose = (suggestion) => {
    const name = canonicalizeItalianMunicipalityName(suggestion.name, suggestion);
    setComune({ name, lat: suggestion.lat, lng: suggestion.lng, province: suggestion.province || null });
    setInput(name);
    setSuggestions([]);
    setOpen(false);
  };

  const onKeyDown = (event) => {
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveIndex((i) => (i + 1) % suggestions.length); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1)); }
    else if (event.key === 'Enter' && activeIndex >= 0) { event.preventDefault(); choose(suggestions[activeIndex]); }
    else if (event.key === 'Escape') setOpen(false);
  };

  const goToConfigurator = () => {
    if (comune) window.location.assign(buildConfiguratorHref(comune.name));
    else onConfigure?.();
  };

  const metric = (value) => (status === 'loading' ? '…' : status === 'ready' ? formatHeroMetric(value) : '—');
  const showList = open && input.trim().length >= 2 && (!comune || input.trim() !== comune.name);

  return <article className="vpq-example" aria-labelledby="vpq-example-title" data-calculator-state={status} data-calculator-error={error || undefined}>
    <div className="vpq-example-heading"><h3 id="vpq-example-title">Calcola ora il tuo preventivo</h3></div>
    <ol className="vpq-example-steps" aria-label="Percorso nel configuratore"><li><b>1</b> Territorio</li><li><b>2</b> Quantità e servizi</li><li><b>3</b> Preventivo</li></ol>

    <div className="vpq-search">
      <label htmlFor="vpq-comune-input">Comune</label>
      <div className="vpq-place">
        <ProcessIcon name="pin" />
        <input
          id="vpq-comune-input"
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder="Scrivi il tuo Comune, es. Cormano"
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); if (comune && e.target.value.trim() !== comune.name) setComune(null); }}
          onFocus={() => setOpen(true)}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
          onKeyDown={onKeyDown}
        />
        {searching && <span className="vpq-search-status" aria-hidden="true">…</span>}
      </div>
      {showList && <ul id={listId} role="listbox" className="vpq-suggestions">
        {searchError && <li className="vpq-suggestion-empty" role="option" aria-disabled="true" aria-selected="false">Ricerca comuni non disponibile. Riprova tra poco.</li>}
        {!searchError && !searching && suggestions.length === 0 && <li className="vpq-suggestion-empty" role="option" aria-disabled="true" aria-selected="false">Nessun Comune trovato. Scrivi il nome completo, es. Cormano.</li>}
        {suggestions.map((s, i) => <li
          key={s.id ?? `${s.name}-${i}`}
          id={`${listId}-${i}`}
          role="option"
          aria-selected={i === activeIndex}
          className={i === activeIndex ? 'is-active' : undefined}
          onMouseDown={(e) => { e.preventDefault(); choose(s); }}
        ><strong>{s.name}</strong>{s.province && <span>{s.province}</span>}</li>)}
      </ul>}
    </div>

    <div className="vpq-metrics" aria-live="polite" aria-busy={status === 'loading'}>
      <div><span>{comune ? `Famiglie nel Comune di ${comune.name}` : 'Famiglie nel Comune'}</span><ProcessIcon name="people" /><strong>{metric(families)}</strong><small>Fonte ISTAT</small></div>
      <div><span>Quantità consigliata</span><ProcessIcon name="document" /><strong>{metric(recommended)}</strong><small>{status === 'ready' && marginNote ? marginNote : 'Famiglie + margine operativo'}</small></div>
      <div><span>Copertura del Comune</span><ProcessIcon name="chart" /><strong>{status === 'ready' && coverage !== null ? `${coverage}%` : metric(null)}</strong><small>Quota analizzata</small></div>
    </div>

    {status === 'idle' && <p className="vpq-example-note">Scegli un Comune: famiglie e quantità consigliata arrivano dai dati ISTAT reali.</p>}
    {status === 'loading' && <p className="vpq-example-note" role="status">Analisi dei dati ISTAT per {comune.name} in corso…</p>}
    {status === 'error' && <p className="vpq-calc-alert" role="alert">Dati territoriali non disponibili per {comune.name} in questo momento. Puoi comunque calcolare il preventivo nel configuratore.</p>}
    {status === 'unavailable' && <p className="vpq-calc-alert" role="alert">Non abbiamo dati ISTAT per {comune.name}. Puoi comunque calcolare il preventivo nel configuratore.</p>}

    <p className="vpq-info"><ProcessIcon name="info" /><span>Se la quantità supera la capacità stimata della zona, puoi ampliare il territorio o aggiungere altri Comuni.</span></p>
    <button type="button" className="vpq-cta" onClick={goToConfigurator}>Calcola il preventivo online <span aria-hidden="true">→</span></button>
    <p className="vpq-next">{comune ? `Apri il configuratore con ${comune.name} già selezionato.` : 'Scegli servizio e territorio e scopri il tuo preventivo.'}</p>
  </article>;
}
