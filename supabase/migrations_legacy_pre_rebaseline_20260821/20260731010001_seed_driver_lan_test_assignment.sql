-- ============================================================
-- Dati di test idempotenti per verificare end-to-end il flusso Driver
-- (/driver/tracking/<campaignId>) sul telefono via LAN, richiesti dopo
-- la diagnosi che ha escluso un bug di inizializzazione Supabase via LAN
-- (config/CORS/bundle identici a localhost, verificato dal vivo) e ha
-- individuato la causa reale: nessuna riga in operator_assignments (0 in
-- produzione, per nessuna campagna) e nessun operator_profiles.
--
-- Operatore di test: unico account reale disponibile per il login sul
-- telefono (a41339f3-d0b1-4a52-95b1-aa964ba85ec5 / fenice.sp@gmail.com,
-- gia' role='admin' in profiles). Campagna: 59a27968-3e3d-4bc0-9635-
-- 74d9235e1463 (di proprieta' dello stesso utente, status 'draft').
--
-- gps_assignment_is_valid() richiede anche campaigns.status='in_progress':
-- portata qui esplicitamente da 'draft' a 'in_progress' su richiesta
-- esplicita, cosi' l'assegnazione di test risulta realmente valida e non
-- solo presente come riga.
-- ============================================================

insert into public.operator_profiles (user_id, display_name, active)
select 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5', 'Fenice (test operatore LAN)', true
where exists (
  select 1 from auth.users where id = 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5'
)
and not exists (
  select 1 from public.operator_profiles where user_id = 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5'
);

insert into public.operational_groups (campaign_id, name, notes)
select '59a27968-3e3d-4bc0-9635-74d9235e1463', 'Gruppo test LAN driver',
  'Creato per verificare end-to-end il flusso /driver/tracking via LAN.'
where exists (
  select 1 from public.campaigns where id = '59a27968-3e3d-4bc0-9635-74d9235e1463'
)
and not exists (
  select 1 from public.operational_groups
  where campaign_id = '59a27968-3e3d-4bc0-9635-74d9235e1463' and name = 'Gruppo test LAN driver'
);

insert into public.operator_assignments (operator_id, campaign_id, group_id, status, created_by)
select
  'a41339f3-d0b1-4a52-95b1-aa964ba85ec5',
  '59a27968-3e3d-4bc0-9635-74d9235e1463',
  g.id,
  'active',
  'a41339f3-d0b1-4a52-95b1-aa964ba85ec5'
from public.operational_groups g
where g.campaign_id = '59a27968-3e3d-4bc0-9635-74d9235e1463'
  and g.name = 'Gruppo test LAN driver'
  and exists (
    select 1 from public.operator_profiles op
    where op.user_id = 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5'
  )
  and exists (
    select 1 from public.profiles p
    where p.id = 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5'
  )
  and not exists (
    select 1 from public.operator_assignments a
    where a.operator_id = 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5'
      and a.campaign_id = '59a27968-3e3d-4bc0-9635-74d9235e1463'
      and a.status = 'active'
      and a.revoked_at is null
  );

update public.campaigns
set status = 'in_progress'
where id = '59a27968-3e3d-4bc0-9635-74d9235e1463'
  and status = 'draft';
