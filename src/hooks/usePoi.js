import { useState, useEffect, useRef, useCallback } from 'react';
import { fetchPoisWithFreshness, OVERPASS_SOURCE_LABEL } from '../lib/services/poi-api.js';

// In-module cache: keyed by "lat,lng,radiusKm,svcType".
// Survives re-renders within the session; cleared on page reload.
const _cache = {};

/**
 * Fetches real POI from Overpass for the current map view.
 * Debounced 700ms after input changes. Uses in-memory cache.
 *
 * Returns:
 *   pois    — Array<{id, lat, lng, name, category, color, priority, address}>
 *   loading — bool
 *   error   — string | null  (OVERPASS_TIMEOUT | network error). Il chiamante
 *             deve trattare `error` truthy come un fallimento della richiesta,
 *             mai come "zero risultati confermati" — `pois` puo' essere vuoto
 *             in entrambi i casi, solo `error` li distingue.
 *   retry   — () => void — ritenta la stessa query (stesso lat/lng/radius/
 *             serviceType/target), utile dopo un errore.
 *   stale   — bool — i POI sono l'ultimo dato verificato in cache, non una
 *             lettura aggiornata (Overpass non ha risposto).
 *   fetchedAt — string | null — quando quei POI sono stati letti da Overpass.
 *   sourceLabel — string — etichetta della fonte (es. "OpenStreetMap —
 *             aggiornamento 02/11/2026" per il dataset offline).
 */
export function usePoi(lat, lng, radiusKm, serviceType, targetSelection = []) {
  const [pois,    setPois]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [freshness, setFreshness] = useState({ stale: false, fetchedAt: null, sourceLabel: OVERPASS_SOURCE_LABEL });
  // Incrementato da retry(): forza un nuovo tentativo della stessa query.
  // Non serve invalidare la cache esplicitamente — un fallimento precedente
  // non viene mai scritto in _cache (solo il ramo di successo lo fa), quindi
  // a parita' di lat/lng/radius/serviceType/target la cache resta un miss e
  // il fetch riparte per davvero.
  const [retryNonce, setRetryNonce] = useState(0);
  const retry = useCallback(() => setRetryNonce(n => n + 1), []);

  // Stable rounded key avoids micro-precision re-fetches from geocoder
  const latR = lat    != null ? Math.round(lat    * 1000) / 1000 : null;
  const lngR = lng    != null ? Math.round(lng    * 1000) / 1000 : null;
  const radR = radiusKm != null ? Math.round(Number(radiusKm) * 10) / 10 : null;
  const targetKey = Array.isArray(targetSelection)
    ? [...targetSelection].filter(Boolean).sort().join('|')
    : String(targetSelection || '');

  useEffect(() => {
    if (!latR || !lngR || !serviceType || !['d2d', 'h2h', 'b2b'].includes(serviceType)) {
      setPois([]);
      setLoading(false);
      setError(null);
      setFreshness({ stale: false, fetchedAt: null, sourceLabel: OVERPASS_SOURCE_LABEL });
      return undefined;
    }

    const cacheKey = `${latR},${lngR},${radR},${serviceType},${targetKey}`;

    if (_cache[cacheKey]) {
      setPois(_cache[cacheKey].pois);
      setFreshness({ stale: false, fetchedAt: _cache[cacheKey].fetchedAt, sourceLabel: _cache[cacheKey].sourceLabel });
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    let timerId;

    // Mostra subito lo stato di caricamento durante il debounce: in questo
    // intervallo non deve sembrare che i risultati provvisori siano definitivi.
    setLoading(true);
    setError(null);
    setFreshness({ stale: false, fetchedAt: null, sourceLabel: OVERPASS_SOURCE_LABEL });

    timerId = setTimeout(async () => {
      if (cancelled) return;
      setPois([]);

      try {
        const { pois: result, stale, fetchedAt, sourceLabel } = await fetchPoisWithFreshness({
          centerLat:   latR,
          centerLng:   lngR,
          radiusKm:    radR ?? 5,
          serviceType,
          targetSelection: targetKey ? targetKey.split('|') : [],
        });
        if (!cancelled) {
          // Un dato in cache (stale) non entra nella cache di sessione: al
          // prossimo passaggio o al Riprova si chiede di nuovo il dato aggiornato.
          if (!stale) _cache[cacheKey] = { pois: result, fetchedAt, sourceLabel };
          setPois(result);
          setFreshness({ stale, fetchedAt, sourceLabel });
          try {
            if (import.meta.env?.DEV) {
              console.debug('[usePoi] fetched POIs:', {
                count: result.length,
                serviceType,
                targetKey,
                lat: latR,
                lng: lngR,
                categories: Array.from(new Set(result.map((r) => r.category))),
              });
            }
          } catch {}
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err?.message ?? 'POI_ERROR';
          setError(msg);
          // Keep existing pois on timeout so map doesn't go blank
          if (msg !== 'OVERPASS_TIMEOUT') setPois([]);
          // import.meta.env non e' definito fuori da un runtime Vite (es. nei
          // test node:test): try/catch evita che un log di debug faccia
          // fallire proprio il path di errore che dovrebbe solo segnalare.
          try { if (import.meta.env.DEV) console.debug('[usePoi] error:', msg); } catch {}
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(timerId);
    };
  }, [latR, lngR, radR, serviceType, targetKey, retryNonce]); // eslint-disable-line react-hooks/exhaustive-deps

  return { pois, loading, error, retry, stale: freshness.stale, fetchedAt: freshness.fetchedAt, sourceLabel: freshness.sourceLabel };
}
