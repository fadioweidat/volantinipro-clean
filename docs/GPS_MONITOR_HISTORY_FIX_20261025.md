# Monitor GPS: correzione storico — 25 ottobre 2026

Branch: `fix/admin-gps-history`, base `integration/rc2-full-site` / `8f7c703`.
Diagnosi precedente: [GPS_MONITOR_ZERO_DIAGNOSI_20261025.md](GPS_MONITOR_ZERO_DIAGNOSI_20261025.md).

## Cambiamento

Il Monitor `/admin/live` legge i riepiloghi dalla nuova RPC admin
`gps_admin_session_summaries`. Conta tutti i punti nel DB e restituisce km
filtrati, primo/ultimo punto e ultimo fix, nomi campagna/operatore/gruppo.
Non scarica tutte le tracce per calcolare la lista. Una risposta JSON contiene
le sessioni: `max_rows=1000` di PostgREST non tronca i punti aggregati.

Le date selezionano l'ultima attività della sessione, come nella pagina
precedente; il riepilogo e la traccia comprendono tutti i punti della sessione,
non solo i punti dentro l'intervallo. I confini date sono inclusivi, convertiti
in UTC dal fuso locale del browser. Non si escludono campagne test/archiviate
quando si consulta lo storico.

La traccia viene richiesta solo per la sessione selezionata, in pagine da 500,
ordinate per `recorded_at,id`. L'ultimo timestamp del riepilogo delimita la
lettura; duplicati, errori o conteggi incoerenti producono un errore esplicito,
mai uno zero. Il pulsante Aggiorna ripete riepilogo e traccia. AbortController
impedisce che una risposta della selezione precedente sovrascriva quella nuova.

Il conteggio della lista è indipendente dalla traccia. Qualità GPS distingue
caricamento, errore e zero effettivo. Le sessioni completed/cancelled mostrano
“Sessione conclusa” invece di “In attesa GPS”. I select hanno larghezza limitata
alla cella e la griglia si riduce anche sotto 180 px.

I km SQL applicano soglie e algoritmo di `pointQuality.js`: accuracy >100 m,
coordinate invalide/0,0, duplicati (<1 s e <1 m), salti >45 m/s, confronto con
l'ultimo punto valido. Nessuna modifica/smoothing dei punti originali.

## Evidenza sul database reale (transazione annullata)

Nuove funzioni create e invocate in una transazione conclusa con ROLLBACK.
Simulazione del ruolo authenticated e dei claim dell'Admin già autorizzato:
non equivale a login o collaudo della pagina nel browser.
Intervallo: 01/09/2026 00:00–25/10/2026 23:59:59.999 Europe/Rome.

| Risultato | Valore |
| --- | ---: |
| Sessioni | 25 |
| Punti | 1.775 |
| Sessione 77f4c70f | 325 punti, 0,67 km |
| Sessione 7c20bb3f | 70 punti, 0,14 km |
| Sessione 464a880e | 34 punti, 8,44 km |
| Operatori con nome disponibile | 8 |
| Esecuzione RPC (un campione SQL, rete esclusa) | 369,374 ms |

Dopo il rollback: 2.348 punti totali, nuova RPC assente. Nessuna installazione
permanente della migration e nessuna modifica a RLS, intake o app Driver.

**Limite della diagnosi dei tre zeri:** il taglio a 1.000 spiega 22/25 zeri,
non i tre casi sopra. Non è stato possibile riprodurre gli altri tre zeri nella
pagina Admin autenticata: il browser condiviso è fermo al login magic link.
Non attribuiamo questo residuo a Traccar o a un filtro di qualità senza prova.
Il nuovo percorso mostra il conteggio SQL anche con traccia non ancora letta
o in errore; resta da verificare in browser il medesimo scenario originale.

## Sicurezza e rilascio

Migration: `20261025110044_admin_gps_history_summary.sql`.
Crea solo schema privato e tre funzioni. Nessuna tabella/colonna/policy esistente
viene alterata. Wrapper pubblico SECURITY INVOKER; implementazione privilegiata
solo in schema privato, SECURITY DEFINER, `search_path=''`, controllo auth.uid
+ gps_is_admin esistente. EXECUTE revocato a PUBLIC/anon/service_role; wrapper
e implementazione autorizzati ad authenticated, con verifica Admin interna.
Helper statistiche non eseguibile direttamente da authenticated.

Non applicata: riservata alla sessione database da integration dopo merge/OK.
Con un unico DB produzione, una preview può compilare ma la nuova pagina
mostrerà “Riepilogo GPS non disponibile” finché la RPC non viene installata.
Non usare un fallback alla query vecchia: nasconderebbe nuovamente gli errori.
Occorre coordinare questo passaggio prima del collaudo end-to-end.

Rollback SQL in `supabase/migrations/rollback/20261025110044_admin_gps_history_summary.sql`.
ATTENZIONE: termina con ROLLBACK = prova a vuoto. Per ripristinare davvero
sostituire ROLLBACK con COMMIT. Prima ripristinare il frontend precedente;
poi rimuovere wrapper, funzioni private e schema, senza CASCADE.

## Verifiche

- Nuova suite database/paginazione: 7/7.
- UI + contratti autorizzazione/lifecycle: 22/22 (3 test UI nuovi).
- Traccar separati: 47/47.
- Suite completa finale: 2.284 test, 2.273 pass, stessi 11 errori della base
  elencati in `TRACCAR_RELEASE_20261025.md`; nessuna nuova failure.
  Prima esecuzione: anche il test prestazioni instabile e contratto sorgente
  obsoleto `withLifecycle` (aggiornato per `mapRows`, mantenendo tutte le sessioni).
- Build Vite + prerender SEO: riuscita anche sul codice finale (11 pagine).
- Runtime Admin autenticato, layout browser mobile, scenario originale e
  produzione nuova versione: NON VERIFICATI. Non pubblicare su www senza OK.

## Collaudo dopo installazione autorizzata della RPC

1. Accedere alla preview come Admin, aprire Monitor GPS Live.
2. Impostare Intervallo date, 01/09–25/10, Tutti (incl. storico).
3. Prima della pulizia dati verificare 25 sessioni / 1.775 punti, poi i tre ID.
4. Selezionare una sessione: solo il suo session_id deve apparire nelle GET
   dei punti, range 0–499, 500–999, ecc.; nessuna GET con tutti gli ID.
5. Verificare nome campagna e i nomi degli 8 operatori disponibili, qualità
   completa e distanza; interrompere rete durante una pagina: errore, non zero.
6. Cambiare sessione rapidamente e ricaricare: nessuna traccia della precedente.
7. Completed/cancelled senza fix: Sessione conclusa, non In attesa GPS.
8. Aprire i select a 390 px e desktop: niente sovrapposizione tra campi.
9. Ricontrollare Driver/monitor cliente senza modificare dati storici.

La pulizia approvata cambia gli stati: i 20 started dello storico diventano
terminali, ma numero punti e collegamenti restano invariati. Eventuali sessioni
senza punti usano updated_at come attività: chiuderle oggi può cambiare la
selezione per un intervallo con fine prima di oggi.

## Anteprima e pulizia completata

PR: https://github.com/fadioweidat/volantinipro-clean/pull/17
Anteprima pubblicata dal primo commit, stato Vercel success:
https://volantinipro-git-fix-admin-g-b6c0b0-fenicesp-gmailcoms-projects.vercel.app/
Il percorso /admin/live reindirizza correttamente al login Admin; nessuna
sessione autenticata disponibile nel browser condiviso. La homepage della
preview è stata aperta; questo non verifica il Monitor. Nessun merge/www.

Pulizia DML separata completata: vedere [resoconto](GPS_TEST_CLEANUP_20261025.md).
Dopo la pulizia, la RPC proposta è stata nuovamente provata con ROLLBACK:
25 sessioni / 1.775 punti, conteggi e km dei tre ID invariati. Stati aggiornati:
20 cancelled, 5 completed. La RPC non è installata permanentemente.

Ultima suite mirata complessiva SQL/paginazione/UI/autorizzazione: 29/29.
