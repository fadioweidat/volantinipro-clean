# VolantiniPro — Backup Manifest

Release: `volantinipro-rc-2026-08-06`. Backup eseguito il 2026-08-06 in sola lettura contro il progetto Supabase remoto `mqkelrsvksrzrpmbstvd` ("volantinipro", eu-west-1, ACTIVE_HEALTHY). Nessuna scrittura sul database remoto. Destinazione: `_secure-backups/volantinipro/releases/volantinipro-rc-2026-08-06/`, **fuori dal repository Git** (sibling di `volantinipro-full-site-final/`, mai tracciata, mai committata).

## Contenuto del backup

| File | Descrizione | Dimensione | SHA-256 |
|---|---|---|---|
| `schema_public_auth_storage.sql` | Schema completo (DDL): tabelle, funzioni, trigger, policy RLS, indici, grant — schemi `public`, `auth`, `storage` | 341.579 byte | `8ce891a60997be8770b3bd8f716c9a139b5f7c1d1c140e0f2c7fb525d7b19b52` |
| `data_public_auth_storage.sql` | Dump dati completo (formato `INSERT`, non `COPY` — scelta del comando `supabase db dump --data-only`), schemi `public`, `auth`, `storage` | 203.969.096 byte (~204 MB) | `fcd8f1cc104dfa6aec0f8d9746ee022a65d74b1829a6a198933efb67a6f4248c` |
| `migration_history_list.json` | Output di `supabase migration list --linked` — confronto locale/remoto per versione | 3.385 byte | `3bb292818c35aa1f9e67e78eb5e4e15a6fc0ab9c2b9f698def8e9262213cdf49` |
| `migration_history_full_ledger.json` | Contenuto esatto di `supabase_migrations.schema_migrations` (version, name) — 11 righe reali | 1.048 byte | `865a31b21e9fb8e1028d0be6a8b808487a054298d22c36be9938fa82832c96fd` |
| `catalog_summary.json` | Conteggio oggetti per categoria (tabelle, funzioni, trigger, policy, indici, bucket storage, oggetti storage, utenti auth) | 738 byte | `c376813af2519f3bd5e42bebdf875a078868a8d45fbe1c6a59c13efefdc59f01` |
| `pre_backup_counts.json` | Conteggi critici catturati immediatamente prima del backup (vedi sotto) | 544 byte | `394e6e4289b41570e289dc5c44fe1fd3171373763b55ec13403fb81834213184` |
| `checksums_sha256.txt` | Elenco hash SHA-256 di tutti i file sopra | 563 byte | (auto-riferimento, verificabile ricalcolando) |

**Nessun dato personale è riportato in questo manifest** — solo nomi di file, dimensioni e hash. I file di dati (`data_public_auth_storage.sql`) contengono dati reali di produzione (inclusi `auth.users`) e restano esclusivamente nella destinazione sicura fuori dal repository.

## Cosa include il backup (per requisito del ticket)

| Requisito | Incluso | Dove |
|---|---|---|
| Schema PostgreSQL | Sì | `schema_public_auth_storage.sql` |
| Dati | Sì | `data_public_auth_storage.sql` |
| Migration history | Sì | `migration_history_list.json`, `migration_history_full_ledger.json` |
| Auth schema e dati necessari | Sì — schema completo + dati reali di `auth.users` (2 righe) | `schema_public_auth_storage.sql` + `data_public_auth_storage.sql` |
| Storage metadata | Sì — `storage.buckets` (4 righe), `storage.objects` (0 righe, nessun file caricato al momento del backup) | `schema_public_auth_storage.sql` + `data_public_auth_storage.sql` |
| Funzioni, trigger, policy, indici | Sì — 802 funzioni, 26 trigger, 91 policy, 189 indici (schema `public`) | `schema_public_auth_storage.sql`, verificato in `catalog_summary.json` |
| `geo_nil_milano` con 88 righe | Sì — confermato 88/88 sia nel conteggio pre-backup sia nel dump dati (`SELECT pg_catalog.setval('geo_nil_milano_id_seq', 88, true)` + 88 blocchi `VALUES`) | `data_public_auth_storage.sql` |
| Campagne | Sì — `campaigns` (2 righe), `campaign_zones` (2 righe) | `data_public_auth_storage.sql` |
| GPS | Sì — `gps_tracking_points` (421 righe), `delivery_sessions` (39 righe) | `data_public_auth_storage.sql` |
| Foto/metadati | Sì — `proof_photos` (0 righe al momento del backup) | `data_public_auth_storage.sql` |
| Configurazioni DB disponibili | Sì — grant, default privileges, RLS, estensioni installate (PostGIS, pgcrypto, uuid-ossp, pg_stat_statements) | `schema_public_auth_storage.sql` |

## Formato del dump: plain-SQL, non custom-format (`-Fc`)

**Nota di trasparenza sulla sicurezza.** Il metodo scelto per il backup è `supabase db dump --linked` (plain-SQL, `INSERT`/`DDL` testuale), non `pg_dump -Fc` (formato binario custom). Motivo: durante la preparazione di questo backup, un comando diagnostico (`supabase db dump --linked --dry-run`, eseguito per ispezionare lo script che la CLI avrebbe lanciato) ha stampato **una credenziale temporanea reale** del pooler di connessione (utente/password di sessione CLI a vita breve, non la password del database Postgres principale). La credenziale non è mai stata scritta in alcun file, commit, log o in questo o altri report — è comparsa una sola volta nell'output del comando diagnostico stesso. Per evitare qualunque rischio di ripetere l'esposizione (es. dover manipolare quella stessa credenziale per invocare `pg_dump -Fc` manualmente in un container Docker), si è scelto di proseguire esclusivamente con `supabase db dump --linked` nella sua forma normale (non `--dry-run`), che gestisce le credenziali internamente senza mai esporle a chi esegue il comando — esattamente come già usato con successo in tutti i comandi `supabase db query --linked` di questo e dei ticket precedenti.

Questa scelta **non riduce la completezza del backup**: un dump plain-SQL contiene esattamente lo stesso DDL e gli stessi dati di un dump `-Fc`, differisce solo nel formato di serializzazione. È stato inoltre il formato usato con successo per il restore completo verificato in `VOLANTINIPRO_RESTORE_TEST_REPORT.md`. Come conseguenza pratica: `pg_restore --list` (che richiede il formato binario) non è applicabile a questo backup — la verifica equivalente e più forte è stata l'esecuzione di un restore reale e completo su un clone isolato (vedi report di restore).

## Conteggi critici pre-backup (sola lettura, catturati immediatamente prima del dump)

| Tabella | Righe |
|---|---|
| `geo_nil_milano` | 88 |
| `campaigns` | 2 |
| `campaign_zones` | 2 |
| `gps_tracking_points` | 421 |
| `delivery_sessions` | 39 |
| `proof_photos` | 0 |
| `address_points` | 337.049 |
| `campaign_zone_progress` | 0 |
| `clienti` | 1 |
| `profiles` | 2 |

## Comandi eseguiti (tutti in sola lettura verso il remoto)

```
supabase db dump --linked --schema public,auth,storage -f schema_public_auth_storage.sql
supabase db dump --linked --data-only --schema public,auth,storage -f data_public_auth_storage.sql
supabase migration list --linked
supabase db query --linked "select version, name from supabase_migrations.schema_migrations order by version;"
supabase db query --linked "<query di conteggio per catalog_summary/pre_backup_counts>"
```

Nessun `db push`, nessuna `migration repair`, nessuna scrittura. Verifica di integrità completa in `VOLANTINIPRO_RESTORE_TEST_REPORT.md`.
