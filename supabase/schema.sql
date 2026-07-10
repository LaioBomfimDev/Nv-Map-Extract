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
  created_at    timestamptz default now()
);

create table if not exists public.results (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  search_id      uuid references public.searches(id) on delete cascade,
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

do $$
declare t text;
begin
  foreach t in array array['searches','results','ignored_leads','user_prefs','campaign_templates','campaigns','campaign_leads'] loop
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
  )
  select json_build_object(
    'statusCounts', coalesce((select json_object_agg(coalesce(prospect_status,'novo'), c) from (
        select prospect_status, count(*)::int c from public.results
        where user_id = auth.uid() group by prospect_status) g), '{}'::json),
    'followUps', json_build_object(
        'count', (select count(*)::int from fu),
        'sample', coalesce((select json_agg(t) from (select * from fu order by last_contact_at asc limit 5) t), '[]'::json)),
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

-- ── Permissão de execução para usuários logados ─────────────────────────────
grant select, insert, update, delete on public.searches to authenticated;
grant select, insert, update, delete on public.results to authenticated;
grant select, insert, update, delete on public.ignored_leads to authenticated;
grant select, insert, update, delete on public.user_prefs to authenticated;
grant select, insert, update, delete on public.campaign_templates to authenticated;
grant select, insert, update, delete on public.campaigns to authenticated;
grant select, insert, update, delete on public.campaign_leads to authenticated;
grant execute on function public.import_leads(text, text, jsonb)  to authenticated;
grant execute on function public.delete_results(uuid[])           to authenticated;
grant execute on function public.delete_search_smart(uuid)        to authenticated;
grant execute on function public.dashboard_metrics()              to authenticated;
grant execute on function public.dashboard_charts()               to authenticated;
grant execute on function public.prospect_summary()               to authenticated;
grant execute on function public.campaign_overview()              to authenticated;
