-- ============================================================================
-- Friendly Miner — Schema Supabase (Postgres)
-- Rode este arquivo INTEIRO no SQL Editor do Supabase (uma vez).
-- Cria tabelas, RLS (cada gmail só vê os próprios leads) e funções que
-- replicam a lógica do backend antigo (dedup/merge, métricas, prospecção).
-- ============================================================================

-- ── Extensões ───────────────────────────────────────────────────────────────
create extension if not exists pgcrypto;  -- gen_random_uuid()

-- ── Tabelas ─────────────────────────────────────────────────────────────────
create table if not exists public.searches (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  filename      text,
  keyword       text,
  city          text,
  total_results int  default 0,
  status        text default 'completed',
  source        text default 'extension',
  input_count   int not null default 0,
  inserted_count int not null default 0,
  merged_count  int not null default 0,
  skipped_count int not null default 0,
  ignored_count int not null default 0,
  rejected_count int not null default 0,
  completed_at  timestamptz,
  error_message text,
  idempotency_key text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz default now()
);

create table if not exists public.results (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  search_id      uuid references public.searches(id) on delete set null,
  name           text,
  address        text,
  phone          text,
  website        text,
  category       text,
  rating         real default 0,
  reviews_count  int  default 0,
  latitude       real,
  longitude      real,
  place_id       text,
  cid            text,
  email          text,
  instagram      text,
  facebook       text,
  linkedin       text,
  twitter        text,
  youtube        text,
  prospect_status text default 'novo',
  notes          text,
  last_contact_at timestamptz,
  created_at     timestamptz default now()
);

create table if not exists public.ignored_leads (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  place_id   text,
  phone      text,
  name       text,
  address    text,
  created_at timestamptz default now()
);

create table if not exists public.user_prefs (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

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
  idempotency_key text,
  metadata     jsonb not null default '{}'::jsonb,
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

-- Cada busca e uma execucao de importacao; um lead canonico pode aparecer em
-- varias delas sem que sua origem anterior seja perdida.
create table if not exists public.search_results (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  search_id       uuid not null references public.searches(id) on delete cascade,
  result_id       uuid not null references public.results(id) on delete cascade,
  disposition     text not null default 'inserted'
                  check (disposition in ('inserted','merged','skipped','existing')),
  source_snapshot jsonb not null default '{}'::jsonb,
  observed_at     timestamptz not null default now(),
  unique (search_id, result_id)
);

create table if not exists public.lead_activities (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  result_id        uuid not null references public.results(id) on delete cascade,
  campaign_id      uuid references public.campaigns(id) on delete set null,
  campaign_lead_id uuid references public.campaign_leads(id) on delete set null,
  type             text not null default 'note',
  summary          text not null default '',
  channel          text,
  from_status      text,
  to_status        text,
  metadata         jsonb not null default '{}'::jsonb,
  idempotency_key  text,
  occurred_at      timestamptz not null default now(),
  created_at       timestamptz not null default now()
);

create table if not exists public.lead_tasks (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  result_id    uuid not null references public.results(id) on delete cascade,
  title        text not null,
  description  text not null default '',
  status       text not null default 'pending' check (status in ('pending','completed','cancelled')),
  priority     text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at       timestamptz,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.mining_jobs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_job_id    text not null,
  search_id        uuid references public.searches(id) on delete set null,
  keyword          text,
  city             text,
  source           text not null default 'extension',
  status           text not null default 'queued'
                   check (status in ('queued','running','completed','failed','cancelled')),
  captured_count   int not null default 0,
  enriched_count   int not null default 0,
  inserted_count   int not null default 0,
  merged_count     int not null default 0,
  ignored_count    int not null default 0,
  error_code       text,
  error_message    text,
  metadata         jsonb not null default '{}'::jsonb,
  started_at       timestamptz,
  completed_at     timestamptz,
  heartbeat_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, client_job_id)
);

alter table public.searches alter column source set default 'extension';

-- ── Índices ─────────────────────────────────────────────────────────────────
create index if not exists idx_results_user      on public.results (user_id);
create index if not exists idx_results_search     on public.results (search_id);
create index if not exists idx_results_status     on public.results (user_id, prospect_status);
create index if not exists idx_searches_user      on public.searches (user_id, created_at desc);
create index if not exists idx_ignored_user       on public.ignored_leads (user_id);
create index if not exists idx_user_prefs_user    on public.user_prefs (user_id);
create index if not exists idx_campaign_templates_user on public.campaign_templates (user_id, created_at desc);
create index if not exists idx_campaigns_user          on public.campaigns (user_id, created_at desc);
create index if not exists idx_campaign_leads_campaign on public.campaign_leads (campaign_id, status, created_at);
create index if not exists idx_campaign_leads_user     on public.campaign_leads (user_id, status);
create index if not exists idx_campaign_leads_due      on public.campaign_leads (user_id, followup_due_at);
create index if not exists idx_search_results_user_search on public.search_results (user_id, search_id, observed_at desc);
create index if not exists idx_search_results_result on public.search_results (result_id, observed_at desc);
create unique index if not exists uq_searches_user_idempotency on public.searches (user_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';
create unique index if not exists uq_campaigns_user_idempotency on public.campaigns (user_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';
create index if not exists idx_lead_activities_result on public.lead_activities (user_id, result_id, occurred_at desc);
create unique index if not exists uq_lead_activities_user_idempotency on public.lead_activities (user_id, idempotency_key)
  where idempotency_key is not null and idempotency_key <> '';
create index if not exists idx_lead_tasks_due on public.lead_tasks (user_id, status, due_at);
create index if not exists idx_lead_tasks_result on public.lead_tasks (user_id, result_id, created_at desc);
create index if not exists idx_mining_jobs_user_created on public.mining_jobs (user_id, created_at desc);
create index if not exists idx_mining_jobs_active on public.mining_jobs (user_id, status, heartbeat_at desc);
-- Dedupe por lugar (por usuário), ignorando place_id vazio
create unique index if not exists uq_results_user_place
  on public.results (user_id, place_id)
  where place_id is not null and place_id <> '';

-- ── RLS: cada usuário só enxerga o que é seu ────────────────────────────────
alter table public.searches      enable row level security;
alter table public.results       enable row level security;
alter table public.ignored_leads enable row level security;
alter table public.user_prefs    enable row level security;
alter table public.campaign_templates enable row level security;
alter table public.campaigns          enable row level security;
alter table public.campaign_leads     enable row level security;
alter table public.search_results     enable row level security;
alter table public.lead_activities    enable row level security;
alter table public.lead_tasks         enable row level security;
alter table public.mining_jobs        enable row level security;

do $$
declare t text;
begin
  foreach t in array array['searches','results','ignored_leads','user_prefs','campaign_templates','campaigns','campaign_leads','search_results','lead_activities','lead_tasks','mining_jobs'] loop
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

-- ============================================================================
-- FUNÇÃO: import_leads  (chamada pela extensão via /rpc/import_leads)
-- Recebe o lote de leads do Google Maps + keyword/city, cria a busca,
-- deduplica/mescla (por telefone, ou nome+endereço) e ignora os apagados.
-- Roda como SECURITY INVOKER => auth.uid() = usuário do token; RLS aplica.
-- ============================================================================
create or replace function public.import_leads(
  p_keyword text,
  p_city    text,
  p_leads   jsonb
) returns json
language plpgsql
security invoker
as $$
declare
  v_uid       uuid := auth.uid();
  v_search_id uuid;
  v_lead      jsonb;
  v_name text; v_phone text; v_addr text; v_site text; v_email text;
  v_place text; v_cid text; v_cat text;
  v_raw text;
  v_rating real; v_reviews int; v_lat real; v_lng real;
  v_ig text; v_fb text; v_in text; v_tw text; v_yt text;
  v_existing public.results%rowtype;
  v_inserted int := 0; v_merged int := 0; v_ignored int := 0;
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  insert into public.searches (user_id, filename, keyword, city, total_results, status, source)
  values (v_uid,
          coalesce(nullif(p_keyword,''),'maps') || ' ' || coalesce(p_city,''),
          nullif(p_keyword,''), nullif(p_city,''), 0, 'completed', 'extension')
  returning id into v_search_id;

  for v_lead in select * from jsonb_array_elements(coalesce(p_leads,'[]'::jsonb))
  loop
    v_name  := coalesce(v_lead->>'name','');
    if v_name = '' then continue; end if;
    v_phone := coalesce(v_lead->>'phone','');
    v_addr  := coalesce(v_lead->>'address','');
    v_site  := coalesce(v_lead->>'website','');
    v_email := coalesce(v_lead->>'email','');
    v_place := coalesce(v_lead->>'placeID', v_lead->>'place_id','');
    v_cid   := coalesce(v_lead->>'cID', v_lead->>'cid','');
    v_cat   := coalesce(v_lead->>'category','');

    v_raw := replace(trim(coalesce(nullif(v_lead->>'averageRating',''), nullif(v_lead->>'rating',''), '')), ',', '.');
    v_rating := case when v_raw ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then v_raw::real else 0 end;

    v_raw := regexp_replace(coalesce(nullif(v_lead->>'reviewCount',''), nullif(v_lead->>'reviews_count',''), ''), '[^0-9]', '', 'g');
    v_reviews := coalesce(nullif(v_raw, '')::int, 0);

    v_raw := replace(trim(coalesce(nullif(v_lead->>'latitude',''), '')), ',', '.');
    v_lat := case when v_raw ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then nullif(v_raw::real, 0) else null end;

    v_raw := replace(trim(coalesce(nullif(v_lead->>'longitude',''), '')), ',', '.');
    v_lng := case when v_raw ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then nullif(v_raw::real, 0) else null end;
    v_ig := coalesce(v_lead->>'instagram',''); v_fb := coalesce(v_lead->>'facebook','');
    v_in := coalesce(v_lead->>'linkedin',''); v_tw := coalesce(v_lead->>'twitter','');
    v_yt := coalesce(v_lead->>'youtube','');

    -- Apagado antes pelo usuário? não reimporta
    if exists (
      select 1 from public.ignored_leads il
      where il.user_id = v_uid and (
        (v_place <> '' and il.place_id = v_place) or
        (v_phone <> '' and il.phone = v_phone) or
        (v_name  <> '' and il.name = v_name and il.address = v_addr)
      )
    ) then
      v_ignored := v_ignored + 1;
      continue;
    end if;

    -- Duplicado? por place_id (chave do Google), senão telefone, senão nome+endereço.
    -- Incluir place_id evita violar o índice único uq_results_user_place.
    select * into v_existing from public.results r
    where r.user_id = v_uid and (
      (v_place <> '' and r.place_id = v_place) or
      (length(v_phone) > 3 and r.phone = v_phone) or
      (length(v_phone) <= 3 and r.name = v_name and r.address = v_addr)
    ) limit 1;

    if found then
      update public.results set
        search_id = v_search_id,
        name = v_name, address = v_addr,
        phone   = coalesce(nullif(phone,''), v_phone),
        website = coalesce(nullif(website,''), v_site),
        email   = coalesce(nullif(email,''), v_email),
        category= coalesce(nullif(category,''), v_cat),
        place_id= coalesce(nullif(place_id,''), v_place),
        cid     = coalesce(nullif(cid,''), v_cid),
        instagram = coalesce(nullif(instagram,''), v_ig),
        facebook  = coalesce(nullif(facebook,''), v_fb),
        linkedin  = coalesce(nullif(linkedin,''), v_in),
        twitter   = coalesce(nullif(twitter,''), v_tw),
        youtube   = coalesce(nullif(youtube,''), v_yt),
        rating    = case when v_rating > 0 then v_rating else rating end,
        reviews_count = case when v_reviews > 0 then v_reviews else reviews_count end,
        latitude  = case when v_lat is not null then v_lat else latitude end,
        longitude = case when v_lng is not null then v_lng else longitude end
      where id = v_existing.id;
      v_merged := v_merged + 1;
    else
      insert into public.results
        (user_id, search_id, name, address, phone, website, category, rating, reviews_count,
         latitude, longitude, place_id, cid, email, instagram, facebook, linkedin, twitter, youtube)
      values
        (v_uid, v_search_id, v_name, v_addr, v_phone, v_site, v_cat, v_rating, v_reviews,
         v_lat, v_lng, v_place, v_cid, v_email, v_ig, v_fb, v_in, v_tw, v_yt);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  update public.searches
     set total_results = (select count(*) from public.results where search_id = v_search_id)
   where id = v_search_id;

  return json_build_object('search_id', v_search_id,
    'inserted', v_inserted, 'merged', v_merged, 'ignored', v_ignored);
end $$;

-- ============================================================================
-- FUNÇÃO: delete_results — apaga leads, registra em ignored_leads
-- (pra não voltarem) e recalcula os totais das buscas afetadas.
-- ============================================================================
create or replace function public.delete_results(p_ids uuid[])
returns int
language plpgsql
security invoker
as $$
declare v_uid uuid := auth.uid(); v_deleted int;
begin
  insert into public.ignored_leads (user_id, place_id, phone, name, address)
  select user_id, coalesce(place_id,''), coalesce(phone,''), coalesce(name,''), coalesce(address,'')
  from public.results where id = any(p_ids) and user_id = v_uid;

  with del as (
    delete from public.results where id = any(p_ids) and user_id = v_uid returning search_id
  )
  select count(*) into v_deleted from del;

  update public.searches s
     set total_results = (select count(*) from public.results r where r.search_id = s.id)
   where s.user_id = v_uid;

  return coalesce(v_deleted,0);
end $$;

-- ============================================================================
-- FUNÇÕES DE LEITURA (dashboard/prospecção) — devolvem JSON no mesmo formato
-- que o frontend já consome. Chamadas via supabase.rpc(...).
-- ============================================================================
create or replace function public.dashboard_metrics()
returns json language sql security invoker stable as $$
  select json_build_object(
    'totalSearches', (select count(*)::int from public.searches where user_id = auth.uid()),
    'totalResults',  (select count(*)::int from public.results  where user_id = auth.uid()),
    'avgRating', coalesce((select round(avg(rating)::numeric,1)::float
                           from public.results where user_id = auth.uid() and rating > 0), 0),
    'topCategories', coalesce((select json_agg(t) from (
        select category, count(*)::int as count from public.results
        where user_id = auth.uid() and coalesce(category,'') <> ''
        group by category order by count desc limit 10) t), '[]'::json),
    'recentSearches', coalesce((select json_agg(s) from (
        select * from public.searches where user_id = auth.uid()
        order by created_at desc limit 5) s), '[]'::json)
  );
$$;

create or replace function public.dashboard_charts()
returns json language sql security invoker stable as $$
  select json_build_object(
    'resultsByDate', coalesce((select json_agg(x) from (
        select date, count from (
          select to_char(created_at at time zone 'America/Sao_Paulo','DD/MM/YYYY') as date,
                 count(*)::int as count, min(created_at) as mc
          from public.results where user_id = auth.uid()
          group by 1 order by mc desc limit 7
        ) d order by mc asc) x), '[]'::json),
    'searches', coalesce((select json_agg(s) from (
        select * from public.searches where user_id = auth.uid()
        order by created_at desc) s), '[]'::json)
  );
$$;

create or replace function public.prospect_summary()
returns json language sql security invoker stable as $$
  with fu as (
    select * from public.results
    where user_id = auth.uid() and prospect_status = 'enviado'
      and last_contact_at is not null and last_contact_at <= now() - interval '3 day'
  ),
  ss as (  -- têm telefone, sem site
    select * from public.results
    where user_id = auth.uid() and prospect_status = 'novo'
      and coalesce(phone,'') <> '' and coalesce(website,'') = ''
  ),
  sn as (  -- têm telefone, sem redes
    select * from public.results
    where user_id = auth.uid() and prospect_status = 'novo'
      and coalesce(phone,'') <> ''
      and coalesce(instagram,'')='' and coalesce(facebook,'')='' and coalesce(linkedin,'')=''
      and coalesce(twitter,'')='' and coalesce(youtube,'')=''
  ),
  dt as (
    select t.*,
      json_build_object('id',r.id,'name',r.name,'phone',r.phone,
        'category',r.category,'prospect_status',r.prospect_status) as lead
    from public.lead_tasks t
    join public.results r on r.id = t.result_id and r.user_id = t.user_id
    where t.user_id = auth.uid() and t.status = 'pending'
      and t.due_at is not null and t.due_at <= now()
  )
  select json_build_object(
    'statusCounts', coalesce((select json_object_agg(coalesce(prospect_status,'novo'), c) from (
        select prospect_status, count(*)::int c from public.results
        where user_id = auth.uid() group by prospect_status) g), '{}'::json),
    'followUps', json_build_object(
        'count', (select count(*)::int from fu),
        'sample', coalesce((select json_agg(t) from (select * from fu order by last_contact_at asc limit 5) t), '[]'::json)),
    'dueTasks', json_build_object(
        'count', (select count(*)::int from dt),
        'sample', coalesce((select json_agg(t) from (select * from dt order by due_at asc limit 5) t), '[]'::json)),
    'suggestions', json_build_array(
        json_build_object(
          'type','sem_site','title','Têm telefone mas não têm site',
          'hint','Ótimos alvos para oferecer criação de site',
          'filters', json_build_object('prospect_status','novo','has_phone','1','has_website','0'),
          'count', (select count(*)::int from ss),
          'sample', coalesce((select json_agg(t) from (select * from ss order by reviews_count desc limit 5) t), '[]'::json)),
        json_build_object(
          'type','sem_social','title','Têm telefone mas não têm redes sociais',
          'hint','Oportunidade para gestão de redes/marketing',
          'filters', json_build_object('prospect_status','novo','has_phone','1','no_social','1'),
          'count', (select count(*)::int from sn),
          'sample', coalesce((select json_agg(t) from (select * from sn order by reviews_count desc limit 5) t), '[]'::json))
    )
  );
$$;

-- ============================================================================
-- FUNÇÃO: delete_search_smart — apaga a busca INTEIRA do histórico.
-- Os leads que você já trabalhou (status != 'novo', ou seja, já mandou pra
-- prospecção) são MANTIDOS (desvinculados da busca). O resto (lixo ainda em
-- 'novo') é apagado. Assim a busca some do histórico sem deixar "fantasma".
-- ============================================================================
create or replace function public.delete_search_smart(p_search_id uuid)
returns json language plpgsql security invoker as $$
declare v_uid uuid := auth.uid(); v_kept int; v_deleted int;
begin
  update public.results set search_id = null
   where search_id = p_search_id and user_id = v_uid
     and coalesce(prospect_status,'novo') <> 'novo';
  get diagnostics v_kept = row_count;

  delete from public.results
   where search_id = p_search_id and user_id = v_uid
     and coalesce(prospect_status,'novo') = 'novo';
  get diagnostics v_deleted = row_count;

  delete from public.searches where id = p_search_id and user_id = v_uid;

  return json_build_object('kept', v_kept, 'deleted', v_deleted);
end $$;

-- ============================================================================
-- FUNÇÃO: campaign_overview — lista campanhas com métricas compactas para o CRM.
-- ============================================================================
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

-- ============================================================================
-- FUNCAO: import_leads_v2 — proveniencia N:N, origem e idempotencia.
-- O wrapper import_leads de 3 argumentos preserva o contrato da extensao.
-- ============================================================================
create or replace function public.import_leads_v2(
  p_keyword text,
  p_city text,
  p_leads jsonb,
  p_source text default 'extension',
  p_mining_job_id uuid default null,
  p_idempotency_key text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_conflict_strategy text default 'merge'
) returns json
language plpgsql security invoker set search_path = public as $$
declare
  v_uid uuid := auth.uid(); v_search public.searches%rowtype; v_search_id uuid;
  v_lead jsonb; v_name text; v_phone text; v_addr text; v_site text; v_email text;
  v_place text; v_cid text; v_cat text; v_raw text;
  v_rating real; v_reviews int; v_lat real; v_lng real;
  v_ig text; v_fb text; v_in text; v_tw text; v_yt text; v_result_id uuid;
  v_inserted int := 0; v_merged int := 0; v_skipped int := 0;
  v_ignored int := 0; v_rejected int := 0; v_total int := 0;
  v_source text; v_strategy text; v_filename text;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if p_leads is null or jsonb_typeof(p_leads) <> 'array' then
    raise exception 'p_leads deve ser um array JSON';
  end if;
  v_source := case lower(coalesce(nullif(trim(p_source),''),'extension'))
    when 'extension' then 'extension' when 'extensao' then 'extension'
    when 'spreadsheet' then 'spreadsheet' when 'planilha' then 'spreadsheet'
    when 'csv' then 'spreadsheet' when 'excel' then 'spreadsheet' else 'api' end;
  v_strategy := lower(coalesce(nullif(trim(p_conflict_strategy),''),'merge'));
  if v_strategy not in ('merge','skip','overwrite') then
    raise exception 'Estrategia de conflito invalida: %', v_strategy;
  end if;

  if nullif(p_idempotency_key,'') is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text || ':' || p_idempotency_key,0));
    select * into v_search from public.searches
    where user_id = v_uid and idempotency_key = p_idempotency_key limit 1;
    if found then
      return json_build_object(
        'search_id',v_search.id,'inserted',v_search.inserted_count,
        'merged',v_search.merged_count,'skipped',v_search.skipped_count,
        'ignored',v_search.ignored_count,'rejected',v_search.rejected_count,
        'total',v_search.total_results,'source',v_search.source,'replayed',true);
    end if;
  end if;

  v_filename := coalesce(nullif(p_metadata->>'originalFilename',''),
    trim(coalesce(nullif(p_keyword,''),'maps') || ' ' || coalesce(p_city,'')));
  insert into public.searches
    (user_id,filename,keyword,city,total_results,status,source,input_count,
     idempotency_key,metadata)
  values
    (v_uid,v_filename,nullif(p_keyword,''),nullif(p_city,''),0,'processing',v_source,
     jsonb_array_length(p_leads),nullif(p_idempotency_key,''),
     coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('conflictStrategy',v_strategy))
  returning id into v_search_id;

  for v_lead in select value from jsonb_array_elements(p_leads) loop
    v_name := trim(coalesce(v_lead->>'name',''));
    if v_name = '' then v_rejected := v_rejected + 1; continue; end if;
    v_phone := trim(coalesce(v_lead->>'phone',''));
    v_addr := trim(coalesce(v_lead->>'address',''));
    v_site := trim(coalesce(v_lead->>'website',''));
    v_email := trim(coalesce(v_lead->>'email',''));
    v_place := trim(coalesce(v_lead->>'placeID',v_lead->>'place_id',''));
    v_cid := trim(coalesce(v_lead->>'cID',v_lead->>'cid',''));
    v_cat := trim(coalesce(v_lead->>'category',''));
    v_raw := replace(trim(coalesce(nullif(v_lead->>'averageRating',''),nullif(v_lead->>'rating',''),'')),',','.');
    v_rating := case when v_raw ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then v_raw::real else 0 end;
    v_raw := regexp_replace(coalesce(nullif(v_lead->>'reviewCount',''),nullif(v_lead->>'reviews_count',''),''),'[^0-9]','','g');
    v_reviews := coalesce(nullif(v_raw,'')::int,0);
    v_raw := replace(trim(coalesce(nullif(v_lead->>'latitude',''),'')),',','.');
    v_lat := case when v_raw ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then nullif(v_raw::real,0) else null end;
    v_raw := replace(trim(coalesce(nullif(v_lead->>'longitude',''),'')),',','.');
    v_lng := case when v_raw ~ '^[+-]?[0-9]+(\.[0-9]+)?$' then nullif(v_raw::real,0) else null end;
    v_ig := trim(coalesce(v_lead->>'instagram','')); v_fb := trim(coalesce(v_lead->>'facebook',''));
    v_in := trim(coalesce(v_lead->>'linkedin','')); v_tw := trim(coalesce(v_lead->>'twitter',''));
    v_yt := trim(coalesce(v_lead->>'youtube',''));

    if exists (select 1 from public.ignored_leads il where il.user_id = v_uid and (
      (v_place <> '' and il.place_id = v_place) or (v_phone <> '' and il.phone = v_phone) or
      (v_name <> '' and il.name = v_name and il.address = v_addr))) then
      v_ignored := v_ignored + 1; continue;
    end if;

    select r.id into v_result_id from public.results r
    where r.user_id = v_uid and (
      (v_place <> '' and r.place_id = v_place) or
      (length(v_phone) > 3 and r.phone = v_phone) or
      (length(v_phone) <= 3 and r.name = v_name and r.address = v_addr))
    order by case when v_place <> '' and r.place_id = v_place then 1
      when length(v_phone) > 3 and r.phone = v_phone then 2 else 3 end
    limit 1 for update;

    if found then
      if v_strategy = 'skip' then
        v_skipped := v_skipped + 1;
      else
        update public.results r set
          name = case when v_strategy='overwrite' then v_name else coalesce(nullif(r.name,''),v_name) end,
          address = case when v_strategy='overwrite' then v_addr else coalesce(nullif(r.address,''),v_addr) end,
          phone = case when v_strategy='overwrite' then v_phone else coalesce(nullif(r.phone,''),v_phone) end,
          website = case when v_strategy='overwrite' then v_site else coalesce(nullif(r.website,''),v_site) end,
          email = case when v_strategy='overwrite' then v_email else coalesce(nullif(r.email,''),v_email) end,
          category = case when v_strategy='overwrite' then v_cat else coalesce(nullif(r.category,''),v_cat) end,
          place_id = coalesce(nullif(r.place_id,''),v_place),
          cid = case when v_strategy='overwrite' then v_cid else coalesce(nullif(r.cid,''),v_cid) end,
          instagram = case when v_strategy='overwrite' then v_ig else coalesce(nullif(r.instagram,''),v_ig) end,
          facebook = case when v_strategy='overwrite' then v_fb else coalesce(nullif(r.facebook,''),v_fb) end,
          linkedin = case when v_strategy='overwrite' then v_in else coalesce(nullif(r.linkedin,''),v_in) end,
          twitter = case when v_strategy='overwrite' then v_tw else coalesce(nullif(r.twitter,''),v_tw) end,
          youtube = case when v_strategy='overwrite' then v_yt else coalesce(nullif(r.youtube,''),v_yt) end,
          rating = case when v_rating > 0 then v_rating else r.rating end,
          reviews_count = case when v_reviews > 0 then v_reviews else r.reviews_count end,
          latitude = coalesce(v_lat,r.latitude), longitude = coalesce(v_lng,r.longitude)
        where r.id = v_result_id and r.user_id = v_uid;
        v_merged := v_merged + 1;
      end if;
      insert into public.search_results
        (user_id,search_id,result_id,disposition,source_snapshot)
      values (v_uid,v_search_id,v_result_id,
        case when v_strategy='skip' then 'skipped' else 'merged' end,coalesce(v_lead,'{}'::jsonb))
      on conflict (search_id,result_id) do update
        set observed_at=excluded.observed_at,source_snapshot=excluded.source_snapshot;
    else
      insert into public.results
        (user_id,search_id,name,address,phone,website,category,rating,reviews_count,
         latitude,longitude,place_id,cid,email,instagram,facebook,linkedin,twitter,youtube)
      values
        (v_uid,v_search_id,v_name,v_addr,v_phone,v_site,v_cat,v_rating,v_reviews,
         v_lat,v_lng,v_place,v_cid,v_email,v_ig,v_fb,v_in,v_tw,v_yt)
      returning id into v_result_id;
      insert into public.search_results
        (user_id,search_id,result_id,disposition,source_snapshot)
      values (v_uid,v_search_id,v_result_id,'inserted',coalesce(v_lead,'{}'::jsonb));
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  select count(*)::int into v_total from public.search_results
  where search_id=v_search_id and user_id=v_uid;
  update public.searches set total_results=v_total,status='completed',inserted_count=v_inserted,
    merged_count=v_merged,skipped_count=v_skipped,ignored_count=v_ignored,
    rejected_count=v_rejected,completed_at=now()
  where id=v_search_id and user_id=v_uid;
  if p_mining_job_id is not null then
    update public.mining_jobs set search_id=v_search_id,status='completed',
      captured_count=greatest(captured_count,jsonb_array_length(p_leads)),
      inserted_count=v_inserted,merged_count=v_merged,ignored_count=v_ignored,
      completed_at=coalesce(completed_at,now()),heartbeat_at=now(),updated_at=now()
    where id=p_mining_job_id and user_id=v_uid;
  end if;
  return json_build_object('search_id',v_search_id,'inserted',v_inserted,'merged',v_merged,
    'skipped',v_skipped,'ignored',v_ignored,'rejected',v_rejected,'total',v_total,
    'source',v_source,'replayed',false);
end $$;

create or replace function public.import_leads(p_keyword text,p_city text,p_leads jsonb)
returns json language sql security invoker set search_path = public as $$
  select public.import_leads_v2(p_keyword,p_city,p_leads,'extension',null,null,'{}'::jsonb,'merge');
$$;

-- Pagina os resultados pela proveniencia N:N e preserva o shape plano legado.
create or replace function public.search_results_page(
  p_search_id uuid,p_offset int default 0,p_limit int default 50,
  p_filters jsonb default '{}'::jsonb,p_with_count boolean default true
) returns json language sql security invoker stable set search_path = public as $$
  with filtered as (
    select r.*,sr.disposition as import_disposition,sr.observed_at as imported_at
    from public.search_results sr join public.results r on r.id=sr.result_id and r.user_id=sr.user_id
    where sr.user_id=auth.uid() and sr.search_id=p_search_id
      and (coalesce(p_filters->>'name','')='' or r.name ilike '%'||(p_filters->>'name')||'%')
      and (coalesce(p_filters->>'category','')='' or r.category ilike '%'||(p_filters->>'category')||'%')
      and (coalesce(p_filters->>'city','')='' or r.address ilike '%'||(p_filters->>'city')||'%')
      and (coalesce(p_filters->>'prospect_status','')='' or r.prospect_status=p_filters->>'prospect_status')
      and (coalesce(p_filters->>'has_website','')<>'1' or coalesce(r.website,'') not in ('','—'))
      and (coalesce(p_filters->>'has_website','')<>'0' or coalesce(r.website,'') in ('','—'))
      and (coalesce(p_filters->>'has_email','')<>'1' or coalesce(r.email,'') not in ('','—'))
      and (coalesce(p_filters->>'has_email','')<>'0' or coalesce(r.email,'') in ('','—'))
      and (coalesce(p_filters->>'has_phone','')<>'1' or coalesce(r.phone,'') not in ('','—'))
      and (coalesce(p_filters->>'has_phone','')<>'0' or coalesce(r.phone,'') in ('','—'))
      and (coalesce(p_filters->>'no_social','')<>'1' or (coalesce(r.instagram,'')='' and
        coalesce(r.facebook,'')='' and coalesce(r.linkedin,'')='' and coalesce(r.twitter,'')='' and coalesce(r.youtube,'')=''))
      and (coalesce(p_filters->>'min_rating','') !~ '^[0-9]+(\.[0-9]+)?$' or r.rating >= (p_filters->>'min_rating')::real)
      and (coalesce(p_filters->>'max_rating','') !~ '^[0-9]+(\.[0-9]+)?$' or r.rating <= (p_filters->>'max_rating')::real)
      and (coalesce(p_filters->>'min_reviews','') !~ '^[0-9]+$' or r.reviews_count >= (p_filters->>'min_reviews')::int)
      and (coalesce(p_filters->>'max_reviews','') !~ '^[0-9]+$' or r.reviews_count <= (p_filters->>'max_reviews')::int)
  ), page_rows as (
    select * from filtered order by imported_at desc,created_at desc
    offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limit,50),1),1000)
  )
  select json_build_object('data',coalesce((select json_agg(p) from page_rows p),'[]'::json),
    'total',case when p_with_count then (select count(*)::int from filtered) else null end);
$$;

-- Exclusoes recalculam todas as importacoes afetadas pela relacao N:N.
create or replace function public.delete_results(p_ids uuid[])
returns int language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := auth.uid(); v_deleted int := 0; v_search_ids uuid[];
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  select array_agg(distinct sr.search_id) into v_search_ids from public.search_results sr
  where sr.user_id=v_uid and sr.result_id=any(coalesce(p_ids,array[]::uuid[]));
  insert into public.ignored_leads (user_id,place_id,phone,name,address)
  select user_id,coalesce(place_id,''),coalesce(phone,''),coalesce(name,''),coalesce(address,'')
  from public.results where id=any(coalesce(p_ids,array[]::uuid[])) and user_id=v_uid;
  delete from public.results where id=any(coalesce(p_ids,array[]::uuid[])) and user_id=v_uid;
  get diagnostics v_deleted = row_count;
  update public.searches s set total_results=(select count(*)::int from public.search_results sr where sr.search_id=s.id)
  where s.user_id=v_uid and s.id=any(coalesce(v_search_ids,array[]::uuid[]));
  return v_deleted;
end $$;

create or replace function public.delete_search_smart(p_search_id uuid)
returns json language plpgsql security invoker set search_path = public as $$
declare v_uid uuid:=auth.uid(); v_total int:=0; v_deleted int:=0; v_kept int:=0;
begin
  if not exists(select 1 from public.searches where id=p_search_id and user_id=v_uid) then
    return json_build_object('kept',0,'deleted',0);
  end if;
  select count(*)::int into v_total from public.search_results
  where search_id=p_search_id and user_id=v_uid;
  update public.results r set search_id=(select sr2.search_id from public.search_results sr2
    where sr2.result_id=r.id and sr2.user_id=v_uid and sr2.search_id<>p_search_id
    order by sr2.observed_at desc limit 1)
  where r.user_id=v_uid and r.search_id=p_search_id;
  delete from public.results r where r.user_id=v_uid and coalesce(r.prospect_status,'novo')='novo'
    and exists(select 1 from public.search_results target where target.search_id=p_search_id
      and target.result_id=r.id and target.user_id=v_uid)
    and not exists(select 1 from public.search_results other where other.result_id=r.id
      and other.user_id=v_uid and other.search_id<>p_search_id);
  get diagnostics v_deleted = row_count;
  v_kept:=greatest(v_total-v_deleted,0);
  delete from public.searches where id=p_search_id and user_id=v_uid;
  return json_build_object('kept',v_kept,'deleted',v_deleted);
end $$;

-- O grafico conta observacoes/importacoes; nao apenas a criacao do lead canonico.
create or replace function public.dashboard_charts()
returns json language sql security invoker stable set search_path = public as $$
  select json_build_object(
    'resultsByDate',coalesce((select json_agg(x) from (select date,count from (
      select to_char(observed_at at time zone 'America/Sao_Paulo','DD/MM/YYYY') as date,
        count(*)::int as count,min(observed_at) as mc
      from public.search_results where user_id=auth.uid()
      group by 1 order by mc desc limit 7) d order by mc asc) x),'[]'::json),
    'searches',coalesce((select json_agg(s) from (select * from public.searches
      where user_id=auth.uid() order by created_at desc) s),'[]'::json));
$$;

-- ── Timeline e mudancas de status atomicas ──────────────────────────────────
create or replace function public.create_lead_activity(
  p_result_id uuid,p_type text,p_summary text,p_channel text default null,
  p_metadata jsonb default '{}'::jsonb,p_occurred_at timestamptz default now(),
  p_idempotency_key text default null
) returns public.lead_activities language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_activity public.lead_activities%rowtype;
begin
  if not exists(select 1 from public.results where id=p_result_id and user_id=v_uid) then
    raise exception 'Lead nao encontrado';
  end if;
  if nullif(p_idempotency_key,'') is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':activity:'||p_idempotency_key,0));
    select * into v_activity from public.lead_activities
    where user_id=v_uid and idempotency_key=p_idempotency_key limit 1;
    if found then return v_activity; end if;
  end if;
  insert into public.lead_activities
    (user_id,result_id,type,summary,channel,metadata,occurred_at,idempotency_key)
  values (v_uid,p_result_id,coalesce(nullif(p_type,''),'note'),coalesce(p_summary,''),
    nullif(p_channel,''),coalesce(p_metadata,'{}'::jsonb),coalesce(p_occurred_at,now()),nullif(p_idempotency_key,''))
  returning * into v_activity;
  return v_activity;
end $$;

create or replace function public.set_lead_status(
  p_result_ids uuid[],p_status text,p_occurred_at timestamptz default now(),
  p_idempotency_key text default null
) returns int language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_id uuid; v_from text; v_changed int:=0; v_event_key text;
begin
  if p_status is null or trim(p_status)='' then raise exception 'Status obrigatorio'; end if;
  foreach v_id in array coalesce(p_result_ids,array[]::uuid[]) loop
    v_event_key:=case when nullif(p_idempotency_key,'') is null then null else p_idempotency_key||':'||v_id::text end;
    if v_event_key is not null and exists(select 1 from public.lead_activities
      where user_id=v_uid and idempotency_key=v_event_key) then continue; end if;
    select prospect_status into v_from from public.results
    where id=v_id and user_id=v_uid for update;
    if not found or v_from is not distinct from p_status then continue; end if;
    update public.results set prospect_status=p_status,
      last_contact_at=case when p_status='enviado' then coalesce(p_occurred_at,now()) else last_contact_at end
    where id=v_id and user_id=v_uid;
    insert into public.lead_activities
      (user_id,result_id,type,summary,from_status,to_status,metadata,occurred_at,idempotency_key)
    values (v_uid,v_id,'status_changed','Status alterado de '||coalesce(v_from,'novo')||' para '||p_status,
      v_from,p_status,'{}'::jsonb,coalesce(p_occurred_at,now()),v_event_key)
    on conflict (user_id,idempotency_key) where idempotency_key is not null and idempotency_key<>'' do nothing;
    v_changed:=v_changed+1;
  end loop;
  return v_changed;
end $$;

-- Criacao da campanha e inclusao dos leads acontecem na mesma transacao.
create or replace function public.create_campaign(
  p_name text,p_template_id uuid,p_message_body text,p_filters jsonb,p_result_ids uuid[],
  p_idempotency_key text default null,p_metadata jsonb default '{}'::jsonb
) returns json language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_campaign public.campaigns%rowtype; v_ids uuid[]; v_total int;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if trim(coalesce(p_name,''))='' or trim(coalesce(p_message_body,''))='' then
    raise exception 'Nome e mensagem sao obrigatorios';
  end if;
  if nullif(p_idempotency_key,'') is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':campaign:'||p_idempotency_key,0));
    select * into v_campaign from public.campaigns
    where user_id=v_uid and idempotency_key=p_idempotency_key limit 1;
    if found then return to_jsonb(v_campaign)||jsonb_build_object('replayed',true); end if;
  end if;
  if p_template_id is not null and not exists(select 1 from public.campaign_templates
    where id=p_template_id and user_id=v_uid) then raise exception 'Modelo de campanha nao encontrado'; end if;
  select array_agg(id order by created_at desc),count(*)::int into v_ids,v_total from (
    select distinct on(r.id) r.id,r.created_at from public.results r
    where r.user_id=v_uid and r.id=any(coalesce(p_result_ids,array[]::uuid[]))
    order by r.id,r.created_at desc) owned;
  if coalesce(v_total,0)=0 then raise exception 'Nenhum lead valido para a campanha'; end if;
  insert into public.campaigns
    (user_id,template_id,name,message_body,filters,total_leads,status,idempotency_key,metadata)
  values (v_uid,p_template_id,trim(p_name),p_message_body,coalesce(p_filters,'{}'::jsonb),
    v_total,'active',nullif(p_idempotency_key,''),coalesce(p_metadata,'{}'::jsonb))
  returning * into v_campaign;
  insert into public.campaign_leads(user_id,campaign_id,result_id,status)
  select v_uid,v_campaign.id,unnest(v_ids),'pending';
  return to_jsonb(v_campaign)||jsonb_build_object('replayed',false);
end $$;

-- O lead da campanha e o cadastro canonico avancam juntos e cada marco temporal
-- e gravado uma unica vez, mesmo sob retry da mesma requisicao.
create or replace function public.update_campaign_lead_status(
  p_campaign_lead_id uuid,p_status text,p_event_at timestamptz default now(),
  p_idempotency_key text default null
) returns public.campaign_leads language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_row public.campaign_leads%rowtype; v_from text; v_result_status text;
begin
  if p_status not in ('pending','sent','responded','won','lost') then
    raise exception 'Status de campanha invalido: %',p_status;
  end if;
  if nullif(p_idempotency_key,'') is not null and exists(select 1 from public.lead_activities
    where user_id=v_uid and idempotency_key=p_idempotency_key) then
    select * into v_row from public.campaign_leads where id=p_campaign_lead_id and user_id=v_uid;
    return v_row;
  end if;
  select * into v_row from public.campaign_leads
  where id=p_campaign_lead_id and user_id=v_uid for update;
  if not found then raise exception 'Lead da campanha nao encontrado'; end if;
  v_from:=v_row.status;
  if v_from is not distinct from p_status then return v_row; end if;
  update public.campaign_leads set status=p_status,
    sent_at=case when p_status='sent' then coalesce(sent_at,p_event_at,now()) else sent_at end,
    followup_due_at=case when p_status='sent' then coalesce(followup_due_at,coalesce(p_event_at,now())+interval '3 day') else followup_due_at end,
    responded_at=case when p_status='responded' then coalesce(responded_at,p_event_at,now()) else responded_at end,
    closed_at=case when p_status='won' then coalesce(closed_at,p_event_at,now()) else closed_at end,
    discarded_at=case when p_status='lost' then coalesce(discarded_at,p_event_at,now()) else discarded_at end,
    updated_at=now()
  where id=p_campaign_lead_id and user_id=v_uid returning * into v_row;
  v_result_status:=case p_status when 'sent' then 'enviado' when 'responded' then 'respondeu'
    when 'won' then 'fechado' when 'lost' then 'descartado' else null end;
  if v_result_status is not null then
    update public.results set prospect_status=v_result_status,
      last_contact_at=case when p_status='sent' then coalesce(p_event_at,now()) else last_contact_at end
    where id=v_row.result_id and user_id=v_uid;
  end if;
  insert into public.lead_activities
    (user_id,result_id,campaign_id,campaign_lead_id,type,summary,channel,from_status,to_status,
     metadata,occurred_at,idempotency_key)
  values (v_uid,v_row.result_id,v_row.campaign_id,v_row.id,'campaign_status',
    'Campanha alterada de '||coalesce(v_from,'pending')||' para '||p_status,'whatsapp',v_from,p_status,
    jsonb_build_object('campaign_id',v_row.campaign_id),coalesce(p_event_at,now()),nullif(p_idempotency_key,''))
  on conflict (user_id,idempotency_key) where idempotency_key is not null and idempotency_key<>'' do nothing;
  return v_row;
end $$;

-- Métricas históricas usam timestamps; o estágio atual não reduz o denominador
-- quando um lead avança de enviado para respondido/fechado.
create or replace function public.campaign_overview()
returns json language sql security invoker stable set search_path=public as $$
  with stats as (
    select campaign_id,
      count(*)::int as total,
      count(*) filter (where status='pending')::int as pending,
      count(*) filter (where status='sent')::int as sent,
      count(*) filter (where status='responded')::int as responded,
      count(*) filter (where status='won')::int as won,
      count(*) filter (where status='lost')::int as lost,
      count(*) filter (where sent_at is not null)::int as sent_total,
      count(*) filter (where responded_at is not null)::int as responded_total,
      count(*) filter (where closed_at is not null)::int as won_total,
      count(*) filter (where discarded_at is not null)::int as lost_total,
      count(*) filter (where status='sent' and followup_due_at is not null and followup_due_at<=now())::int as due_followups,
      min(sent_at) as first_sent_at,
      max(greatest(sent_at,responded_at,closed_at,discarded_at)) as last_activity_at
    from public.campaign_leads where user_id=auth.uid() group by campaign_id
  )
  select coalesce(json_agg(json_build_object(
    'id',c.id,'name',c.name,'template_id',c.template_id,'message_body',c.message_body,
    'filters',c.filters,'status',c.status,'created_at',c.created_at,'updated_at',c.updated_at,
    'total_leads',coalesce(s.total,c.total_leads,0),
    'pending',coalesce(s.pending,0),'sent',coalesce(s.sent,0),
    'responded',coalesce(s.responded,0),'won',coalesce(s.won,0),'lost',coalesce(s.lost,0),
    'sent_total',coalesce(s.sent_total,0),'responded_total',coalesce(s.responded_total,0),
    'won_total',coalesce(s.won_total,0),'lost_total',coalesce(s.lost_total,0),
    'response_rate',case when coalesce(s.sent_total,0)=0 then 0 else round((100.0*s.responded_total/s.sent_total)::numeric,1) end,
    'conversion_rate',case when coalesce(s.sent_total,0)=0 then 0 else round((100.0*s.won_total/s.sent_total)::numeric,1) end,
    'due_followups',coalesce(s.due_followups,0),'first_sent_at',s.first_sent_at,'last_activity_at',s.last_activity_at
  ) order by c.created_at desc),'[]'::json)
  from public.campaigns c left join stats s on s.campaign_id=c.id
  where c.user_id=auth.uid();
$$;

-- Jobs de mineração idempotentes permitem ACK, progresso e retomada do painel.
create or replace function public.start_mining_job(
  p_client_job_id text,p_keyword text default null,p_city text default null,
  p_source text default 'extension',p_metadata jsonb default '{}'::jsonb
) returns public.mining_jobs language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_job public.mining_jobs%rowtype;
begin
  if v_uid is null then raise exception 'Nao autenticado'; end if;
  if trim(coalesce(p_client_job_id,''))='' then raise exception 'client_job_id obrigatorio'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text||':mining:'||p_client_job_id,0));
  select * into v_job from public.mining_jobs
    where user_id=v_uid and client_job_id=p_client_job_id limit 1;
  if found then return v_job; end if;
  insert into public.mining_jobs
    (user_id,client_job_id,keyword,city,source,status,metadata,heartbeat_at)
  values (v_uid,p_client_job_id,nullif(p_keyword,''),nullif(p_city,''),
    coalesce(nullif(p_source,''),'extension'),'queued',coalesce(p_metadata,'{}'::jsonb),now())
  returning * into v_job;
  return v_job;
end $$;

create or replace function public.update_mining_job(
  p_job_id uuid,p_status text default null,p_captured_count int default null,
  p_enriched_count int default null,p_inserted_count int default null,
  p_merged_count int default null,p_ignored_count int default null,
  p_error_code text default null,p_error_message text default null,
  p_search_id uuid default null,p_metadata jsonb default '{}'::jsonb
) returns public.mining_jobs language plpgsql security invoker set search_path=public as $$
declare v_uid uuid:=auth.uid(); v_job public.mining_jobs%rowtype;
begin
  if p_status is not null and p_status not in ('queued','running','completed','failed','cancelled') then
    raise exception 'Status de mineracao invalido: %',p_status;
  end if;
  if p_search_id is not null and not exists(select 1 from public.searches where id=p_search_id and user_id=v_uid) then
    raise exception 'Busca nao encontrada';
  end if;
  update public.mining_jobs set
    status=coalesce(p_status,status),
    captured_count=case when p_captured_count is null then captured_count else greatest(captured_count,p_captured_count,0) end,
    enriched_count=case when p_enriched_count is null then enriched_count else greatest(enriched_count,p_enriched_count,0) end,
    inserted_count=case when p_inserted_count is null then inserted_count else greatest(inserted_count,p_inserted_count,0) end,
    merged_count=case when p_merged_count is null then merged_count else greatest(merged_count,p_merged_count,0) end,
    ignored_count=case when p_ignored_count is null then ignored_count else greatest(ignored_count,p_ignored_count,0) end,
    error_code=case when p_error_code is null then error_code else nullif(p_error_code,'') end,
    error_message=case when p_error_message is null then error_message else nullif(p_error_message,'') end,
    search_id=coalesce(p_search_id,search_id),metadata=metadata||coalesce(p_metadata,'{}'::jsonb),
    started_at=case when p_status='running' then coalesce(started_at,now()) else started_at end,
    completed_at=case when p_status in ('completed','failed','cancelled') then coalesce(completed_at,now()) else completed_at end,
    heartbeat_at=now(),updated_at=now()
  where id=p_job_id and user_id=v_uid returning * into v_job;
  if not found then raise exception 'Job de mineracao nao encontrado'; end if;
  return v_job;
end $$;

-- ── Permissão de execução para usuários logados ─────────────────────────────
grant select, insert, update, delete on public.searches to authenticated;
grant select, insert, update, delete on public.results to authenticated;
grant select, insert, update, delete on public.ignored_leads to authenticated;
grant select, insert, update, delete on public.user_prefs to authenticated;
grant select, insert, update, delete on public.campaign_templates to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_leads to authenticated;
grant select, insert, update, delete on public.search_results to authenticated;
grant select, insert, update, delete on public.lead_activities to authenticated;
grant select, insert, update, delete on public.lead_tasks to authenticated;
grant select, insert, update, delete on public.mining_jobs to authenticated;
grant execute on function public.import_leads(text, text, jsonb)  to authenticated;
grant execute on function public.import_leads_v2(text,text,jsonb,text,uuid,text,jsonb,text) to authenticated;
grant execute on function public.delete_results(uuid[])           to authenticated;
grant execute on function public.delete_search_smart(uuid)        to authenticated;
grant execute on function public.dashboard_metrics()              to authenticated;
grant execute on function public.dashboard_charts()               to authenticated;
grant execute on function public.prospect_summary()               to authenticated;
grant execute on function public.campaign_overview()              to authenticated;
grant execute on function public.search_results_page(uuid,int,int,jsonb,boolean) to authenticated;
grant execute on function public.create_lead_activity(uuid,text,text,text,jsonb,timestamptz,text) to authenticated;
grant execute on function public.set_lead_status(uuid[],text,timestamptz,text) to authenticated;
grant execute on function public.create_campaign(text,uuid,text,jsonb,uuid[],text,jsonb) to authenticated;
grant execute on function public.update_campaign_lead_status(uuid,text,timestamptz,text) to authenticated;
grant execute on function public.start_mining_job(text,text,text,text,jsonb) to authenticated;
grant execute on function public.update_mining_job(uuid,text,int,int,int,int,int,text,text,uuid,jsonb) to authenticated;
