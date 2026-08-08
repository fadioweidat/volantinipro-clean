# VolantiniPro — Release Freeze Report

Ticket: RELEASE-FREEZE-1. Nessuna migrazione applicata al database remoto, nessun deploy di Edge Function o frontend, nessun `db push`/`migration repair`, nessun push Git eseguito.

## Fase 1 — Stato repository

| Campo | Valore |
|---|---|
| Repository | `volantinipro-full-site-final` |
| Branch | `feat/full-site-final` |
| HEAD (prima del freeze) | `04c7008` — 2026-08-06 13:07:15 +0300 |
| `npm test` | **244/244 passati** |
| `npm run build` | **Riuscito** (39.19s) |
| `git diff --check` | Nessun errore reale |
| Commit locali non pushati (prima di questo ticket) | 29 |

**Scoperta e correzione**: `.gitignore` conteneva una regola generale `*.sql` senza eccezione per `supabase/migrations_production_safe/`, che avrebbe silenziosamente escluso le 8 migrazioni production-safe da qualunque commit. Corretto con una singola riga di eccezione (`!supabase/migrations_production_safe/*.sql`).

Classificazione completa dei file residui e tabella file/scopo/motivo/rischio/entra-in-release: vedi il messaggio di questa sessione precedente al commit (non ripetuta qui per brevità — nessun file classificato "NO" è stato incluso).

## Fase 2 — Commit del tooling approvato

Tre commit locali creati, **nessun push**:

| Commit | Messaggio | Contenuto |
|---|---|---|
| `8b2eaa8` | `chore(deploy): add isolated production migration runner` | `.gitignore` (eccezione), `scripts/deploy-production-migrations.mjs`, `package.json`, `package-lock.json` |
| `6cb517a` | `chore(db): track production-safe migration chain` | 8 file `supabase/migrations_production_safe/20260806150001-150008` |
| `574805b` | `docs(deploy): finalize migration isolation and runbook` | `PRODUCTION_MIGRATION_LEDGER_ISOLATION.md`, `PRODUCTION_SAFE_MIGRATION_CHAIN.md`, `REMOTE_PRODUCTION_MIGRATION_MATRIX.md`, `VOLANTINIPRO_DEPLOY_RUNBOOK.md` |

Esclusi (verificato nessun secret, nessun dump, nessun log, nessun artefatto browser tra i file committati): report `AI_BRAIN_*`/`P0_*`/`P1_*`/`FINAL_PROJECT_LOCAL_AUDIT.md` (lavoro di altri ticket non ancora committato), modifiche a `src/`/`supabase/functions/analysis-istat/`/`tests/` (lavoro applicativo in corso, esplicitamente vietato toccare), `artifacts/` (screenshot), `data/omi/processed/omi_import_report.json` (diff non correlato).

## Fase 3 — Release Candidate

| Campo | Valore |
|---|---|
| Commit RC | `574805b` |
| Nome release | `volantinipro-rc-2026-08-06` |
| Tag | **Non creato** — worktree non completamente pulito (vedi Fase 9) |
| Data | 2026-08-06 |
| Componenti inclusi | Runner, 8 migrazioni production-safe, 4 documenti di deploy |
| Componenti esclusi | Modifiche applicative non committate (`src/`, Edge Function `analysis-istat`), report di altri ticket, artefatti browser |
| Known limitations | Collisione `001`/`002`/`003` isolata ma non risolta (`PRODUCTION_SAFE_MIGRATION_CHAIN.md` resta PARTIAL); nessuna migrazione mai applicata al remoto reale; worktree non interamente pulito |

## Fase 4-8 — Backup, integrità, restore, dry-run/apply, rollback

Dettagli completi in [VOLANTINIPRO_BACKUP_MANIFEST.md](VOLANTINIPRO_BACKUP_MANIFEST.md) e [VOLANTINIPRO_RESTORE_TEST_REPORT.md](VOLANTINIPRO_RESTORE_TEST_REPORT.md). Riepilogo:

- Backup completo reale (schema+dati `public`/`auth`/`storage`, migration history, catalog summary, checksum SHA-256) eseguito in sola lettura contro il remoto, salvato fuori dal repository in `_secure-backups/volantinipro/releases/volantinipro-rc-2026-08-06/`.
- `geo_nil_milano` confermato **88 righe** immediatamente prima del backup.
- Restore completo su clone Postgres isolato (mai il DB di sviluppo locale esistente): **ogni conteggio critico e ogni conteggio di catalogo (tabelle/funzioni/trigger/policy/indici) identico tra remoto pre-backup e clone post-restore**.
- RPC NIL (`get_nil_breakdown_in_radius`) verificata funzionante sul clone restaurato (18 zone reali restituite).
- Catena production-safe (7 migrazioni + verifica) testata sul clone restaurato: dry-run con rollback reale confermato, apply riuscito, ledger dedicato coerente, seconda applicazione idempotente (skip), `geo_nil_milano` ancora 88 dopo l'intera catena, nessuna regressione su GPS/AI/GTFS/territorio/sicurezza.
- Test di rollback: errore simulato → rollback del singolo file confermato (nessun oggetto parziale persistito), ledger coerente, ripartenza dopo correzione riuscita.

## Fase 9 — GO/NO-GO

| Condizione | Stato |
|---|---|
| Worktree release pulito | ⚠️ **NO** — i file della release (tooling, migrazioni, documentazione) sono committati e puliti, ma il worktree contiene ancora modifiche non committate e non correlate a questa release (lavoro applicativo di altri ticket in `src/`, `supabase/functions/analysis-istat/`, `tests/`, più report non committati). Questi file sono stati correttamente esclusi dalla release (Fase 1/2), ma la loro presenza non committata nel worktree significa che l'albero non è formalmente "congelato" nella sua interezza |
| Tooling e migrazioni committati | ✅ Sì — 3 commit locali, verificati |
| Backup completo riuscito | ✅ Sì |
| Hash verificati | ✅ Sì — SHA-256 per ogni file di backup, registrati in `checksums_sha256.txt` |
| Restore completo riuscito | ✅ Sì |
| Clone equivalente al remoto | ✅ Sì — ogni conteggio verificato identico |
| Runner dry-run riuscito | ✅ Sì |
| Runner apply riuscito sul clone | ✅ Sì |
| Seconda applicazione sicura | ✅ Sì — idempotenza confermata |
| 88 NIL preservati | ✅ Sì — confermato prima del backup, dopo il restore, e dopo l'intera catena di migrazioni |
| Rollback test riuscito | ✅ Sì |
| Nessun segreto nel repository | ✅ Sì — verificato nei 3 commit, nessun valore di credenziale presente (solo nomi di variabili d'ambiente generici) |

**11 condizioni su 12 pienamente soddisfatte.** L'unica condizione non pienamente soddisfatta è "worktree release pulito", per un motivo reale e non banale: il worktree contiene lavoro applicativo in corso di altri ticket (GPS/configurator/AI edge function) mai committato. Non è stato toccato né committato in questo ticket, come esplicitamente richiesto ("non modificare la logica applicativa"). Ma la sua presenza non committata significa che chiunque faccia un checkout pulito di `HEAD` oggi otterrebbe una versione dell'applicazione **senza** quelle modifiche in sospeso — un rischio operativo reale per qualunque deploy successivo che assuma che il working tree corrente rifletta lo stato voluto dell'app, non solo lo stato del database.

### VERDETTO

**RELEASE FREEZE AND RESTORE READY — NO-GO**

Motivo del NO-GO: **non tecnico sul lato database/migrazioni** (quella parte è interamente pronta, verificata, e riproducibile — 11/12 condizioni verdi) ma **procedurale sul worktree**: prima di dichiarare il freeze completo serve una decisione esplicita dell'operatore su cosa fare del lavoro applicativo non committato residuo (committarlo in un commit separato e rivisto, oppure metterlo esplicitamente da parte con `git stash` documentato) — questo ticket non era autorizzato a prendere quella decisione al posto dell'operatore, poiché avrebbe significato modificare la logica applicativa, esplicitamente vietato.

Una volta risolto quel singolo punto (commit o stash esplicito del lavoro residuo, worktree verificato pulito con `git status --short` vuoto), tutte le altre condizioni sono già verificate e il verdetto diventerebbe GO senza necessità di ripetere backup/restore/dry-run (che restano validi finché il remoto non cambia stato).
