# KPI Audit Step 2

Audit basato sui file locali `volantinipro-final.jsx`, `src/hooks/useServiceAnalysis.js`, `src/lib/services/service-config.js`, `src/lib/services/poi-api.js`, `src/lib/services/sectors-api.js`, `src/lib/services/omi-analysis.js`, `src/hooks/usePoi.js`, `src/hooks/useSectors.js`, `src/hooks/useDemographicIndicators.js`.

## Door to Door (D2D)

Metriche disponibili:
- `families` / `famiglie stimate` (number) - da ISTAT / `analysis-istat`, usata come base del volume residenziale.
- `pop` / `population` (number) - da ISTAT / `analysis-istat`.
- `area` (number, kmq) - dato territoriale / GIS.
- `coverage` (percent) - copertura stimata presente nei dati zona.
- `flyersMin`, `flyersMax`, `recommendedFlyers` (number) - calcolo operativo locale su fabbisogno volantini.
- `operDays` (number) - giorni operativi stimati.
- `familyIdx` (0-100) - score residenziale locale.
- `reachD2D` (0-100) - score reach D2D.
- `roiD2D` (0-100) - score ROI D2D.
- `confD2D` (0-100) - confidence D2D.
- `densita` (number) - densita abitanti/kmq nei dati zona.
- `mailboxes` (number) - cassette/stima recapiti presente nei dati zona.
- `areaType` (string) - tipologia area.
- `reddito`, `occup`, `imprese`, `stranieri`, `indVec` - contesto socio-economico dai dati territoriali.
- Indicatori demografici da `useDemographicIndicators`: `age_0_14_pct`, `age_15_34_pct`, `age_35_64_pct`, `age_65_plus_pct`, `referenceYear`.
- Layer disponibili da `service-config`: `radius`, `comuni`, `settori`, `density`, `poi`; `civici` e `tracking` sono marcati future/non disponibili.

## Hand to Hand (H2H)

Metriche disponibili:
- `poi` (number) - POI rilevati da Overpass/POI search.
- `nearbyBiz` (number) - attrattori o attivita vicine nei dati zona.
- `flowScore` (0-100) - flusso potenziale / intensita passaggio.
- `commDens` (0-100) - densita passaggio / contesto mixed-use.
- `transitStops` (number) - fermate transit nel raggio.
- `trainStations` (number) - stazioni nel raggio.
- `strongPts` (number) - hotspot operativi.
- `hotspots` (string) - descrizione hotspot principali.
- `timeSlots` (string) - fasce orarie consigliate.
- `operDaysH2H` (number) - giorni operativi stimati H2H.
- `reachH2H` (0-100) - score reach H2H.
- `roiH2H` (0-100) - score ROI H2H.
- `confH2H` (0-100) - confidence H2H.
- POI tags reali da `poi-api`: stazioni, metro, universita, centro commerciale, teatro, scuola, cinema, attrazione, mercato, biblioteca, bar/caffe, ristorante.
- Layer disponibili da `service-config`: `radius`, `poi`, `comuni`, `settori`; `hotspot`, `civici` e `tracking` sono marcati future/non disponibili.

## Business Distribution (B2B)

Metriche disponibili:
- `bizTotal` / `businesses` (number) - attivita rilevate.
- `targetBiz` / `targetBusinesses` (number) - attivita target.
- `topCats` (string) - categorie commerciali dominanti.
- `commDensB2B` (0-100) - densita commerciale.
- `cdIdx` (0-100) - Commercial Density Index.
- `competitors` (number) - competitor rilevati.
- `clusters` (number) - cluster commerciali.
- `strongZone` (string) - zona business forte.
- `operDaysB2B` (number) - giorni operativi stimati B2B.
- `reachB2B` (0-100) - score reach B2B.
- `roiB2B` (0-100) - score ROI B2B.
- `confB2B` (0-100) - confidence B2B.
- `reddito`, `occup`, `imprese` - contesto economico.
- POI tags reali da `poi-api`: farmacia, tabacchi, bar, supermercato, hotel, ufficio, studio finanziario, pub, abbigliamento, bar/caffe, ristorante, parrucchiere, negozio.
- Layer disponibili da `service-config`: `radius`, `poi`, `comuni`, `settori`; `cluster`, `civici` e `tracking` sono marcati future/non disponibili.

## Metriche universali (valide per tutti i servizi)

- `zonesInRadius` / comuni nel raggio - da dati geografici / PostGIS o fallback locale.
- `radiusKm`, `area`, `cityName` - parametri territoriali della selezione.
- Valori OMI da `analysis-omi-zones`: `omi_rows_count`, `omi_zone_count`, `omi_municipality_count`, `omi_typology_count`, `omi_min_value`, `omi_max_value`, zone e typology values.
- Fonti dati confermate da `confirmedSourcesOrFallback`.
- `familyIdx`, `reachScore`, `roiScore`, `confidence` esistono come famiglia di score, ma nel codice sono specializzati per servizio: `reachD2D/H2H/B2B`, `roiD2D/H2H/B2B`, `confD2D/H2H/B2B`.
- Dati demografici comunali da `useDemographicIndicators`, quando disponibili.
