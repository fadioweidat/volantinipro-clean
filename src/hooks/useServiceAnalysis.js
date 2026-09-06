import { useState, useEffect, useRef } from 'react';
import { buildServiceAnalysisRequest } from '../lib/step2/buildServiceAnalysisRequest.js';

const debugStep2 = (...args) => {
  if (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV && (import.meta.env.VITE_DEBUG_STEP2 === 'true' || (typeof window !== "undefined" && window.__VOLANTINIPRO_DEBUG_STEP2__))) console.log(...args);
};

let hasLoggedInvalidZone = false;

// Guard unico condiviso: stessa condizione usata dentro l'effect del hook e
// dalla diagnostica [STEP2_ANALYSIS_GATE] in Step2.jsx / dai test. Se cambia
// qui cambia in un solo punto. `municipality` resta obbligatorio: il backend
// analysis-istat normalizza sul nome comune, non sa gestire "punto+raggio"
// senza contesto comunale.
export function isAnalysisZoneValid({ lat, lng, radius, municipality } = {}) {
  const centerLat = Number(lat);
  const centerLng = Number(lng);
  const radiusKm = Number(radius);
  return Boolean(
    municipality &&
    Number.isFinite(centerLat) &&
    Number.isFinite(centerLng) &&
    centerLat !== 0 &&
    centerLng !== 0 &&
    radiusKm > 0
  );
}

export function useServiceAnalysis(lat, lng, radius, service, municipality = null, quantity = null, scope = null, analysisLevel = null, selectionScope = null, selectedMunicipalityCodes = null, targetSelection = null) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const lastRequestKeyRef = useRef("");
  const lastResultKeyRef = useRef("");
  // requestKey per cui e' gia' arrivata una risposta (successo O errore O
  // backend non configurato). Serve a distinguere "richiesta non ancora
  // partita / in debounce" da "richiesta conclusa senza dati": la
  // diagnostica territoriale in Step2.jsx marcava "Dato non disponibile" gia'
  // nello STESSO commit React in cui i parametri diventano validi, prima che
  // il setLoading(true) del debounce si riflettesse in `loading` -> falso
  // negativo (apiRequestFired:false) mentre il fetch stava per partire.
  const lastSettledKeyRef = useRef("");
  // Diagnostica temporanea (ticket "DEBOUNCE NEVER SETTLES"): snapshot dei
  // singoli campi + ultima requestKey vista, per loggare requestKey /
  // previousRequestKey / changedFields e rendere evidente cosa oscilla.
  const prevFieldsRef = useRef(null);
  const prevRequestKeyRef = useRef("");
  const [bfcacheResumeNonce, setBfcacheResumeNonce] = useState(0);

  // Calcolo in fase di render (puro) della richiesta corrente. `fetchKey` e'
  // l'identita' STABILE su cui si basano debounce/dedup/settle: dipende solo
  // dai parametri che cambiano davvero la risposta territoriale, con lat/lng
  // gia' quantizzate. Evita che un jitter di `quantity`/`scope`/coordinate al
  // 7° decimale faccia ripartire il debounce all'infinito.
  const zoneValid = isAnalysisZoneValid({ lat, lng, radius, municipality });
  const built = buildServiceAnalysisRequest({
    lat, lng, radius, service, municipality, quantity, scope, analysisLevel,
    selectionScope, selectedMunicipalityCodes, targetSelection
  });
  const fetchKey = zoneValid ? built.fetchKey : "";
  const requestKey = built.requestKey;

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

  // Diagnostica temporanea: logga ogni volta che la requestKey COMPLETA cambia,
  // dicendo se e' cambiata anche la fetchKey (cioe' se fara' partire una nuova
  // richiesta) e QUALI campi sono cambiati. Se per Cormano la fetchKey e'
  // stabile, questo log compare una volta sola e poi tace.
  useEffect(() => {
    const targetKeySnap = Array.isArray(targetSelection)
      ? [...targetSelection].filter(Boolean).sort().join('|')
      : String(targetSelection || '');
    const fields = {
      lat: Number.isFinite(Number(lat)) ? Number(lat).toFixed(6) : String(lat),
      lng: Number.isFinite(Number(lng)) ? Number(lng).toFixed(6) : String(lng),
      radius: String(Number(radius)),
      service: String(service || ""),
      municipality: String(municipality || ""),
      quantity: String(quantity || ""),
      scope: String(scope || ""),
      analysisLevel: String(analysisLevel || ""),
      selectionScope: String(selectionScope || ""),
      selectedMunicipalityCodes: String(selectedMunicipalityCodes || ""),
      targetKey: targetKeySnap,
    };
    const prev = prevFieldsRef.current;
    const changedFields = prev
      ? Object.keys(fields).filter((k) => fields[k] !== prev[k])
      : Object.keys(fields);
    if (prevRequestKeyRef.current !== requestKey) {
      // eslint-disable-next-line no-console
      console.warn("[STEP2_ANALYSIS_KEY]", {
        requestKey,
        previousRequestKey: prevRequestKeyRef.current || null,
        fetchKey,
        fetchKeyChanged: prevFieldsRef.current ? fetchKey !== (prev && prev.__fetchKey) : true,
        changedFields,
      });
    }
    fields.__fetchKey = fetchKey;
    prevFieldsRef.current = fields;
    prevRequestKeyRef.current = requestKey;
  }, [requestKey, fetchKey, lat, lng, radius, service, municipality, quantity, scope, analysisLevel, selectionScope, selectedMunicipalityCodes, targetSelection]);

  useEffect(() => {
    const radiusKm = Number(radius);
    const centerLat = Number(lat);
    const centerLng = Number(lng);

    if (!fetchKey) {
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

    const { url, canonicalCodes } = built;

    if (lastRequestKeyRef.current === fetchKey && data !== null && error === null) {
      debugStep2("[ZONE_ANALYSIS_SKIPPED_DUPLICATE]", { fetchKey });
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
      lastRequestKeyRef.current = fetchKey;

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
          if (lastResultKeyRef.current !== fetchKey) {
            lastResultKeyRef.current = fetchKey;
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
        if (requestId === requestIdRef.current) {
          // La richiesta per questa fetchKey ha avuto il suo esito
          // (dati, errore o backend non configurato): da ora la
          // diagnostica territoriale puo' pronunciarsi. Copre anche il
          // ramo `!url` (il `return` dentro try passa comunque di qui).
          lastSettledKeyRef.current = fetchKey;
          setLoading(false);
        }
      }
    };

    const timerId = setTimeout(() => {
      fetchData();
    }, 450); // Debounce delay 450ms

    return () => {
      clearTimeout(timerId);
      controller.abort();
    };
    // Dipende SOLO da `fetchKey` (identita' stabile della richiesta) e dal
    // nonce bfcache. Non piu' da lat/lng/quantity/scope raw: un loro jitter
    // che non cambia la richiesta reale non deve piu' far ripartire il
    // debounce (era la causa di "apiPending" perenne). `built`/`data`/`error`
    // sono letti apposta come closure "dell'ultimo fetchKey": non devono
    // ri-triggerare l'effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchKey, bfcacheResumeNonce]);

  // `pending` calcolato in fase di render (non in un effect): true quando la
  // zona e' valida ma per la fetchKey corrente non e' ancora arrivato alcun
  // esito. Permette a Step2.jsx di NON dichiarare "Dato non disponibile" (ne'
  // loggare [STEP2_ANALYSIS_GATE] come bloccato) nello stesso commit in cui i
  // parametri diventano validi, prima che il fetch debounced parta/risponda.
  const pending = Boolean(
    zoneValid &&
    lastSettledKeyRef.current !== fetchKey &&
    !(lastRequestKeyRef.current === fetchKey && data !== null && error === null)
  );

  return { data, loading, error, pending };
}
