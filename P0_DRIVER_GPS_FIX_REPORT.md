# P0-C Driver/GPS — report finale locale

Data: 2026-08-05  
Branch: `feat/full-site-final`  
Ambiente: Docker + Supabase locale; nessun Vercel, nessun push, nessun dev bypass.

## Baseline e stato finale

- Baseline: 44 migrazioni locali applicate e allineate; suite iniziale 158/158 PASS; build iniziale PASS.
- Stato finale: 48 migrazioni locali applicate e allineate. Le quattro nuove migrazioni P0-C sono `20260805000003`–`20260805000006`.
- Supabase core e container Edge Runtime attivi. I servizi locali opzionali già disabilitati (Studio/Realtime/Analytics e correlati) non sono richiesti dal percorso verificato.
- Edge Functions lasciate attive come richiesto.
- Fixture finali rimosse: 8 identità di test locali e 8 oggetti Storage eliminati; file temporaneo contenente le sessioni cancellato.
- Nessun segreto, JWT, password o API key è riportato in questo documento.

## Contratto prima/dopo

| Frontend | DB finale | Ruolo/grant/RLS | Prima | Dopo verificato |
|---|---|---|---|---|
| `resolveGpsAssignment` | `gps_get_operator_campaign(uuid)` + `operator_assignments` | `authenticated`; assegnazione valida dell’`auth.uid()` | coerente | Driver vede solo la campagna assegnata |
| `startGpsSession` | `gps_start_session(uuid,text,uuid)` | `authenticated`; owner assignment + campagna/gruppo zona | zona non validata | zona estranea negata; zona iniziale portata `In corso` |
| pause/resume/stop | `gps_transition_session(uuid,text)` | Driver proprietario o Admin secondo contratto | coerente | stessa sessione per pause/reload/resume; stop esplicito |
| cambio zona | `gps_transition_zone(uuid,text)` | Driver con sessione e assegnazione valide sulla stessa campagna/gruppo | qualunque autenticato poteva mutare una zona; ritorno `void` | Driver B/Cliente negati; precedente completata, finale attiva, stessa sessione restituita |
| punto GPS | `gps_insert_point(...)` | Driver della sessione attiva/pausa | race tra callback poteva duplicare campioni | deduplica coda/in-flight + lock transazionale DB non distruttivo |
| coverage | `gps_calculate_zone_coverage(uuid,numeric)` | Driver sessione/Admin | colonna `geometry` assente e chiave UI errata | RPC `ready`; UI legge `coverage_percent` |
| stale recovery | `gps_transition_session(uuid,'cancel')` | contratto della transition session | file migrazione dal nome ambiguo | verificato: non esiste RPC standalone `gps_cancel_stale_session`; il recupero è l’azione esplicita `cancel`, senza auto-close |
| POD | `proof_photos` + bucket privato `proof-photos` | Driver sessione; Admin; Cliente owner solo se approvata | policy legacy permissive rendeva leggibili foto non approvate e consentiva upload arbitrari | path sessione obbligatorio, upload estraneo 403, lettura Cliente solo dopo approvazione |
| Admin Live | sessions + points | Admin reale | storico contato ma escluso da lista/mappa | storico incluso di default; marker/polilinea/lista disponibili senza alterare KPI live/offline |
| Cliente Tracking | ownership `campaigns.user_id` + RLS GPS/POD | Cliente proprietario | API filtrava le foto, ma RLS legacy non garantiva isolamento | punti/sessioni visibili; foto solo approvate; nessun UUID/dato interno operatore |

`campaign_zones`, `operator_assignments`, `delivery_sessions`, `gps_tracking_points` e `proof_photos` sono stati verificati sia tramite catalogo PostgreSQL effettivo sia tramite chiamate con JWT reali. I grant RPC Driver sono limitati ad `authenticated`/`service_role`; anonimo è stato respinto con HTTP 401.

## Autorizzazione con JWT reali

| Prova | Esito |
|---|---|
| Driver A legge assegnazione/campagna propria | PASS |
| Driver B non legge assegnazione/campagna di A | PASS |
| Driver B non avvia la sessione di A | PASS (`42501`) |
| Driver B non cambia una zona di A | PASS (`42501`) |
| Cliente non usa RPC Driver né cambia zone | PASS |
| Admin autenticato legge i dati operativi | PASS |
| Anonimo usa RPC Driver | PASS: negato, HTTP 401 |
| Driver A tenta start con zona di altra campagna | PASS: negato, `ZONA_NON_AUTORIZZATA` |

Le identità UI hanno usato esclusivamente JWT utente reali. La service role non è mai stata usata come identità Driver, Admin o Cliente.

## Ciclo sessione e punti

Browser Chrome headless locale con geolocalizzazione simulata:

1. autenticazione Driver e assegnazione: PASS;
2. start Zona 1: PASS;
3. secondo start: `SESSIONE_GIA_ATTIVA`, PASS;
4. punti GPS: 5 campioni finali, 5 distinti, 0 gruppi duplicati;
5. pausa: PASS;
6. reload in pausa: PASS, stesso prefisso/session ID;
7. resume: PASS, stessa sessione;
8. offline: 4 campioni accodati durante la simulazione, coda poi svuotata;
9. cambio Zona 1 → Zona 2: PASS; Zona 1 e Zona 2 finali `Completata`;
10. stop: PASS; una sola sessione finale `completed`;
11. audit: una riga ciascuna per start, pause, resume, zone start, zone complete e session complete;
12. coverage: `ready`, 0,21%, 2 punti validi e 3 esclusi dal filtro qualità.

Nessuna chiusura automatica inattesa. Il record finale aveva tempi start/end, ultimo aggiornamento e distanza calcolabile; nessun `NaN` e nessun null trasformato impropriamente in zero.

## Browser, offline e dispositivo

- Geolocation permission e `watchPosition`: PASS in Chrome simulato.
- Accuratezza: 7 m simulati, visualizzati.
- Coda offline e riconnessione: PASS; errori di rete durante `offline=true` erano attesi e la coda è stata inviata al ritorno online.
- Wake Lock: richiesta eseguita; Chrome headless l’ha negata/non supportata. Fallback PASS, sessione non interrotta.
- “Apri in Google Maps”: PASS in browser su pagina mappa con sessione temporanea, poi chiusa e rimossa.
- Dispositivo fisico, GPS radio reale, background OS e batteria: **non verificati**. Nessuna affermazione di test fisico.

Latenza osservata: posizione Driver aggiornata entro il passo di attesa browser (circa 0,35 s); Admin Live, GPS campagna e Cliente hanno mostrato i dati al primo caricamento della rispettiva vista. La sequenza automatizzata delle tre viste ha richiesto circa 14 s complessivi. Intervalli steady-state configurati: 15 s Admin Live, 15 s GPS campagna, 30 s Cliente.

## POD e privacy

- Upload reale via input file browser, compressione Canvas e watermark: PASS.
- GPS, data/ora, campagna/sessione, gruppo, cliente, indirizzo, DDT, colli, esito, autista e note: pipeline e record verificati; metadati obbligatori presenti.
- Esiti `consegnato` e `rifiutato`: coperti dalla suite ufficiale; upload browser eseguito con `consegnato`.
- Storage privato e record `proof_photos`: PASS.
- Admin GPS vede foto e metadati: PASS.
- Cliente prima dell’approvazione: 0 foto, PASS.
- Cliente dopo approvazione locale: foto e URL firmato visibili, PASS.
- Cliente non proprietario/Driver B: nessuna esposizione incrociata, PASS.

## End-to-end UI

- Driver: sessione, accuracy, coda, punti, pausa/resume, zone, stop e POD visibili.
- Admin Live: storico completato, driver/sessione, campagna, gruppo, ultimo ping, 5 punti, marker e traccia visibili; KPI live/offline non conteggiano lo storico.
- GPS campagna: sessioni, punti, durata, coverage, zone, foto e controlli di correzione manuale presenti.
- Cliente: stato, avanzamento, ultimo aggiornamento, mappa, percorso e POD approvato; dati interni del Driver assenti.
- Console/network finale delle tre viste: nessun errore. Durante la prova offline sono comparsi solo `ERR_INTERNET_DISCONNECTED`, il warning Wake Lock headless e un 404 favicon non funzionale.

## Test, build e commit

- `npm test`: PASS, 177/177 test, 79 test top-level.
- `npm run build`: PASS, 669 moduli; resta il warning preesistente sul chunk principale >500 kB.
- `git diff --check`: PASS.
- Nuova suite ufficiale: `tests/gps_authorization_lifecycle.test.mjs`, inclusa realmente da `npm test`.

Commit richiesti, in ordine:

1. `fix(gps): align driver client with reconciled RPC contract`
2. `fix(gps): restore session lifecycle and zone transitions`
3. `fix(gps): restore POD and end-to-end visibility`
4. `test(gps): add authorization and lifecycle coverage`

## Problemi aperti

- Nessun difetto funzionale locale P0-C aperto.
- Restano fuori evidenza i comportamenti specifici di un dispositivo fisico e i servizi Supabase locali opzionali non avviati.
- La migrazione storica `20260803000003_gps_cancel_stale_session.sql` non crea una funzione con quel nome: espone intenzionalmente `cancel` dentro `gps_transition_session`. Il contratto effettivo è ora coperto da test e documentato.

## Verdetto

**P0 DRIVER GPS PASSED**
