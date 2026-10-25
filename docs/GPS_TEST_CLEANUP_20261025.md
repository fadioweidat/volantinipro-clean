# Pulizia dati di prova — eseguita il 25 ottobre 2026

Autorizzazione: richiesta utente di riprendere la pulizia già approvata dopo
la preparazione della correzione GPS. LGT/Hassan e Marco Bianchi sono prove;
info@volantinipro.it è esclusa dalla regola automatica.

## Ambito effettivo

Prima: 107 campagne, 3 già is_test=true, 104 non marcate. Tra queste 104 c'è
una campagna info@volantinipro.it, da lasciare invariata. Pertanto sono state
marcate **103**, non 104; totale prove dopo l'operazione: **106**.
Nessun record aggiunto artificiosamente per raggiungere il numero richiesto.

Selezione positiva: account del titolare, account di test/QA, email esempio,
nomi espliciti test/synthetic e Marco Bianchi. Per le tre campagne senza email
cliente (Saronno, Como, Seveso) è stato verificato anche l'account creatore:
rispettivamente account test e account titolare. La sola assenza di email
non è un criterio di classificazione. Nessuna regola usa info@volantinipro.it
come indicatore positivo. Supplier LGT/Hassan identificato; nessuna campagna
ha direttamente il suo supplier_id. Nessuna modifica al profilo fornitore.

## Operazione e risultati

- 103 campagne: is_test=true.
- Delle 103, 58 in_progress: archiviate (non dichiarate lavori completati).
- 22 sessioni started abbandonate, tutte con ultimo fix fra agosto e ottobre:
  annullate tramite `gps_transition_session_v3(...,'cancel',...)`, funzione
  esistente con audit nativo. Marcatura metadata cleanup_run_id per tracciabilità.
- 0 campagne in_progress e 0 sessioni started residue.
- Campagna info esclusa: is_test=false, pending_review, updated_at invariato.
- Nessuna cancellazione di campagne, sessioni, assegnazioni, foto o punti.
- 2.348 punti GPS prima/dopo, digest degli stessi campi/ordinamento identico:
  `1e02617590f43a301dea6de712b05ad2`.
- Intervallo 01/09–25/10: ancora 25 sessioni e 1.775 punti; ora 20 cancelled
  e 5 completed (prima 20 started e 5 completed).

Eseguita prima una prova in transazione annullata, poi lo stesso script con
COMMIT. Le precondizioni verificano ID, stati, timestamp, conteggi, digest GPS
ed esclusione info; in caso di divergenza annullano l'intera operazione.
La verifica indipendente dopo COMMIT conferma i risultati sopra.

## Snapshot e ripristino

In `docs/maintenance/`:

- `GPS_TEST_CLEANUP_20261025_before.json`: ID e soli campi necessari al ripristino,
  senza coordinate GPS, credenziali, contatti o token di accesso.
- `GPS_TEST_CLEANUP_20261025_apply.sql`: script eseguito; in repository termina
  con ROLLBACK e non con COMMIT. La ripetizione dopo la pulizia fallisce sulle
  precondizioni, evitando modifiche ripetute.
- `GPS_TEST_CLEANUP_20261025_rollback.sql`: ripristino mirato dei flag/stati e
  metadata precedenti. Provato sul DB reale con transazione annullata:
  ripristinerebbe 104 campagne non marcate e 22 started. **Non applicato**.

ATTENZIONE: gli script terminano con ROLLBACK = prova a vuoto. Per applicare
realmente sostituire ROLLBACK con COMMIT. Il ripristino rifiuta punti GPS nuovi
o cambiamenti di stato intervenuti. Gli audit delle cancellazioni restano come
storia dell'operazione; updated_at delle campagne viene gestito dal trigger
esistente e non viene retrodatato. Riaprire sessioni vecchie richiede revisione
operativa: lo script è uno strumento di recupero, non un'azione automatica.

## Sito e nuova RPC

Nessun merge in integration né pubblicazione www. La preview del branch
`fix/admin-gps-history` è pronta (PR #17). La nuova RPC storico NON è stata
installata permanentemente: la sessione database la applicherà da integration
secondo il flusso autorizzato. La pulizia DML approvata è distinta da quella
migration e non cambia il codice del sito.
