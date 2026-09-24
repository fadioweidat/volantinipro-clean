-- BUG CRITICO — "LINK PER OPERATORE" DRIVER NON FUNZIONA.
--
-- ROOT CAUSE (confermato in produzione, sola lettura): l'assignment
-- 58bb64af-... e' active, campaign_id/group_id validi, group_access_link_id
-- NULL (quindi assignment "originaria", non un participant creato da
-- driver_group_join) — ma per (campaign_id, group_id) = (dc5a5357-...,
-- cbbed7ba-...) non esiste NESSUNA riga in driver_group_access_links.
-- admin_create_group_access_link() e' ADMIN ONLY; il Driver non ha alcuna
-- via per ottenere/creare il group token del proprio gruppo. Il pulsante
-- "Link per operatore" (da introdurre lato UI) non poteva quindi produrre
-- un /driver/group/:token valido.
--
-- FIX: una RPC Driver-specific, autorizzata SOLO tramite l'assignment
-- personale validato (id + access_token, mai campaign/group passati dal
-- client). campaign_id e group_id vengono derivati dalla riga stessa. Solo
-- l'assignment "originaria" (group_access_link_id IS NULL, cioe' NON un
-- participant OP creato da driver_group_join) puo' chiamarla: un OP non
-- eredita mai il diritto di creare/rigenerare il link del proprio gruppo.
--
-- TOKEN: driver_group_access_links salva solo token_hash (sha256), quindi un
-- token gia' creato con gen_random_bytes non e' MAI ricostruibile — questa
-- migrazione non tenta di "indovinarlo". Per i link creati da QUESTA RPC il
-- token e' invece DERIVATO deterministicamente da un segreto per-riga
-- (driver_secret, colonna additiva, mai esposta via PostgREST — la tabella
-- resta RLS admin-only) con HMAC-SHA256(link_id, driver_secret): lo stesso
-- link puo' quindi essere ri-ottenuto in modo identico ad ogni apertura
-- della schermata Driver, senza rigenerare/revocare nulla (nessuna
-- invalidazione di link gia' condivisi). driver_group_join non cambia: la
-- verifica resta lo stesso confronto sha256(token) = token_hash di sempre.
--
-- Se in futuro esistesse gia' un link ATTIVO per quel gruppo creato dal
-- percorso Admin storico (token puramente random, driver_secret NULL), la
-- RPC lo rileva e NON lo tocca (nessuna rigenerazione/revoca automatica di
-- un link potenzialmente gia' condiviso) — restituisce solo che esiste,
-- senza il token, rimandando all'Admin.
--
-- NON TOCCA: DriverAssignmentPage auth/access flow, personal access_token,
-- GPS, delivery_sessions, messaggi, tracking, admin_create_group_access_link,
-- admin_revoke_group_access_link, admin_get_group_access_link,
-- driver_group_join (stessa firma e stesso corpo verificato invariati).

begin;

alter table public.driver_group_access_links
  add column if not exists driver_secret text;

create or replace function public.driver_get_or_create_group_access_link(
  p_assignment_id uuid,
  p_access_token text
) returns jsonb
  language plpgsql security definer set search_path to ''
as $$
declare
  v_assignment public.operator_assignments%rowtype;
  v_link public.driver_group_access_links%rowtype;
  v_token text;
  v_secret text;
  v_link_id uuid;
begin
  if p_assignment_id is null or p_access_token is null or length(btrim(p_access_token)) = 0 then
    raise exception 'PARAMETRI_MANCANTI' using errcode = '22023';
  end if;

  select * into v_assignment
  from public.operator_assignments
  where id = p_assignment_id and access_token = p_access_token
  for update;

  if not found then
    raise exception 'ASSEGNAZIONE_NON_AUTORIZZATA' using errcode = '42501';
  end if;
  if v_assignment.status <> 'active' or v_assignment.revoked_at is not null then
    raise exception 'ASSEGNAZIONE_NON_ATTIVA' using errcode = '42501';
  end if;
  if v_assignment.starts_at is not null and v_assignment.starts_at > now() then
    raise exception 'ASSEGNAZIONE_NON_ATTIVA' using errcode = '42501';
  end if;
  if v_assignment.ends_at is not null and v_assignment.ends_at <= now() then
    raise exception 'ASSEGNAZIONE_NON_ATTIVA' using errcode = '42501';
  end if;
  -- Distinzione caposquadra/originaria vs. participant OP: un participant
  -- creato da driver_group_join ha SEMPRE group_access_link_id valorizzato.
  -- Non puo' mai amministrare/rigenerare il link del proprio gruppo.
  if v_assignment.group_access_link_id is not null then
    raise exception 'PARTECIPANTE_NON_AUTORIZZATO' using errcode = '42501';
  end if;
  if v_assignment.group_id is null then
    raise exception 'GRUPPO_NON_DISPONIBILE' using errcode = '22023';
  end if;

  -- campaign_id/group_id derivati dalla riga validata, MAI da input client.
  select * into v_link
  from public.driver_group_access_links
  where campaign_id = v_assignment.campaign_id
    and group_id = v_assignment.group_id
    and status = 'active'
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_link.driver_secret is not null then
      v_token := encode(extensions.hmac(v_link.id::text, v_link.driver_secret, 'sha256'), 'hex');
      return jsonb_build_object(
        'token', v_token, 'link_id', v_link.id, 'created', false, 'recoverable', true,
        'campaign_id', v_link.campaign_id, 'group_id', v_link.group_id
      );
    end if;
    -- Link attivo preesistente (percorso Admin storico, token random non
    -- derivabile): mai rigenerato/revocato automaticamente da qui.
    return jsonb_build_object(
      'token', null, 'link_id', v_link.id, 'created', false, 'recoverable', false,
      'campaign_id', v_link.campaign_id, 'group_id', v_link.group_id
    );
  end if;

  -- Nessun link attivo per questo gruppo: lo crea il caposquadra stesso.
  -- Id pre-generato per poter derivare token e token_hash PRIMA dell'insert
  -- (nessuno stato intermedio con un token_hash non definitivo).
  v_link_id := gen_random_uuid();
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  v_token := encode(extensions.hmac(v_link_id::text, v_secret, 'sha256'), 'hex');

  insert into public.driver_group_access_links (
    id, campaign_id, group_id, token_hash, driver_secret, created_by, metadata
  ) values (
    v_link_id, v_assignment.campaign_id, v_assignment.group_id,
    encode(extensions.digest(v_token, 'sha256'), 'hex'),
    v_secret, null,
    jsonb_build_object('source', 'driver_self_service', 'created_by_assignment', v_assignment.id)
  ) returning * into v_link;

  insert into public.gps_operator_audit_log (operator_id, action, campaign_id, assignment_id, context)
  values (
    coalesce(v_assignment.operator_id, v_assignment.id), 'driver_group_link_created',
    v_assignment.campaign_id, v_assignment.id,
    jsonb_build_object('group_access_link_id', v_link.id)
  );

  return jsonb_build_object(
    'token', v_token, 'link_id', v_link.id, 'created', true, 'recoverable', true,
    'campaign_id', v_assignment.campaign_id, 'group_id', v_assignment.group_id
  );
end;
$$;
alter function public.driver_get_or_create_group_access_link(uuid, text) owner to postgres;
revoke all on function public.driver_get_or_create_group_access_link(uuid, text) from public;
-- Stesso pattern di grant di driver_group_join: link Driver pubblico, nessun
-- login richiesto, autorizzazione tramite assignment_id + access_token.
grant execute on function public.driver_get_or_create_group_access_link(uuid, text) to anon, authenticated;

commit;
