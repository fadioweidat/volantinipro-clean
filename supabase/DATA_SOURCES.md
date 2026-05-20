# VolantiniPro Step 2 Data Sources

This file documents the real-data activation layer for Step 2. The UI must only display a source when the backend response includes that source in `sources`.

## Registry

The canonical registries are:

- Frontend: `src/lib/dataSources.js`
- Edge Functions: `supabase/functions/_shared/dataSources.ts`

## Required Environment Variables

Frontend-safe:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`
- `VITE_ANALYSIS_ISTAT_URL`
- `VITE_ANALYSIS_POI_URL`
- `VITE_MAPBOX_TOKEN` only if the token is intentionally public.

Server / Edge Function only:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `MAPBOX_TOKEN`
- `GOOGLE_PLACES_API_KEY` or `GOOGLE_API_KEY`
- `FOURSQUARE_API_KEY`
- `OVERPASS_ENDPOINT`
- GTFS data must be imported into `gtfs_stops` with `npm run import:gtfs -- --file=...`.
- OMI data must be imported into `omi_zones` with `npm run import:omi -- --file=...`.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, Google, Foursquare, or Resend keys in the frontend.

## Endpoint Strategy

Backend strategy: Supabase Edge Functions.

- `analysis-istat`: Door to Door territorial analysis from Supabase/PostGIS tables.
- `analysis-istat`: OMI lookup from `omi_zones` only when real imported rows match the area.
- `analysis-poi-search`: Hand to Hand and Business POI analysis from configured external providers.
- `analysis-poi-search`: GTFS lookup from `gtfs_stops` only when real imported stops match the radius.

## Data Import Requirement

Do not claim real ISTAT coverage until both tables are populated:

- `geo_municipalities`
- `demographic_indicators`

Minimum target municipalities:

- Milano
- Sesto San Giovanni
- Cinisello Balsamo
- Bresso
- Cormano
- Cusano Milanino
- Paderno Dugnano
- Varedo
- Monza
- Nova Milanese
- Bollate
- Senago
- Desio
- Muggio
- Lissone

Preferred target: all Lombardia municipalities with official geometry and demographic indicators.

Validation RPC:

```sql
select * from public.territorial_dataset_status();
```

Expected before production:

- `postgis_enabled = true`
- `geo_municipalities_count` covers Lombardia, not only demo rows
- `demographic_indicators_count` matches populated municipalities
- `target_municipalities_present >= 15`

## Truthfulness Rule

Every Edge Function returns:

```json
{
  "sources": ["ISTAT", "Dati geografici / PostGIS", "Analisi interna"]
}
```

The frontend renders only the `sources` returned by the backend. If no real provider is available, it shows `Dati non disponibili` or `Stima interna`, not fake provider badges.
