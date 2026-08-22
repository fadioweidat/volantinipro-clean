-- ============================================================
-- Dato di test idempotente per verificare la mappa compatta Driver
-- (confine zona, stato dentro/vicino al confine/fuori) sulla campagna di
-- test 59a27968-3e3d-4bc0-9635-74d9235e1463: nessuna campagna in produzione
-- ha oggi geometria di zona popolata in public.campaign_zones (verificato,
-- 0 righe totali), quindi senza questo dato non e' possibile dimostrare il
-- confine sulla mappa con nessuna campagna reale.
-- ============================================================

insert into public.campaign_zones (campaign_id, zone_name, center_lat, center_lng, radius_m)
select '59a27968-3e3d-4bc0-9635-74d9235e1463', 'Zona test mappa Driver', 45.4642, 9.19, 300
where exists (
  select 1 from public.campaigns
  where id = '59a27968-3e3d-4bc0-9635-74d9235e1463'
)
and not exists (
  select 1 from public.campaign_zones
  where campaign_id = '59a27968-3e3d-4bc0-9635-74d9235e1463' and zone_name = 'Zona test mappa Driver'
);
