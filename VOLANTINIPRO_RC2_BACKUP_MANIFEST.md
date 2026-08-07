# VolantiniPro RC2 — Backup Manifest

**Release**: `volantinipro-rc2-2026-08-07`
**Worktree HEAD (verificato)**: `1e2eaef75ff428189c5203bbb6869f7149b06922`
**Project ref**: `mqkelrsvksrzrpmbstvd` ("volantinipro", eu-west-1)
**Destinazione backup**: `D:\cloaude volantini\_secure-backups\volantinipro\releases\volantinipro-rc2-2026-08-07\` (fuori dal repository, mai tracciato)
**Scrittura sul database remoto**: nessuna, in nessun momento

---

## Perché un nuovo backup per RC2

Il backup RC1 (2026-08-06, `volantinipro-rc-2026-08-06/`) non copre la migrazione `20260806150009` (flusso Admin→Driver) né lo stato del database dopo le verifiche browser E2E della serie RC2. Questo ticket crea un backup RC2 dedicato, indipendente, con lo stesso rigore (dump reale, hash verificati, restore test su clone).

## File prodotti

| File | Scopo | SHA-256 |
|---|---|---|
| `schema_public_auth_storage_202608070850.sql` | DDL completo public+auth+storage (341.579 byte) | `8ce891a60997be8770b3bd8f716c9a139b5f7c1d1c140e0f2c7fb525d7b19b52` |
| `data_public_auth_storage_202608070850.sql` | Dati completi public+auth+storage (203.969.096 byte, ~204 MB) | `c48d6594c5c797f3387362343b539c83a67e05412695083c7ea24e1d55ac2457` |
| `schema_public_only_202608070850.sql` | DDL solo public (usato per il restore test reale) | non nel checksum originale — verificato via caricamento a 0 errori |
| `data_public_only_202608070850.sql` | Dati solo public (usato per il restore test reale, ~204 MB) | non nel checksum originale — verificato via conteggi esatti post-caricamento |
| `migration_history_export.json` | Export `supabase_migrations.schema_migrations` (11 righe, sola lettura) | `0434b41998d7e69128a3143a1da147d66c10757285911f97d4ec7810c14c6f36` |
| `catalog_summary.json` | Conteggi catalogo (tabelle/funzioni/trigger/policy/indici) | `9af362f87911c814974ffd080a13ed8bf87c15dcb8ae43f364bd503e2d050ab2` |
| `pre_backup_counts.json` | Conteggi critici pre-backup, nessun dato personale | `c200187ab7dbfecd42074bd3d025585a08357b8da4f416aaa20bd6783ca0f3b0` |
| `BACKUP_MANIFEST.json` | Questo stesso manifest in formato machine-readable | — |

**Fatto notevole**: l'hash dello schema (`8ce891a6...`) è **identico byte-per-byte** all'hash dello schema catturato nel backup RC1 del giorno precedente — conferma indipendente che nessuna scrittura ha toccato lo schema del remoto tra i due freeze.

## Copertura

- Schema: `public`, `auth`, `storage` — completa (tabelle, funzioni, trigger, policy, indici)
- Dati: `public`, `auth`, `storage` — completa (include `auth.users` e metadata `storage.objects`/`storage.buckets`, nessun file binario)
- Migration history: sì (11 righe, invariata dal baseline DEPLOY-PLAN-2)
- Catalog summary: sì
- Tabelle di interesse per RC2 verificate presenti nel dump: `geo_nil_milano`, `operator_profiles`, `operator_assignments`, `delivery_sessions`, `gps_tracking_points`, `audit_log`, `gps_operator_audit_log`. `operator_assignment_zones` **non presente** nel backup pre-RC2 (corretto — viene creata dalla migrazione `150009`, non ancora applicata al remoto).

## Nota sul restore test (dettaglio completo in `VOLANTINIPRO_RC2_RESTORE_TEST_REPORT.md`)

Il restore test reale (Fase 5) ha usato la variante **solo public**, non quella completa public+auth+storage, per un limite ambientale reale e documentato: l'immagine Postgres di base (`public.ecr.aws/supabase/postgres:17.6.1.084`) provvede nativamente gli schemi `auth`/`storage` con proprietà specifica (`supabase_auth_admin`, `supabase_storage_admin`); ricaricare un dump completo di quegli schemi con un ruolo diverso genera errori sistematici di ownership/permessi non correlati al contenuto di RC2. Nessuna delle 9 migrazioni di questa release tocca oggetti degli schemi `auth`/`storage` (confermato via grep su tutti e 9 i file), quindi questo limite non incide sulla verifica della catena di migrazione reale.

## Integrità

Tutti i 5 file con hash dichiarato sopra sono stati verificati con `sha256sum -c` (tutti `OK`) — vedi `VOLANTINIPRO_RC2_FREEZE_REPORT.md` Fase 4 per il dettaglio completo (dimensioni, leggibilità del dump, conteggi critici).
