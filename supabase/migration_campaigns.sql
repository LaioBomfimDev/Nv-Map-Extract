-- ============================================================================
-- Friendly Miner — Migracao de Campanhas
-- Rode este arquivo no SQL Editor do Supabase se o schema principal ja existe.
-- ============================================================================

create extension if not exists pgcrypto;

create table if not exists public.campaign_templates (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  channel    text not null default 'whatsapp',
  body       text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  template_id  uuid references public.campaign_templates(id) on delete set null,
  name         text not null,
  message_body text not null,
  filters      jsonb not null default '{}'::jsonb,
  total_leads  int not null default 0,
  status       text not null default 'active',
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create table if not exists public.campaign_leads (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  result_id       uuid not null references public.results(id) on delete cascade,
  status          text not null default 'pending',
  sent_at         timestamptz,
  followup_due_at timestamptz,
  responded_at    timestamptz,
  closed_at       timestamptz,
  discarded_at    timestamptz,
  notes           text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (campaign_id, result_id)
);

create index if not exists idx_campaign_templates_user on public.campaign_templates (user_id, created_at desc);
create index if not exists idx_campaigns_user          on public.campaigns (user_id, created_at desc);
create index if not exists idx_campaign_leads_campaign on public.campaign_leads (campaign_id, status, created_at);
create index if not exists idx_campaign_leads_user     on public.campaign_leads (user_id, status);
create index if not exists idx_campaign_leads_due      on public.campaign_leads (user_id, followup_due_at);

alter table public.campaign_templates enable row level security;
alter table public.campaigns          enable row level security;
alter table public.campaign_leads     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['campaign_templates','campaigns','campaign_leads'] loop
    execute format('drop policy if exists "own_select" on public.%I', t);
    execute format('drop policy if exists "own_insert" on public.%I', t);
    execute format('drop policy if exists "own_update" on public.%I', t);
    execute format('drop policy if exists "own_delete" on public.%I', t);
    execute format('create policy "own_select" on public.%I for select using (auth.uid() = user_id)', t);
    execute format('create policy "own_insert" on public.%I for insert with check (auth.uid() = user_id)', t);
    execute format('create policy "own_update" on public.%I for update using (auth.uid() = user_id)', t);
    execute format('create policy "own_delete" on public.%I for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;

create or replace function public.campaign_overview()
returns json language sql security invoker stable as $$
  with stats as (
    select
      campaign_id,
      count(*)::int as total,
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'sent')::int as sent,
      count(*) filter (where status = 'responded')::int as responded,
      count(*) filter (where status = 'won')::int as won,
      count(*) filter (where status = 'lost')::int as lost,
      count(*) filter (
        where status = 'sent'
          and followup_due_at is not null
          and followup_due_at <= now()
      )::int as due_followups
    from public.campaign_leads
    where user_id = auth.uid()
    group by campaign_id
  )
  select coalesce(json_agg(json_build_object(
    'id', c.id,
    'name', c.name,
    'template_id', c.template_id,
    'message_body', c.message_body,
    'filters', c.filters,
    'status', c.status,
    'created_at', c.created_at,
    'updated_at', c.updated_at,
    'total_leads', coalesce(s.total, c.total_leads, 0),
    'pending', coalesce(s.pending, 0),
    'sent', coalesce(s.sent, 0),
    'responded', coalesce(s.responded, 0),
    'won', coalesce(s.won, 0),
    'lost', coalesce(s.lost, 0),
    'due_followups', coalesce(s.due_followups, 0)
  ) order by c.created_at desc), '[]'::json)
  from public.campaigns c
  left join stats s on s.campaign_id = c.id
  where c.user_id = auth.uid();
$$;

grant select, insert, update, delete on public.campaign_templates to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_leads to authenticated;
grant execute on function public.campaign_overview() to authenticated;
