alter table public.campagne add column if not exists
  stato_pagamento text default 'in_attesa'
  check (stato_pagamento in ('in_attesa','pagato','annullato'));

alter table public.campagne add column if not exists
  pagamento_tipo text default 'bonifico';

alter table public.campagne add column if not exists
  pagamento_confermato_at timestamptz;

alter table public.campagne add column if not exists
  causale_bonifico text;

create or replace function public.genera_causale()
returns trigger as $$
begin
  if new.causale_bonifico is null then
    new.causale_bonifico := 'VP-' ||
      to_char(now(), 'YYYYMMDD') || '-' ||
      upper(substring(new.id::text, 1, 6));
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_causale on public.campagne;

create trigger set_causale
  before insert on public.campagne
  for each row execute function public.genera_causale();
