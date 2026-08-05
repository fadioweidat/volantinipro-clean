-- ============================================================
-- Zona circolare TEMPORANEA di test per il geofence Driver, centrata sulla
-- posizione reale attuale dell'operatore di test (fuori Italia):
-- 33.636490, 35.476185, raggio 300 m. Esclusivamente sulla campagna di test
-- 59a27968-3e3d-4bc0-9635-74d9235e1463 — nessuna campagna reale toccata.
-- La zona Milano gia' presente ("Zona test mappa Driver") resta invariata:
-- il geofence considera "dentro" l'appartenenza ad ALMENO una zona, quindi
-- le due zone di test coesistono senza interferire.
-- Idempotente: riesecuzioni non creano duplicati. Da rimuovere quando il
-- test sul campo e' concluso.
-- ============================================================

insert into public.campaign_zones (campaign_id, zone_name, center_lat, center_lng, radius_m)
select '59a27968-3e3d-4bc0-9635-74d9235e1463', 'Zona test geofence Libano', 33.636490, 35.476185, 300
where exists (
  select 1 from public.campaigns
  where id = '59a27968-3e3d-4bc0-9635-74d9235e1463'
)
and not exists (
  select 1 from public.campaign_zones
  where campaign_id = '59a27968-3e3d-4bc0-9635-74d9235e1463' and zone_name = 'Zona test geofence Libano'
);
