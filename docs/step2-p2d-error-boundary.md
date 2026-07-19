# Step 2 P2-D — ErrorBoundary production-safe

## Problema iniziale

Lo Step 2 era già racchiuso in un boundary locale, ma il fallback conservava l'oggetto `Error` e le informazioni React nello stato e mostrava messaggio, stack e component stack. Non offriva inoltre un retry controllato o il ritorno allo Step 1. Un errore di render poteva quindi esporre dettagli tecnici e lasciare l'utente senza un percorso di recupero adeguato.

## Posizione e perimetro

`Step2ErrorBoundary` è definito in `src/components/Step2ErrorBoundary.jsx` e avvolge esclusivamente il ramo `page === "step2"` in `volantinipro-final.jsx`. Step 1, Step 3, Step 4 e la shell dell'applicazione restano fuori dal boundary.

Il boundary intercetta errori React di render/lifecycle nella sottostruttura Step 2. Non sostituisce i flussi locali già presenti per POI/TPL, cancellazioni, risposte obsolete, tile Leaflet, `mapInitError`, empty state o validazione.

## Fallback

Il fallback:

- usa `role="alert"` e `aria-live="assertive"`;
- sposta il focus sul titolo senza creare un focus trap;
- mostra solo testo utente sicuro e un codice assistenza non sensibile;
- non conserva né visualizza messaggio grezzo, stack, nomi file o component stack;
- offre le azioni `Riprova` e `Torna allo Step 1`.

## Retry e preservazione dello stato

`Riprova` resetta soltanto `hasError`/`errorId` nel boundary e incrementa una chiave interna per rimontare il figlio. Non modifica il parent state dell'applicazione e non esegue retry automatici.

Il contratto browser ha verificato prima e dopo il retry: servizio, comune canonico, raggio, quantità e decisione di copertura. Ha inoltre verificato il ritorno allo Step 1 senza reload e il successivo rientro nello Step 2. Lo stato canonico conservato nel parent resta disponibile; eventuale stato puramente effimero posseduto soltanto dal sottoalbero che ha generato il crash viene ricostruito al remount e non è reso persistente da P2-D.

## Logging ed error ID

`componentDidCatch` registra dettagli tecnici esclusivamente quando `import.meta.env.DEV` è vero. Non sono stati aggiunti logger o servizi esterni e il fallback di produzione non riceve dettagli tecnici.

Ogni crash genera un ID nel formato `S2-XXXXXX` usando casualità crittografica quando disponibile, con fallback casuale locale. L'ID non deriva dal messaggio di errore, dal timestamp o dai dati utente. Il browser contract ha verificato due ID validi e distinti.

## Errori esclusi

Restano nei rispettivi flussi locali e non attivano il boundary: POI/TPL non disponibili, `AbortError`, timeout gestiti, risposte stale, empty state, tile error e errore di inizializzazione Leaflet già gestito. Non sono stati aggiunti `window.onerror`, `window.onunhandledrejection` o `window.location.reload()`.

## Test aggiunti

- `tests/step2_error_boundary.test.mjs`: verifica implementazione, fallback accessibile, retry, navigazione, ID sicuro, assenza di dettagli tecnici/handler globali/reload e integrazione limitata allo Step 2.
- `tests/browser_step2_offline_contract.cjs`: usa un probe di render disponibile solo in DEV, provoca due crash controllati e verifica fallback, shell, focus, retry, preservazione stato, ritorno Step 1/Step 2 e distinzione tra errori React attesi ed errori console inattesi.
- `package.json`: include il test statico P2-D nel comando `npm test` senza rimuovere test esistenti.

## Scenario browser e risultati

La suite offline completa è stata eseguita realmente. Lo scenario `ErrorBoundary Step 2` è PASS:

- fallback accessibile: PASS;
- shell ancora visibile: PASS;
- dettagli tecnici nel fallback: assenti;
- retry senza perdita dello stato parent verificato: PASS;
- ritorno allo Step 1 senza reload: PASS;
- rientro nello Step 2: PASS;
- due crash successivi senza loop e con ID distinti: PASS;
- page error inattesi: 0;
- console error inattesi: 0;
- richieste fixture non gestite: 0.

I messaggi React relativi a `CONTROLLED_STEP2_RENDER_FAILURE` sono registrati separatamente come errori attesi e intercettati dal boundary; il controllo generale della console resta attivo. Gli scenari P2-A, P2-B e P2-C inclusi nel contratto restano PASS.

Verifiche finali:

- `npm test`: PASS, inclusi i contratti P2-A/P2-B/P2-C/P2-D;
- `npm run build`: PASS, 614 moduli trasformati;
- `npm run test:browser:offline`: PASS;
- `git diff --check`: PASS;
- ricerca di `window.onerror`, `window.onunhandledrejection` e `location.reload`: nessuna corrispondenza;
- probe controllato nel bundle di produzione: assente.

## Limiti

Un Error Boundary React non intercetta automaticamente errori in event handler, Promise rejection o callback asincrone. P2-D non introduce handler globali per mascherarli: page error e rejection non gestite continuano a far fallire il browser contract.

## File modificati

- `src/components/Step2ErrorBoundary.jsx`
- `volantinipro-final.jsx`
- `tests/step2_error_boundary.test.mjs`
- `tests/browser_step2_offline_contract.cjs`
- `package.json`
- `docs/step2-p2d-error-boundary.md`

Nessuna dipendenza è stata aggiunta e non sono stati modificati Truth Model, ViewModel, formule, servizi territoriali, lifecycle Leaflet o gli altri step.
