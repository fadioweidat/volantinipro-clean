-- P0-A fix: campagne pubbliche create da un visitatore anonimo (Step1-4)
-- nascono con campaigns.user_id = NULL, perche' submit-campaign-request non
-- crea mai un account e non c'e' alcun meccanismo che le colleghi in seguito
-- a un utente autenticato. Risultato: invisibili per sempre nella Dashboard
-- Cliente (useCampagne.js filtra su .eq('user_id', auth.uid())).
--
-- Questa RPC permette al cliente di "reclamare" UNA campagna specifica (non
-- un claim globale per email, esplicitamente vietato dal ticket) quando
-- successivamente crea un account o effettua login. Sicurezza:
--   - richiede una sessione autenticata reale (auth.uid())
--   - richiede email verificata (auth.users.email_confirmed_at is not null)
--   - la campagna deve essere ancora non posseduta (user_id is null)
--   - l'email verificata dell'utente deve combaciare esattamente (case
--     insensitive) con campaigns.client_email della campagna specifica
--   - operazione atomica in un singolo UPDATE ... WHERE, quindi due claim
--     concorrenti sulla stessa riga non possono mai "vincere" entrambi
create or replace function public.claim_public_campaign(p_campaign_id uuid)
returns public.campaigns
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_row public.campaigns;
begin
  if v_uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select email into v_email
  from auth.users
  where id = v_uid
    and email_confirmed_at is not null;

  if v_email is null then
    raise exception 'EMAIL_NOT_VERIFIED' using errcode = '28000';
  end if;

  update public.campaigns
  set user_id = v_uid,
      updated_at = now()
  where id = p_campaign_id
    and user_id is null
    and client_email is not null
    and lower(client_email) = lower(v_email)
  returning * into v_row;

  if v_row.id is null then
    raise exception 'CLAIM_NOT_ALLOWED' using errcode = '42501';
  end if;

  return v_row;
end;
$$;

-- Il progetto concede EXECUTE su ogni nuova funzione in public a
-- anon/authenticated/service_role via default privileges: la funzione e'
-- comunque sicura per anon (v_uid is null -> AUTH_REQUIRED), ma revochiamo
-- esplicitamente per minimo privilegio, coerente col resto delle RPC cliente.
revoke all on function public.claim_public_campaign(uuid) from public;
revoke execute on function public.claim_public_campaign(uuid) from anon;
grant execute on function public.claim_public_campaign(uuid) to authenticated;
