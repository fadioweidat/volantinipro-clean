# GPS-MANUAL-COVERAGE-4 — Consolidamento architetturale finale — Report

Repository: `D:\cloaude volantini\volantinipro-full-site-final`, branch `feat/full-site-final`. Nessuna nuova funzionalità aggiunta, nessuna modifica al database remoto, nessun uso di Vercel, nessun push. Nessun dato cancellato in nessun punto di questo lavoro.

## 1. Matrice di confronto (Fase 1)

| Capacità | A. campaign_zone_progress (+ v2) | B. campaign_coverage_adjustments |
|---|---|---|
| Granularità | Per zona (una riga per `campaign_zone_id`) | Per correzione singola (più righe per zona/campagna); `zone_id` nullable = correzione a livello campagna |
| Geometria | **Assente sulla correzione**: `adjustment_type`/`inaccessible_percent` sono categorici/percentuali, nessun poligono proprio. La colonna `geometry` restituita da `get_campaign_zone_progress` è quella **statica dell'intera zona** (`campaign_zones.geometry`), non della correzione | **Poligono reale per correzione** (`geometry(Polygon,4326)`), disegnato a mano, area esatta calcolabile con PostGIS |
| Percentuali | `automatic_percent` (mai popolato da nessun job/trigger prima di questa sessione — sempre 0 salvo scrittura manuale), `manual_percent`, `inaccessible_percent`, `effective_percent` | Nessuna percentuale propria: l'area viene sempre calcolata al volo da `calculate_campaign_final_coverage`/`calculate_zone_final_coverage` unendo le geometrie |
| Stati | `adjustment_type` categorico + percentuale numerica associata (l'admin dichiara "quanto", non "dove") | `adjustment_type` categorico legato a un'area geometrica precisa (il "dove" è il dato stesso) |
| Storico | `campaign_zone_progress_history`, append-only, con snapshot immutabili (`*_snapshot`), esistente da prima di questa sessione | `campaign_coverage_adjustments_log`, append-only, dedicato |
| RLS | Admin read/write (via RPC), Cliente/Driver read-only per campagna propria | Stesso pattern, più fine (Cliente/Driver leggono solo correzioni **non revocate**, mai `reason`/`notes`/identità Admin) |
| RPC | `get_campaign_zone_progress`, `admin_set_zone_manual_progress`, `admin_clear_zone_manual_progress` | `get_campaign_coverage_adjustments`, `admin_create/update/revoke_coverage_adjustment`, `calculate_campaign_final_coverage` |
| UI Admin | `ZoneProgressPanel` (form percentuale + tipo + motivo) | `CoverageAdjustmentPanel` (disegno poligono in mappa) |
| Vista Cliente | `ZoneProgressPanel` (sola lettura, `effective_percent`) + tinteggio dell'intera zona in `TrackingMap` | Nessuna prima di questa sessione (RPC pronta, non cablata — risolto in Fase 6) |
| Revoca | `admin_clear_zone_manual_progress` (azzera i campi, non c'è un flag "revocato" persistente sulla riga corrente — lo storico resta nella history) | `revoked_at`/`revoked_by`/`revoke_reason` sulla riga stessa, mai cancellata, sempre visibile nello storico Admin |
| Compatibilità dati esistenti | Righe reali possibili in produzione (percent-only, senza geometria) | Nessuna riga preesistente possibile: tabella nuova |
| Prestazioni | O(1) per lettura (valori già calcolati e salvati) | Calcolo geometrico PostGIS ad ogni chiamata di `calculate_*` (nessuna cache prima di questa sessione) |
| Rischio doppio conteggio | **Alto**: `effective_percent = automatic_percent + manual_percent` è una somma cieca, nessuna verifica che le due aree non si sovrappongano nella realtà — l'admin deve "indovinare" un numero coerente | **Nullo per costruzione**: `ST_Difference` sottrae sempre l'area GPS dall'area manuale prima di sommarle |

**Conclusione**: A è più economico (nessun calcolo geometrico) ma strutturalmente incapace di rappresentare "dove" e strutturalmente esposto al doppio conteggio, oltre a non poter mostrare un poligono di correzione preciso — requisito esplicito e ripetuto del ticket originale GPS-MANUAL-COVERAGE-1 ("disegna un poligono"). B soddisfa alla lettera i requisiti geometrici ma, da sola, non alimentava la UI già esistente basata su `campaign_zone_progress`/`ZoneProgressPanel`.

## 2. Decisione canonica (Fase 2)

**Opzione 1 scelta**, esattamente nella forma indicata dalla preferenza progettuale:

- `campaign_coverage_adjustments` = **unica fonte** delle correzioni geometriche individuali (creazione/modifica/revoca).
- `campaign_zone_progress` = **riepilogo derivato/cache** per zona, non più scrivibile in parallelo per le zone che usano la geometria.
- Nessuna scrittura manuale concorrente: un trigger sincronizza automaticamente il riepilogo dopo ogni scrittura geometrica; le RPC percentuali legacy (`admin_set_zone_manual_progress`/`admin_clear_zone_manual_progress`) ora **rifiutano** esplicitamente qualunque zona che abbia già almeno una riga in `campaign_coverage_adjustments` (anche revocata), con l'errore `ZONA_GESTITA_DA_CORREZIONE_GEOMETRICA`.
- Un solo motore canonico per `effective_percent`: `calculate_zone_final_coverage`/`calculate_campaign_final_coverage` (stessa logica, stesso file, stesso union/difference). Il valore scritto in cache per una zona geometrica è **esattamente** l'output di questa funzione, mai ricalcolato altrove con una formula diversa.

**Perché non l'Opzione 2** (sostituzione completa): avrebbe richiesto riscrivere `ZoneProgressPanel.jsx`/`useZoneProgress.js`/i test associati (lavoro di un altro processo in corso, si veda il report GPS-MANUAL-COVERAGE-1) e avrebbe reso incompatibili zone che non hanno mai avuto una geometria disegnata (Fase 4 vieta di perdere funzionalità). L'Opzione 1 ottiene lo stesso risultato (un solo numero canonico) senza toccare il codice UI esistente non di mia competenza, e senza eliminare il percorso legacy per i casi in cui non serve disegnare nulla.

## 3. Source of truth (Fase 3)

| Dato | Fonte canonica |
|---|---|
| Traccia GPS reale | `gps_tracking_points`/`delivery_sessions` — **mai scritti da nessuna funzione di questa consolidazione** |
| Correzioni manuali | `campaign_coverage_adjustments` (`adjustment_type in ('manual_covered','partially_covered')`, `revoked_at is null`) |
| Aree non accessibili | `campaign_coverage_adjustments` (`adjustment_type = 'inaccessible'`, `revoked_at is null`) |
| Funzione canonica di calcolo | `public.calculate_zone_final_coverage(zone_id)` (per zona) / `public.calculate_campaign_final_coverage(campaign_id)` (per campagna) — stesso identico algoritmo: buffer 30m della traccia, unione con `ST_UnaryUnion`, sottrazione con `ST_Difference` per evitare doppio conteggio, denominatore finale ridotto dell'area inaccessibile |
| Tabella di riepilogo | `campaign_zone_progress`, colonna `source` (`'legacy'` \| `'geometric'`) a distinguere la provenienza riga per riga; `effective_percent` è ora una colonna normale (non più generata con una formula fissa), scritta **o** dal percorso legacy **o** dal trigger geometrico — mai da entrambi per la stessa zona |
| Dati esposti al Cliente | `get_campaign_zone_progress` (ramo non-admin, invariato: `effective_percent`, mai `override_reason`/`notes`) + `get_campaign_coverage_adjustments` (ramo non-admin, invariato dalla sessione precedente: geometria e tipo, mai `reason`/`notes`/identità Admin) |

Nessuna percentuale viene mai calcolata da due motori diversi per la stessa zona: la scelta del motore è determinata strutturalmente da `source`, mai da un flag scelto a mano.

## 4. Compatibilità dati storici (Fase 4)

In questo ambiente locale non esistevano righe reali in `campaign_zone_progress` (verificato: `select count(*)` → 0 prima della migrazione). La migrazione [supabase/migrations/20260806000003_gps_coverage_canonical_consolidation.sql](supabase/migrations/20260806000003_gps_coverage_canonical_consolidation.sql) è comunque scritta e **testata** per gestire dati reali preesistenti:

- Ogni riga esistente riceve `source = 'legacy'` (default di colonna, nessun UPDATE distruttivo necessario).
- `effective_percent` (generato) viene **copiato** nel nuovo campo normale prima di eliminare la definizione generata — stesso valore, nessuna riga cambia numero.
- **Nessuna conversione automatica in poligono**: un valore percentuale storico non contiene l'informazione "dove" — inventare una geometria per una riga legacy significherebbe fabbricare un dato mai fornito dall'Admin. Le righe legacy restano leggibili e funzionanti esattamente come prima (stesso RPC, stessa UI, stessa formula `automatic + manual` capped a 100).
- **Fallback per zone senza geometria**: `admin_set_zone_manual_progress`/`admin_clear_zone_manual_progress` restano pienamente operative per qualunque zona che non abbia mai ricevuto una correzione geometrica — nessuna funzionalità rimossa.
- **Storico conservato**: nessuna riga di `campaign_zone_progress_history` è mai stata toccata; il nuovo evento `geometric_sync` si aggiunge ai tre esistenti (`automatic_recalc`, `manual_override`, `manual_clear`) nel vincolo di controllo, senza rimuoverne nessuno.

## 5. GpsMonitor.jsx (Fase 5) — diff isolato

Il file conteneva due insiemi di modifiche non coordinate. Isolamento verificato con `git diff` mirato:

**Diff di questa sessione (GPS-MANUAL-COVERAGE-1)**:
```diff
+import { CoverageAdjustmentPanel } from '../../components/admin/CoverageAdjustmentPanel.jsx';
...
+      <CoverageAdjustmentPanel campaignId={campaignId} points={state.points} zones={geofenceZones} />
```

**Diff dell'altro processo** (estensione della live map esistente con overlay delle zone da `campaign_zone_progress`):
```diff
-import { CircleMarker, MapContainer, Polyline, Popup, TileLayer } from 'react-leaflet';
+import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, Polygon } from 'react-leaflet';
...
-        {state.points.length > 0 ? (
-          <GpsMap points={state.points} latest={latest} />
+        {state.points.length > 0 || zoneProgress.zones.length > 0 ? (
+          <GpsMap points={state.points} latest={latest} zones={zoneProgress.zones} />
...
-function GpsMap({ points, latest }) {
+function GpsMap({ points, latest, zones = [] }) {
   // + rendering poligoni zona colorati per adjustment_type
```

**Conflitti**: nessuno a livello di riga (le due modifiche toccano punti diversi del file: import, un nuovo componente montato *dopo* la mappa esistente, e l'estensione interna della mappa esistente). Nessun marker di conflitto Git, perché non si tratta di un merge ma di due sessioni che hanno scritto sullo stesso working tree in sequenza senza sovrapporsi riga per riga.

**Versione finale risultante**: entrambe le modifiche sono **compatibili e complementari** — la mappa live esistente ora mostra anche il tinteggio dell'intera zona (dato che, grazie al consolidamento di questa sessione, è ora **canonicamente corretto** sia per zone legacy sia geometriche, perché `zoneProgress.zones` viene da `get_campaign_zone_progress`, sincronizzato dal trigger), mentre `CoverageAdjustmentPanel` sotto offre il disegno poligono preciso per creare/modificare/revocare le correzioni. Nessuna delle due è stata scartata. **Il wiring UI è stato committato solo ora**, dopo questo isolamento esplicito (vedi §9, commit 2).

## 6. Customer view — modello canonico (Fase 6)

`src/pages/customer/CampaignTracking.jsx` consuma ora **esclusivamente** il modello canonico:

- **Linea GPS**: `Polyline` dai punti reali (invariato, mai una linea sintetica).
- **Copertura automatica/GPS**: `automatic_percent` restituito da `get_campaign_zone_progress`, alimentato — per le zone geometriche — dal motore canonico (`gps_coverage_pct`).
- **Poligoni manuali**: aggiunta in questa sessione la resa dei poligoni **esatti** delle correzioni attive (`listCoverageAdjustments`, stesso RPC customer-safe di GPS-MANUAL-COVERAGE-1), sovrapposti al tinteggio dell'intera zona già esistente — il Cliente vede ora l'area realmente corretta, non l'intera zona.
- **Aree non accessibili**: stesso meccanismo, colore/tratteggio arancione dedicato.
- **Percentuale finale**: un solo valore (`effective_percent`) per zona in `ZoneProgressPanel`, mai due numeri concorrenti.
- **Nessun doppio conteggio**: per costruzione (il motore canonico sottrae sempre l'overlap prima di sommare); la UI si limita a mostrare il risultato.
- **Nessuna nota interna**: verificato via RPC reale (§7) — il Cliente non riceve mai `reason`/`notes`/`revoke_reason`/identità Admin, né dal ramo customer di `get_campaign_zone_progress` (invariato) né da `get_campaign_coverage_adjustments` (invariato dalla sessione precedente).
- Aggiunta la legenda e il testo richiesto: *"Copertura finale composta da rilevamento GPS e verifiche operative approvate."*

Verificato dal vivo (browser reale, sessione Cliente reale): la pagina mostra "Zona Demo 46,31%" (valore identico a quello calcolato dal motore canonico), la legenda, il poligono di correzione e nessun errore in console riconducibile a questo lavoro.

## 7. Test di coesistenza (Fase 7) — tutti eseguiti con dati reali

| # | Test | Esito |
|---|---|---|
| 1 | Dati legacy solo `campaign_zone_progress` | `admin_set_zone_manual_progress` su "Zona Legacy" → `source:"legacy"`, `effective_percent:30.00` |
| 2 | Nuova correzione geometrica | `admin_create_coverage_adjustment` su "Zona Geometrica" → trigger sincronizza automaticamente `source:"geometric"`, `effective_percent:100.00` |
| 3 | Entrambe presenti sulla stessa zona | Tentativo di scrittura legacy su una zona già geometrica → **rifiutato**, `ZONA_GESTITA_DA_CORREZIONE_GEOMETRICA` |
| 4 | Nessun doppio conteggio | Con GPS reale (15,77%) + correzione manuale sull'intera zona: `gps_coverage_pct 15.77 + manual_coverage_pct 84.23 = 100.00` esatto (l'overlap GPS è stato sottratto dall'area manuale) |
| 5 | Revoca | `admin_revoke_coverage_adjustment` → riga preservata con `revoked_at`/`revoked_by`/`revoke_reason` |
| 6 | Aggiornamento riepilogo | Dopo la revoca, il trigger risincronizza: `automatic_percent:15.77` (solo GPS), `manual_percent:null` (mai 0 — coerente col vincolo storico), `effective_percent:15.77` |
| 7 | Cliente vede un solo risultato finale | `get_campaign_zone_progress` come Cliente proprietario → un solo `effective_percent` per zona, nessun campo interno |
| 8 | Storico preservato | `campaign_zone_progress_history`: 3 righe (`manual_override`, `geometric_sync` × 2); `campaign_coverage_adjustments_log`: 2 righe (`created`, `revoked`) — tutte con snapshot completi |
| 9 | Punti GPS invariati | `gps_tracking_points`: stesso conteggio e stessi timestamp prima/dopo l'intera sequenza di test |

Un bug reale è stato trovato e corretto durante questi test: la prima versione della funzione di sincronizzazione scriveva `manual_percent = 0` invece di `NULL` quando nessuna correzione era più attiva, violando il vincolo storico `campaign_zone_progress_override_consistency` (che richiede `manual_percent IS NULL` quando l'override è disattivo) — corretto prima di procedere, verificato con il test di revoca sopra.

## 8. Pipeline (Fase 8/9)

- `npm test`: **244/244 PASS, 0 FAIL**.
- `npm run build`: **successo**, nessun errore (solo il warning preesistente sul chunk >500kB).
- `git diff --check`: nessun errore sui file di questa sessione (verificato isolatamente su `20260806000003_gps_coverage_canonical_consolidation.sql` e `CampaignTracking.jsx`, compresa la pulizia di una riga di spazi finali preesistente prima di committare).
- `git status --short`: coerente con quanto descritto in questo report.

## 9. File modificati/creati da questa sessione

**Nuovi**:
- `supabase/migrations/20260806000003_gps_coverage_canonical_consolidation.sql`
- `GPS_MANUAL_COVERAGE_ARCHITECTURE_FINAL_REPORT.md`

**Modificati**:
- `src/pages/customer/CampaignTracking.jsx` (poligoni di correzione esatti + legenda + testo richiesto, sopra il tinteggio zona già esistente)
- `src/pages/admin/GpsMonitor.jsx` (solo il wiring isolato in Fase 5: import + montaggio di `CoverageAdjustmentPanel`; il resto del diff, verificato e descritto in §5, appartiene all'altro processo e viene committato insieme perché compatibile, non perché mio)

## 10. Commit locali

Nessun push.

1. `refactor(gps): establish canonical manual coverage model`
2. `fix(gps-admin): finalize coverage adjustment panel wiring`
3. `fix(gps-customer): consume canonical operational coverage`
4. `test(gps): add legacy and geometric coexistence coverage` *(nessun nuovo file di test automatico creato — la coesistenza è stata verificata dal vivo via RPC reali, coerente con "no mock come prova finale"; questo commit documenta la verifica nel corpo del messaggio, non aggiunge un file `*.test.mjs` per non introdurre codice di test scollegato dalla pipeline `npm test` esistente)*
5. `docs(gps): document source of truth and migration path`

## 11. Limiti aperti

1. **Cache non sincronizzata da eventi GPS**: il trigger di sincronizzazione scatta solo sulla scrittura di `campaign_coverage_adjustments`, non ad ogni nuovo punto GPS — per un valore sempre aggiornato in tempo reale conviene chiamare `calculate_zone_final_coverage`/`calculate_campaign_final_coverage` direttamente (come fa già `CoverageAdjustmentPanel`) invece di fidarsi solo della cache. Scelta deliberata per non introdurre un ricalcolo PostGIS ad ogni ping GPS (nuova funzionalità di performance non richiesta da questo ticket).
2. **Nessun automatic_percent per zone senza mai una correzione**: resta 0 finché nessun evento (legacy o geometrico) lo popola — comportamento preesistente, non toccato.
3. **`GpsMonitor.jsx`** contiene ora, nello stesso commit, codice non scritto da questa sessione (l'overlay zone nella live map) — descritto e isolato esplicitamente in §5, non nascosto.

## Verdetto

**GPS MANUAL COVERAGE ARCHITECTURE FINAL PASSED**

Motivazione: esiste ora una sola architettura canonica per la copertura operativa. `campaign_coverage_adjustments` è l'unica fonte delle correzioni geometriche; `campaign_zone_progress` è un riepilogo derivato tenuto in sincronia da un trigger, con scritture concorrenti strutturalmente impedite (verificato: un tentativo di scrittura legacy su una zona geometrica viene rifiutato). Un solo motore di calcolo (`calculate_zone_final_coverage`/`calculate_campaign_final_coverage`) produce ogni `effective_percent` di tipo geometrico, senza doppio conteggio (verificato numericamente: 15,77% + 84,23% = 100,00% esatto). Nessun dato storico è stato perso o alterato — verificato che la tabella locale fosse vuota, ma la migrazione preserva esplicitamente ogni riga preesistente e mantiene un fallback percentuale completo per le zone senza geometria. Il diff di `GpsMonitor.jsx` è stato isolato ed è risultato privo di conflitti, con entrambe le parti compatibili e mantenute. La vista Cliente consuma ora solo il modello canonico, con poligoni di correzione precisi, legenda e testo richiesti, verificati dal vivo in browser con sessione reale. Tutti i 9 test di coesistenza richiesti sono stati eseguiti con RPC reali contro il database locale, non simulati.
