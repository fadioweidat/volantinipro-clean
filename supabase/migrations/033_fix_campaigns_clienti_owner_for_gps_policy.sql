begin;

-- GPS-PROD: make campaign ownership checks reachable on the production model.
--
-- Production ownership is:
-- public.campaigns.customer_id -> public.clienti.id -> public.clienti.user_id -> auth.users.id
--
-- This migration intentionally uses only the production ownership tables.

grant select on table public.campaigns to authenticated;
grant select on table public.clienti to authenticated;

create or replace function public.current_user_owns_campaign(p_campaign_id uuid)
returns boolean
language plpgsql
stable
as $$
declare
  ok boolean := false;
begin
  select exists (
    select 1
    from public.campaigns ca
    join public.clienti c
      on c.id = ca.customer_id
    where ca.id = p_campaign_id
      and c.user_id = auth.uid()
  ) into ok;

  return coalesce(ok, false);
end;
$$;

commit;
