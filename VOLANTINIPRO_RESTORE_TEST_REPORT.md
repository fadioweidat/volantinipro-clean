# VolantiniPro — Restore Test Report

Release: `volantinipro-rc-2026-08-06`. Tutti i test in questo report sono stati eseguiti contro un **container Postgres locale usa-e-getta** (`rf1_restore_clone`, immagine `public.ecr.aws/supabase/postgres:17.6.1.084` — la stessa dello stack Supabase locale, ma un container nuovo e isolato, **mai** il database di sviluppo locale già esistente), rimosso al termine dei test. **Nessuna operazione è stata eseguita sul database remoto reale.**

## Fase 6 — Restore del backup su clone isolato

Procedura:
1. Container nuovo creato (`docker run ... postgres:17.6.1.084`, porta locale 54397), distinto dal container di sviluppo locale esistente.
2. Schemi `public`, `auth`, `storage` azzerati e ricreati da zero (`DROP SCHEMA ... CASCADE` + `CREATE SCHEMA`), estensioni reinstallate (PostGIS, pgcrypto, uuid-ossp, pgjwt).
3. Caricato `schema_public_auth_storage.sql` (341 KB, DDL completo) → **0 errori**.
4. Caricato `data_public_auth_storage.sql` (~204 MB) → **0 errori**, tutte le `INSERT` completate.
5. Ricostruito `supabase_migrations.schema_migrations` dalle 11 righe esportate in `migration_history_full_ledger.json` (quella tabella vive in uno schema separato non incluso nel dump SQL per design — i dati erano già catturati separatamente in Fase 4 del backup).

### Verifica conteggi critici — confronto pre-backup vs. post-restore

| Tabella | Pre-backup (remoto reale) | Post-restore (clone) | Esito |
|---|---|---|---|
| `geo_nil_milano` | 88 | **88** | ✅ identico |
| `campaigns` | 2 | 2 | ✅ identico |
| `campaign_zones` | 2 | 2 | ✅ identico |
| `gps_tracking_points` | 421 | 421 | ✅ identico |
| `delivery_sessions` | 39 | 39 | ✅ identico |
| `address_points` | 337.049 | 337.049 | ✅ identico |
| `clienti` | 1 | 1 | ✅ identico |
| `profiles` | 2 | 2 | ✅ identico |
| `auth.users` | 2 (verificato in Fase 4) | 2 | ✅ identico |
| `storage.buckets` | 4 | 4 | ✅ identico |

### Verifica catalogo oggetti — confronto pre-backup vs. post-restore

| Categoria | Remoto (pre-backup) | Clone (post-restore) | Esito |
|---|---|---|---|
| Tabelle (`public`) | 66 | 66 | ✅ identico |
| Funzioni (`public`) | 802 | 802 | ✅ identico |
| Trigger (`public`) | 26 | 26 | ✅ identico |
| Policy RLS (`public`) | 91 | 91 | ✅ identico |
| Indici (`public`) | 189 | 189 | ✅ identico |
| Oggetti storage | 0 | 0 | ✅ identico |
| Migration history (righe ledger) | 11 | 11 | ✅ identico (ricostruito dall'export separato) |

### RPC NIL — verifica funzionale reale

Eseguito `select nil_code, nil_name, area_km2 from public.get_nil_breakdown_in_radius(45.4642, 9.1900, 2.0)` (coordinate centro Milano/Duomo, raggio 2 km) sul clone restaurato: **18 zone NIL restituite correttamente** (esempio: DUOMO, BRERA, STAZIONE CENTRALE - PONTE SEVESO, BUENOS AIRES - PORTA VENEZIA - PORTA MONFORTE, XXII MARZO), con superfici in km² coerenti con geometrie reali. Nessun dato personale coinvolto in questa RPC (solo geometrie e nomi di zone amministrative pubbliche).

**Conclusione Fase 6: clone equivalente al remoto in ogni conteggio e oggetto verificato. Restore completo riuscito.**

---

## Fase 7 — Dry-run e apply della release chain sul clone restaurato

Eseguito interamente sul clone di Fase 6 (mai sul remoto).

| Passo | Esito |
|---|---|
| 1. `runner --dry-run` | **PASSATO** — tutti i 7 file validati in un'unica transazione mai committata |
| 2. Verifica rollback completo | **PASSATO** — `to_regclass('public.campaign_coverage_adjustments')` e `to_regclass('public.volantinipro_release_migrations')` entrambi `NULL` dopo il dry-run |
| 3. `runner --apply` | **PASSATO** — tutti i 7 file applicati con successo (tempi: 147-7004ms, il file più lento è `150007` per l'indice GIST su 337k righe di `address_points`) |
| 4. Verifica ledger dedicato | **PASSATO** — `public.volantinipro_release_migrations` contiene esattamente 7 righe, tutte `status = success` |
| 5. Verifica 8 migrazioni | **PASSATO** — 7 applicate come schema change + `150004` correttamente esclusa dal runner (è lo script di sola verifica) |
| 6. Verifica hash | **PASSATO** — hash registrati nel ledger corrispondono esattamente ai file sorgente |
| 7. Riesecuzione `--apply` (idempotenza) | **PASSATO** — tutti i 7 file rilevati `[SKIP]` con hash identico, nessuna riscrittura |
| 8. `geo_nil_milano` ancora 88 | **PASSATO** — verificato dopo l'intera catena: **88/88** |
| 9. Nessuna regressione RPC NIL | **PASSATO** — `get_nil_breakdown_in_radius` restituisce 18 zone, identico al pre-apply |
| 10. GPS, AI schema, GTFS, territorio, sicurezza | **PASSATO** — `campaign_coverage_adjustments` creata; `gtfs_routes` creata, `gtfs_stops` (preesistente) non toccata; `ai_territorial_chat_cache` creata, `campaigns.ai_suggestions` (jsonb) presente; `get_address_points_radius_summary` presente; `geo_municipality_nil` correttamente **assente** (conferma Strategia A); `campaign_zone_progress` con `FORCE ROW LEVEL SECURITY = true` |

**Conclusione Fase 7: la catena production-safe si applica in modo pulito, idempotente e senza regressioni contro una copia fedele dello stato remoto reale.**

---

## Fase 8 — Rollback test

Eseguito sul clone già portato allo stato post-Fase 7 (7 migrazioni reali già applicate).

| Passo | Esito |
|---|---|
| Simulazione errore su una migrazione | File di test aggiuntivo (`150009`, mai parte della catena reale) con `create table` seguita da una chiamata a funzione inesistente |
| Rollback del singolo file | **PASSATO** — `to_regclass('public.rf1_rollback_marker')` è `NULL` dopo il fallimento: la `create table` all'interno della stessa transazione fallita non è stata persistita |
| Ledger coerente | **PASSATO** — il ledger mostra le 7 migrazioni reali `success` più la riga di test `status = failed`, nessuna voce mancante o duplicata |
| File successivi non eseguiti | **PASSATO** — essendo l'ultimo file della lista in questo test non c'erano file successivi; il comportamento di stop-al-primo-errore è comunque lo stesso già verificato in DEPLOY-PLAN-4 Fase 5 con file successivi presenti |
| Ripartenza dopo correzione | **PASSATO** — corretto il file di test (rimossa la chiamata alla funzione inesistente) e rieseguito `--apply`: le 7 migrazioni reali restano `[SKIP]` (hash invariato), il file corretto viene ritentato (perché il suo stato precedente era `failed`, non `success`) e applicato con successo |

### Reversibilità delle migrazioni della catena — SQL vs. restore

| Migrazione | Reversibile via SQL | Note |
|---|---|---|
| `150001` (schema GPS v2 + tabella adjustments) | Sì | `DROP TABLE IF EXISTS campaign_coverage_adjustments_log, campaign_coverage_adjustments; ALTER TABLE campaign_zone_progress DROP COLUMN IF EXISTS ...` — sicuro perché la baseline remota ha 0 righe in `campaign_zone_progress` |
| `150002` (funzioni canoniche, conversione `effective_percent`) | Parziale | Le funzioni sono ricreabili dal codice sorgente storico; la conversione di `effective_percent` da colonna generata a normale è reversibile solo se nessuna riga ha divergenza manuale post-conversione (verificabile ma non garantito una volta che l'applicazione scrive dati reali) |
| `150003` (RLS/grant) | Sì | Solo `REVOKE`/`GRANT` inversi, nessun dato coinvolto |
| `150005` (GTFS) | Sì | `DROP TABLE IF EXISTS gtfs_stop_times, gtfs_routes` — non tocca `gtfs_stops` preesistente |
| `150006` (hardening search_path) | Sì | `ALTER FUNCTION ... RESET search_path` |
| `150007` (indice + RPC territorio) | Sì | `DROP INDEX`, `DROP FUNCTION` — non tocca le 337k righe di `address_points` |
| `150008` (AI schema) | Sì, se applicata su un database senza dati AI reali ancora scritti | `DROP TABLE IF EXISTS ai_territorial_chat_cache; ALTER TABLE campaigns DROP COLUMN IF EXISTS ai_suggestions` — una volta che l'applicazione scrive righe reali in quelle strutture, il rollback SQL cancellerebbe dati applicativi reali, quindi **richiede restore da backup** se eseguita dopo un periodo di utilizzo reale, non subito dopo il deploy |

**Regola pratica**: ogni migrazione della catena è reversibile via SQL puro **immediatamente dopo il deploy** (prima che l'applicazione scriva nuovi dati nelle nuove strutture). Dopo un periodo di utilizzo reale, `150002` (conversione colonna) e `150008` (nuove tabelle/colonne AI) richiedono un restore da backup per un rollback sicuro senza perdita di dati applicativi scritti nel frattempo — coerente con la policy generale "backup prima di ogni applicazione" già richiesta in Fase 6 del Runbook.

**Conclusione Fase 8: rollback per singolo file, coerenza del ledger, e ripartenza dopo correzione tutti verificati e funzionanti.**
