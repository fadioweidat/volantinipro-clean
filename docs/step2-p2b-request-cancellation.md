# Step 2 P2-B — cancellazione richieste e protezione stale response

## Problema iniziale

Le richieste POI Overpass e TPL potevano completarsi dopo un cambio rapido di comune, raggio o servizio. Gli hook non propagavano un `AbortSignal` fino a `fetch` e non avevano una seconda protezione logica contro risposte obsolete. Un abort poteva inoltre attraversare il normale ramo di errore/fallback e produrre uno stato non coerente con la selezione corrente.

## Flusso individuato

- POI: `usePoi` → `fetchPois` → endpoint Overpass primario/fallback → `fetch`.
- TPL: `useTransportStops` → `fetchTransportStopsInRadius` → RPC Supabase → `fetch`.
- Territoriale: `useServiceAnalysis` → `fetch` di `analysis-istat`/`analysis-poi-search`.

Il flusso territoriale possedeva già controller per effetto, propagazione del signal, cleanup e request ID; è stato verificato e lasciato invariato. P2-B completa lo stesso contratto per POI e TPL.

## AbortController e propagazione

`beginLatestRequest` crea controller e ID della richiesta corrente negli hook POI/TPL. Il cleanup dell'effetto cancella debounce e controller. Il signal viene passato esplicitamente con la convenzione `{ signal, timeoutMs }` ai servizi e da questi a ogni `fetch`.

I cambi a parametri non validi, cache o servizio incompatibile incrementano il token corrente, impedendo a una promise precedente di applicare il risultato anche se l'ambiente non interrompe immediatamente la fetch.

## Timeout

`createTimeoutSignal` deriva un signal dal signal dell'hook, registra un timer e distingue la scadenza (`didTimeout`) dall'abort del parent. Il timer e il listener vengono sempre rimossi in `finally`/`cleanup`.

- timeout Overpass: `OVERPASS_TIMEOUT`;
- timeout TPL: `TRANSPORT_TIMEOUT`;
- abort intenzionale: `AbortError`, ignorato dagli hook senza warning, empty state o log applicativo.

I codici timeout continuano a usare i messaggi user-friendly P2-A.

## Protezione stale response

Ogni applicazione di dati, errori o fine loading verifica `request.isCurrent()` e lo stato del signal. L'abort è quindi la prima barriera; il request ID è la difesa aggiuntiva per fetch o mock che ignorano/campionano in ritardo la cancellazione.

## Fallback Overpass

Un errore HTTP/rete reale può ancora attivare l'endpoint successivo. Prima di ogni tentativo viene controllato il parent signal. Se il parent è stato abortito, l'errore resta `AbortError`, il ciclo termina e il fallback non parte. Ogni tentativo usa un signal derivato dallo stesso parent.

## File modificati

- `src/hooks/usePoi.js`
- `src/hooks/useTransportStops.js`
- `src/lib/services/poi-api.js`
- `src/lib/services/transport-api.js`
- `src/lib/services/request-cancellation.js` (nuovo)
- `tests/step2_request_cancellation.test.mjs` (nuovo)
- `tests/browser_step2_offline_contract.cjs`
- `package.json`
- `docs/step2-p2b-request-cancellation.md` (nuovo)

## Test aggiunti

Il test Node P2-B copre:

1. Milano lenta e Bergamo più recente;
2. abort intenzionale senza warning/empty;
3. timeout TPL e messaggio P2-A;
4. errore reale con fallback e signal propagato;
5. abort senza fallback;
6. cambio H2H → Business;
7. cleanup/unmount e rimozione timeout.

Il contratto browser offline copre inoltre Milano lenta → Bergamo veloce con POI e TPL distinti, assenza di warning da abort, errori console/pagina e fixture non gestite a zero, e round-trip Step 2 → Step 3 → Step 2.

## Comandi e risultati

- `npm test`: PASS, incluse le suite P2-A e P2-B.
- `npm run build`: PASS, 610 moduli trasformati; resta il warning preesistente sul chunk principale oltre 800 kB, escluso dal perimetro P2-B.
- `npm run test:browser:offline`: PASS. Race Milano → Bergamo, round-trip e regressioni D2D/H2H/Business verdi; errori pagina `0`, errori console `0`, fixture request non gestite `0`.
- `git diff --check`: PASS; soltanto warning informativi Git sulla futura conversione LF/CRLF.
- `git status --short`: mostra esclusivamente i file P2-B elencati sopra; nessun commit creato.

L'ambiente PowerShell emette inoltre un warning non bloccante di accesso al percorso npm globale e Node segnala i package ESM senza `type: module`; entrambi erano già presenti e non cambiano l'exit code dei test.

## Limiti rimasti

I timeout dipendono dalla capacità del runtime di consegnare l'abort a `fetch`; il request ID impedisce comunque l'applicazione di una risposta tardiva. Non sono stati modificati endpoint, dati territoriali, formule, rendering GIS o contratti P2-A.
