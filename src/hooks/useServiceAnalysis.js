import { useState, useEffect, useRef } from 'react';
import { buildServiceAnalysisRequest } from '../lib/step2/buildServiceAnalysisRequest.js';

const debugStep2 = (...args) => {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV && (import.meta.env.VITE_DEBUG_STEP2 === 'true' || (typeof window !== "undefined" && window.__VOLANTINIPRO_DEBUG_STEP2__))) console.log(...args);
};

let hasLoggedInvalidZone = false;

export function useServiceAnalysis(lat, lng, radius, service, municipality = null, quantity = null, scope = null, analysisLevel = null, selectionScope = null, selectedMunicipalityCodes = null, targetSelection = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const lastRequestKeyRef = useRef("");
  const lastResultKeyRef = useRef("");
  const [bfcacheResumeNonce, setBfcacheResumeNonce] = useState(0);

  // P0 (sezione 4 del ticket "Step2 bloccato"): quando la pagina viene
  // ripristinata dal Back-Forward Cache del browser (Chrome bfcache),
  // React NON rimonta nulla — l'intero heap JS, inclusi i closure di questo
  // hook, riprende esattamente da dov'era stato congelato. Se un fetch era
  // in-flight al momento del freeze, alcuni browser interrompono la
  // connessione di rete sottostante senza mai far risolvere/rigettare la
  // Promise di fetch(): loading resterebbe true per sempre, senza che
  // nessun errore arrivi mai in console (a differenza del bug corretto
  // sopra, qui non c'e' nessun problema logico nell'hook da correggere,
  // il fetch stesso non torna mai). Invece di disabilitare bfcache
  // globalmente (esplicitamente vietato dal ticket), un listener su
  // `pageshow` con `event.persisted === true` forza una rivalutazione
  // pulita: incrementa un nonce nelle dipendenze dell'effect sotto, che
  // rifa' da capo la stessa logica (inclusa la correzione sopra) come se le
  // dipendenze fossero appena cambiate — nessun fetch duplicato se i
  // parametri sono identici e la richiesta precedente era gia' completata
  // con successo (il dedup su lastRequestKeyRef/data/error si applica
  // normalmente), ma se era rimasta bloccata a loading=true la rifa' pulita.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    function handlePageShow(event) {
      if (event.persisted) setBfcacheResumeNonce((n) => n + 1);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    const radiusKm = Number(radius);
    const centerLat = Number(lat);
    const centerLng = Number(lng);

    const hasValidZone =
      municipality &&
      Number.isFinite(centerLat) &&
      Number.isFinite(centerLng) &&
      centerLat !== 0 &&
      centerLng !== 0 &&
      radiusKm > 0;

    if (!hasValidZone) {
      if (!hasLoggedInvalidZone) {
        debugStep2("[ZONE_ANALYSIS_SKIPPED_INVALID_ZONE]", {
          municipality,
          centerLat,
          centerLng,
          radiusKm,
          service,
        });
        hasLoggedInvalidZone = true;
      }
      // P0 ROOT CAUSE (Step2 bloccato su "Caricamento in corso..."): un run
      // precedente di questo stesso effect puo' aver gia' chiamato
      // setLoading(true) e schedulato il fetch debounced (riga sotto). Se le
      // dipendenze cambiano di nuovo prima che il timer scatti (es. l'utente
      // cambia zona/servizio/raggio entro i 450ms di debounce, o un remount
      // ripristina uno stato intermedio momentaneamente non valido), il
      // cleanup dell'effect precedente fa SOLO clearTimeout+abort — il fetch
      // non era mai partito, quindi non c'e' nessun blocco finally che
      // rimetta loading a false. Questo ramo (hasValidZone=false) tornava
      // prima con `return undefined` senza mai resettare loading: se era
      // gia' true, restava true per sempre, senza alcun fetch in corso che
      // potesse mai risolverlo. Invalidare anche la richiesta in-flight
      // (requestIdRef) cosi' un'eventuale risposta tardiva di un fetch
      // comunque gia' partito in precedenza non riaccende loading dopo che
      // l'abbiamo appena spento qui.
      requestIdRef.current += 1;
      setLoading(false);
      return undefined;
    }

    const { requestKey, url, canonicalCodes } = buildServiceAnalysisRequest({
      lat: centerLat,
      lng: centerLng,
      radius: radiusKm,
      service,
      municipality,
      quantity,
      scope,
      analysisLevel,
      selectionScope,
      selectedMunicipalityCodes,
      targetSelection
    });

    if (lastRequestKeyRef.current === requestKey && data !== null && error === null) {
      debugStep2("[ZONE_ANALYSIS_SKIPPED_DUPLICATE]", { requestKey });
      // Stessa classe di bug del ramo hasValidZone sopra, caso piu' stretto:
      // se i parametri sono cambiati e tornati rapidamente allo stesso
      // requestKey gia' completato con successo (data!==null) PRIMA che il
      // debounce del run intermedio scattasse, quel run intermedio puo' aver
      // gia' chiamato setLoading(true) — questo ramo di dedup tornava senza
      // mai resettarlo. Qui non c'e' alcun fetch in corso per requestId
      // corrente (data e' gia' popolato da un fetch precedente completato),
      // quindi e' sempre sicuro garantire loading=false.
      requestIdRef.current += 1;
      setLoading(false);
      return undefined;
    }

    const requestId = ++requestIdRef.current;
    const controller = new AbortController();

    // Diamo subito feedback visivo
    setLoading(true);

    const fetchData = async () => {
      lastRequestKeyRef.current = requestKey;

      debugStep2('[ZONE_CHANGE]', { municipality, centerLat, centerLng, radiusKm, service, selectionScope, selectedMunicipalityCodes: canonicalCodes, targetSelection });

      setError(null);

      try {
        let anonKey = null;
        try {
          anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        } catch (e) {
          if (typeof process !== "undefined" && process.env) {
            anonKey = process.env.VITE_SUPABASE_ANON_KEY;
          }
        }

        if (!url) {
          setError("ANALYSIS_BACKEND_NOT_CONFIGURED");
          setData({ values: {}, comuni_breakdown: [], metadata: { isEstimated: false }, sources: [], error: "ANALYSIS_BACKEND_NOT_CONFIGURED" });
          return;
        }

        debugStep2('[ZONE_ANALYSIS_REQUEST]', {
          requestId,
          scope,
          service,
          center: { lat: centerLat, lng: centerLng },
          radiusKm,
          municipality,
          selectionScope,
          selectedMunicipalityCodes: canonicalCodes,
          targetSelection
        });

        const headers = { 'Content-Type': 'application/json' };
        if (anonKey) {
          headers['apikey'] = anonKey;
          headers['Authorization'] = `Bearer ${anonKey}`;
        }

        const response = await fetch(url, { headers, signal: controller.signal });
        const result = await response.json().catch(() => ({ error: "INVALID_ANALYSIS_RESPONSE" }));

        debugStep2('[ZONE_ANALYSIS_RESPONSE]', {
          requestId,
          status: response.status,
          mainArea: result?.metadata?.municipality || result?.metadata?.comune || municipality,
          resultsCount: (result?.comuni_breakdown?.length || 0) + (result?.nil_breakdown?.length || 0)
        });

        if (requestId !== requestIdRef.current) {
          debugStep2('[ZONE_ANALYSIS_IGNORED_STALE]', { requestId, current: requestIdRef.current });
          return;
        }

        if (!response.ok || result.error) {
          setError(result.error || result.code || `HTTP_${response.status}`);
          setData(result.sources || result.metadata ? result : null);
        } else {
          if (lastResultKeyRef.current !== requestKey) {
            lastResultKeyRef.current = requestKey;
            setData(result);
          }
          setError(null);
          debugStep2('[ZONE_ANALYSIS_APPLIED]', { requestId, municipality });
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        if (requestId !== requestIdRef.current) {
          debugStep2('[ZONE_ANALYSIS_IGNORED_STALE]', { requestId, error: "Aborted/Stale" });
          return;
        }
        setError("CONNECTION_ERROR");
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    };

    const timerId = setTimeout(() => {
      fetchData();
    }, 450); // Debounce delay 450ms

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
  }, [lat, lng, radius, service, municipality, quantity, scope, analysisLevel, selectionScope, selectedMunicipalityCodes, targetSelection ? (Array.isArray(targetSelection) ? [...targetSelection].sort().join('|') : targetSelection) : null, bfcacheResumeNonce]);

  return { data, loading, error };
}
