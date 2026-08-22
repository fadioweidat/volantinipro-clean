-- FASE B: cache dei riassunti AI del report territoriale avanzato.
-- Ogni riga e la sintesi generata (e gia verificata numericamente lato Edge
-- Function) per un payload dati specifico di un utente; l'hash del payload
-- funge da chiave di deduplica per evitare chiamate ripetute al modello.

begin;

create table if not exists public.ai_territory_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  payload_hash text not null,
  summary text not null,
  score_explanation text,
  created_at timestamptz not null default now()
);

create unique index if not exists ai_territory_summaries_user_payload_key
  on public.ai_territory_summaries (user_id, payload_hash);

alter table public.ai_territory_summaries enable row level security;

drop policy if exists ai_territory_summaries_own_select on public.ai_territory_summaries;
create policy ai_territory_summaries_own_select
  on public.ai_territory_summaries
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists ai_territory_summaries_own_insert on public.ai_territory_summaries;
create policy ai_territory_summaries_own_insert
  on public.ai_territory_summaries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Nessuna policy di update/delete: la cache e append-only, coerente con il
-- fatto che un payload identico produce sempre lo stesso riassunto verificato.

commit;
