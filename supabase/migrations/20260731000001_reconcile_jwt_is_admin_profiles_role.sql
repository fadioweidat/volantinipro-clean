-- ============================================================
-- CAUSA (diagnosticata dal vivo su produzione, 2026-07-31):
--
-- AdminGuard (src/auth/guards/AdminGuard.jsx -> session.js:
-- verifySupabaseAdminRole) autorizza /admin chiamando l'RPC
-- public.jwt_is_admin(), che verifica ESCLUSIVAMENTE i claim JWT
-- auth.jwt()->>'role' e auth.jwt()->>'app_role'.
--
-- Questo progetto non ha alcun Custom Access Token Hook configurato
-- (nessuna funzione custom_access_token_hook in pg_proc, verificato) e
-- auth.users.raw_app_meta_data non contiene mai una chiave role/app_role
-- (verificato per l'utente a41339f3-d0b1-4a52-95b1-aa964ba85ec5 /
-- fenice.sp@gmail.com: contiene solo provider/providers di default).
-- Quindi jwt_is_admin() e' strutturalmente sempre false per qualunque
-- utente reale, a prescindere dal ruolo assegnato.
--
-- public.gps_is_admin() (usata dalle RPC GPS, es. /admin/live) verifica
-- invece correttamente public.profiles.role = 'admin', ed e' gia' vero
-- per questo utente (role='admin' impostato il 2026-07-04, prima di
-- questa migration). Confermato in produzione via simulazione JWT:
--   gps_is_admin() = true, jwt_is_admin() = false, stesso auth.uid().
--
-- FIX MINIMO: allineare jwt_is_admin() alla stessa fonte di verita' di
-- gps_is_admin() (public.profiles.role), in aggiunta ai controlli JWT
-- gia' esistenti (nessuna rimozione: un futuro Custom Access Token Hook
-- continuerebbe a funzionare invariato). Nessuna modifica a gps_is_admin,
-- routing, magic link, GPS tracking, AI, Step 1-4 o design.
-- ============================================================

create or replace function public.jwt_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.role() = 'service_role', false)
    or coalesce(auth.jwt() ->> 'role', '') in ('admin', 'super_admin')
    or coalesce(auth.jwt() ->> 'app_role', '') in ('admin', 'super_admin')
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role = 'admin'
    );
$$;

-- Assegnazione idempotente e scoped esclusivamente all'utente indicato dal
-- ticket, verificata anche via email su auth.users come difesa aggiuntiva
-- contro un UID errato. Gia' vero in produzione (role='admin' dal
-- 2026-07-04): questo update e' un no-op operativo, tracciato qui invece
-- che come modifica nascosta solo da Dashboard, per idempotenza e
-- riproducibilita' su un database ripristinato da zero.
update public.profiles
set role = 'admin', updated_at = now()
where id = 'a41339f3-d0b1-4a52-95b1-aa964ba85ec5'
  and role <> 'admin'
  and exists (
    select 1 from auth.users u
    where u.id = profiles.id
      and u.email = 'fenice.sp@gmail.com'
  );
