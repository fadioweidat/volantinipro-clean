-- GPS — parita' grant per le RPC _v2 (hotfix, GIA' APPLICATO in produzione).
--
-- Questo file rende il repository coerente con lo stato di produzione.
--
-- PERCHE'
-- La migrazione 20260829140000 (_v2 device-aware) ha concesso EXECUTE solo a
-- `authenticated`. Ma il Driver da link personale pubblico (?access=token,
-- non loggato) esegue le RPC come ruolo `anon` — esattamente come per le RPC
-- v1 (gps_insert_point, gps_transition_session, get_active_driver_session,
-- gps_start_session, ... tutte grant-ate ad anon). Senza il grant ad anon le
-- _v2 rispondevano `permission denied for function` (errcode 42501), che il
-- fallback frontend non intercettava -> punto GPS scartato, pause/resume/stop
-- falliti per i driver token-mode.
--
-- COSA FA
-- Concede EXECUTE ad `anon` (oltre ad `authenticated`, gia' presente) per:
--   gps_insert_point_v2, gps_transition_session_v2,
--   get_active_driver_session_v2, get_driver_group_tracking
-- L'autorizzazione REALE resta dentro le RPC (token/auth/assignment/device):
-- il grant abilita solo la chiamata, non bypassa nulla.
--
-- Nessun cambio di logica. Nessun DROP. Idempotente (grant su grant e' no-op).

begin;

grant execute on function public.gps_insert_point_v2(
  uuid, double precision, double precision, double precision, double precision,
  double precision, timestamptz, text, text
) to anon;

grant execute on function public.gps_transition_session_v2(uuid, text, text, text) to anon;

grant execute on function public.get_active_driver_session_v2(uuid, text, text) to anon;

grant execute on function public.get_driver_group_tracking(uuid, text) to anon;

commit;
