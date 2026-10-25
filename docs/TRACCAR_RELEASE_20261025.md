# Consegna Traccar — 25 ottobre 2026

Autorizzazione utente: fast-forward di `integration/rc2-full-site`, senza merge
commit o force, soltanto dopo suite completa e build. Nessuna migration né
Edge Function deve essere applicata da questa sessione: se ne occupa la
sessione database da integration dopo il rilascio del codice.

## Riferimento di ripristino prima del rilascio

- Commit integration precedente: `c9c3189f5df90a5c135d50f2e4ae3553a88963e0`.
- Deployment Vercel associato a quel commit, con stato `success` rilevato dal
  collegamento GitHub: `GF4Tx6Q7uRz7yGjZm35u3sWbsYpv`.
- Collegamento: https://vercel.com/fenicesp-gmailcoms-projects/volantinipro/GF4Tx6Q7uRz7yGjZm35u3sWbsYpv
- Non confermato tramite API Vercel che l’alias produzione punti attualmente
  a questo deployment: accesso team 403, consenso richiesto al titolare.
  È un riferimento verificato per commit/stato, non una prova di assegnazione
  corrente del dominio. Prima di un eventuale ripristino verificare in Vercel
  ambiente production, ID e domini. Non ripristinare un deployment preview.
- Nessun rollback è stato eseguito. Il codice precedente non richiede modifiche
  al DB, che questa sessione non modifica. Il rollback SQL separato termina
  con ROLLBACK: il COMMIT è riservato alla sessione database dopo OK.

## Verifiche prima del fast-forward

- `npm test` sulla base integration pulita: 2.284 test, 2.273 passati, 11 falliti.
- `npm test` sul candidato: prima esecuzione 12 falliti (11 di base + test
  prestazioni hit-test); ripetizione senza altre lavorazioni parallele:
  2.284 test, 2.273 passati, gli stessi 11 falliti della base, nessuno nuovo.
- La suite/lista dei test e il codice del test di prestazioni sono identici
  alla base. Le 17 failure citate nell’istruzione non si riproducono come
  conteggio in questo ambiente: sono riportati i risultati effettivi.
- Suite Traccar separata: 47/47 PASS (non inclusa nella lista `npm test`).
- Build Vite e prerender SEO: PASS, 11 pagine generate.
- La suite completa non è verde: la regressione è parziale per gli errori
  preesistenti elencati sotto. Telefono e flusso Admin autenticato non collaudati.

### Failure riprodotte anche sulla base integration

- vercel.json: rewrite SPA catch-all verso /index.html (deep link Admin/Driver/Cliente)
- §18-A — "OPERATORI: N" usa gli operatori ASSEGNATI, mai il numero di sessioni GPS
- §18-A — canonicalOperators: fonte primaria = assegnazioni reali, hasGps = driver_id fra le sessioni
- §18-C — nome reale quando disponibile, fallback "Operatore <short-id>" (mai "Operatore <indice>")
- DriverWorkMapPage: traccia propria + tracce gruppo, punti GPS per sessione, legenda "Tu"
- E — GpsMonitor: canonicalOperators + conteggi assegnati preservati
- MULTI-OP — contratto sorgente: GpsMonitor usa lo stesso algoritmo (dedup + colore stabile)
- HomePage: ordine sezioni Hero -> Perché -> Come funziona -> Servizi -> GPS -> Smart Pairing -> Dashboard -> Business -> FAQ -> Contatti -> CTA -> Footer
- GpsLiveSection: mappa/percorso/marker/stato/avanzamento/foto/timeline, non un grafico a linea generico
- HowItWorksSection: id=come-funziona, 4 step invariati, timeline orizzontale desktop / verticale mobile
- Nuove sezioni: responsive via CSS media query (niente breakpoint diversi senza motivo)
