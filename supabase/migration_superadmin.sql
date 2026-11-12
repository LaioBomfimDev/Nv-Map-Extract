-- ============================================================================
-- Friendly Miner — Superadmin, Perfis de Usuário, Logs de Acesso e Auditoria
--
-- Migration cumulativa e idempotente. Rode no SQL Editor do Supabase.
-- Define laiobomfimdev@gmail.com como único Superadmin no banco, cria
-- user_profiles + access_logs com RLS e RPCs de contagem de scrapings.
-- ============================================================================

create extension if not exists pgcrypto;

-- ── Helper imutável do e-mail Superadmin ────────────────────────────────────
create or replace function public.superadmin_email()
returns text
language sql
immutable
as $$
  select 'laiobomfimdev@gmail.com'::text;
$$;

-- ── Tabela de perfis de usuários ────────────────────────────────────────────
create table if not exists public.user_profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  full_name      text not null default '',
  role           text not null default 'user' check (role in ('user', 'superadmin')),
  is_active      boolean not null default true,
  blocked_reason text not null default '',
  last_login_at  timestamptz,
  last_seen_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_user_profiles_email
  on public.user_profiles (lower(email));
create index if not exists idx_user_profiles_role_active
  on public.user_profiles (role, is_active);

-- ── Tabela de logs de acesso e auditoria ────────────────────────────────────
create table if not exists public.access_logs (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  email         text not null,
  event_type    text not null check (
    event_type in (
      'login_success',
      'login_failed',
      'logout',
      'password_changed',
      'blocked_login_attempt',
      'profile_updated',
      'admin_user_created',
      'admin_user_updated',
      'admin_password_reset',
      'admin_user_deleted'
    )
  ),
  login_context text not null default 'panel',
  provider      text not null default 'email',
  ip_address    text not null default '',
  user_agent    text not null default '',
  path          text not null default '',
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_access_logs_created
  on public.access_logs (created_at desc);
create index if not exists idx_access_logs_user_created
  on public.access_logs (user_id, created_at desc);
create index if not exists idx_access_logs_event_created
  on public.access_logs (event_type, created_at desc);
create index if not exists idx_access_logs_email_created
  on public.access_logs (lower(email), created_at desc);

-- ── Verificação de Superadmin no servidor ───────────────────────────────────
create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    left join public.user_profiles p on p.id = u.id
    where u.id = auth.uid()
      and lower(coalesce(u.email, '')) = public.superadmin_email()
      and coalesce(p.is_active, true) = true
      and coalesce(p.role, 'superadmin') = 'superadmin'
  );
$$;

-- ── Trigger de sincronização automática de auth.users -> user_profiles ──────
create or replace function public.handle_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_role  text := case
    when lower(coalesce(new.email, '')) = public.superadmin_email() then 'superadmin'
    else 'user'
  end;
  v_name  text := trim(coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    ''
  ));
begin
  insert into public.user_profiles (
    id, email, full_name, role, is_active, created_at, updated_at
  )
  values (
    new.id, v_email, v_name, v_role, true, coalesce(new.created_at, now()), now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = case
      when excluded.full_name <> '' then excluded.full_name
      else public.user_profiles.full_name
    end,
    role = case
      when excluded.email = public.superadmin_email() then 'superadmin'
      else 'user'
    end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_sync on auth.users;
create trigger on_auth_user_profile_sync
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_auth_user_profile();

-- Backfill idempotente de todas as contas existentes
insert into public.user_profiles (
  id, email, full_name, role, is_active, last_login_at, created_at, updated_at
)
select
  u.id,
  lower(coalesce(u.email, '')),
  trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', '')),
  case
    when lower(coalesce(u.email, '')) = public.superadmin_email() then 'superadmin'
    else 'user'
  end,
  coalesce((u.banned_until is null or u.banned_until <= now()), true),
  u.last_sign_in_at,
  coalesce(u.created_at, now()),
  now()
from auth.users u
on conflict (id) do update set
  email = excluded.email,
  role = case
    when excluded.email = public.superadmin_email() then 'superadmin'
    else 'user'
  end,
  full_name = case
    when public.user_profiles.full_name = '' then excluded.full_name
    else public.user_profiles.full_name
  end,
  last_login_at = coalesce(public.user_profiles.last_login_at, excluded.last_login_at),
  updated_at = now();

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.user_profiles enable row level security;
alter table public.access_logs enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.user_profiles;
create policy "profiles_select_own_or_admin"
  on public.user_profiles for select
  using (auth.uid() = id or public.is_superadmin());

drop policy if exists "profiles_update_superadmin" on public.user_profiles;
create policy "profiles_update_superadmin"
  on public.user_profiles for update
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "access_logs_select_own_or_admin" on public.access_logs;
create policy "access_logs_select_own_or_admin"
  on public.access_logs for select
  using (public.is_superadmin() or auth.uid() = user_id);

-- ── RPCs para usuário autenticado ───────────────────────────────────────────
create or replace function public.get_my_profile()
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid     uuid := auth.uid();
  v_email   text;
  v_name    text;
  v_profile public.user_profiles%rowtype;
begin
  if v_uid is null then
    raise exception 'Nao autenticado';
  end if;

  select
    lower(coalesce(u.email, '')),
    trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''))
  into v_email, v_name
  from auth.users u
  where u.id = v_uid;

  insert into public.user_profiles (id, email, full_name, role, is_active)
  values (
    v_uid,
    coalesce(v_email, ''),
    coalesce(v_name, ''),
    case when coalesce(v_email, '') = public.superadmin_email() then 'superadmin' else 'user' end,
    true
  )
  on conflict (id) do nothing;

  select * into v_profile
  from public.user_profiles
  where id = v_uid;

  return json_build_object(
    'id', v_profile.id,
    'email', v_profile.email,
    'full_name', v_profile.full_name,
    'role', case when lower(v_profile.email) = public.superadmin_email() then 'superadmin' else v_profile.role end,
    'is_active', case when lower(v_profile.email) = public.superadmin_email() then true else v_profile.is_active end,
    'blocked_reason', v_profile.blocked_reason,
    'last_login_at', v_profile.last_login_at,
    'created_at', v_profile.created_at
  );
end;
$$;

create or replace function public.update_my_profile(p_full_name text)
returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_name  text := left(trim(coalesce(p_full_name, '')), 120);
  v_email text;
begin
  if v_uid is null then
    raise exception 'Nao autenticado';
  end if;

  update public.user_profiles
  set full_name = v_name,
      updated_at = now()
  where id = v_uid
  returning email into v_email;

  insert into public.access_logs (user_id, email, event_type, login_context, provider, metadata)
  values (v_uid, coalesce(v_email, ''), 'profile_updated', 'panel', 'system', jsonb_build_object('full_name', v_name));

  return public.get_my_profile();
end;
$$;

create or replace function public.record_access_event(
  p_event_type    text,
  p_login_context text default 'panel',
  p_provider      text default 'email',
  p_path          text default '',
  p_user_agent    text default '',
  p_metadata      jsonb default '{}'::jsonb
) returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'Nao autenticado';
  end if;

  if p_event_type not in (
    'login_success',
    'logout',
    'password_changed',
    'blocked_login_attempt',
    'profile_updated'
  ) then
    raise exception 'Tipo de evento invalido: %', p_event_type;
  end if;

  select lower(coalesce(email, '')) into v_email
  from auth.users
  where id = v_uid;

  insert into public.access_logs (
    user_id, email, event_type, login_context, provider, user_agent, path, metadata
  ) values (
    v_uid,
    coalesce(v_email, ''),
    p_event_type,
    left(coalesce(nullif(trim(p_login_context), ''), 'panel'), 40),
    left(coalesce(nullif(trim(p_provider), ''), 'email'), 40),
    left(coalesce(p_user_agent, ''), 400),
    left(coalesce(p_path, ''), 200),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_id;

  update public.user_profiles
  set
    last_login_at = case when p_event_type = 'login_success' then now() else last_login_at end,
    last_seen_at = now(),
    updated_at = now()
  where id = v_uid;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

-- ── RPCs exclusivas do Superadmin ───────────────────────────────────────────
create or replace function public.admin_get_overview(p_days int default 30)
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_days         int := least(greatest(coalesce(p_days, 30), 1), 365);
  v_today        date := (now() at time zone 'America/Sao_Paulo')::date;
  v_since_period date := v_today - (v_days - 1);
  v_since_7d     date := v_today - 6;
  v_summary      json;
  v_users        json;
  v_daily        json;
begin
  if not public.is_superadmin() then
    raise exception 'Acesso restrito ao superadmin';
  end if;

  with scraping_events as (
    select
      s.user_id,
      s.id as event_id,
      s.created_at,
      (s.created_at at time zone 'America/Sao_Paulo')::date as br_day,
      coalesce(s.total_results, s.inserted_count + s.merged_count, 0)::int as leads_count
    from public.searches s
    where lower(coalesce(s.source, 'extension')) in ('extension', 'extensao')
    union all
    select
      mj.user_id,
      mj.id as event_id,
      mj.created_at,
      (mj.created_at at time zone 'America/Sao_Paulo')::date as br_day,
      coalesce(mj.captured_count, 0)::int as leads_count
    from public.mining_jobs mj
    where mj.search_id is null
      and mj.status in ('running', 'completed')
  ),
  user_daily_counts as (
    select
      user_id,
      br_day,
      count(*)::int as day_scrapings
    from scraping_events
    group by user_id, br_day
  ),
  user_peak_day as (
    select distinct on (user_id)
      user_id,
      day_scrapings as max_scrapings_in_day,
      br_day as peak_scraping_day
    from user_daily_counts
    order by user_id, day_scrapings desc, br_day desc
  ),
  user_scrapings as (
    select
      user_id,
      count(*) filter (where br_day = v_today)::int as scrapings_today,
      count(*) filter (where br_day >= v_since_7d)::int as scrapings_7d,
      count(*) filter (where br_day >= v_since_period)::int as scrapings_period,
      count(*)::int as scrapings_total,
      max(created_at) as last_scraping_at
    from scraping_events
    group by user_id
  ),
  user_sheets as (
    select
      user_id,
      count(*)::int as spreadsheets_total
    from public.searches
    where lower(coalesce(source, '')) = 'spreadsheet'
    group by user_id
  ),
  user_failed_jobs as (
    select
      user_id,
      count(*)::int as failed_jobs_total
    from public.mining_jobs
    where status = 'failed'
    group by user_id
  ),
  user_leads as (
    select
      user_id,
      count(*)::int as leads_total,
      count(*) filter (where (created_at at time zone 'America/Sao_Paulo')::date = v_today)::int as leads_today
    from public.results
    group by user_id
  ),
  user_logins as (
    select
      user_id,
      count(*) filter (where event_type = 'login_success')::int as logins_total,
      count(*) filter (where event_type = 'login_success' and (created_at at time zone 'America/Sao_Paulo')::date >= v_since_7d)::int as logins_7d,
      max(created_at) filter (where event_type = 'login_success') as last_login_log_at
    from public.access_logs
    where user_id is not null
    group by user_id
  ),
  days_grid as (
    select generate_series(v_since_period, v_today, interval '1 day')::date as br_day
  ),
  daily_scraping_agg as (
    select
      br_day,
      count(*)::int as scrapings,
      coalesce(sum(leads_count), 0)::int as leads,
      count(distinct user_id)::int as active_users
    from scraping_events
    where br_day >= v_since_period
    group by br_day
  ),
  daily_sheet_agg as (
    select
      (created_at at time zone 'America/Sao_Paulo')::date as br_day,
      count(*)::int as spreadsheets
    from public.searches
    where lower(coalesce(source, '')) = 'spreadsheet'
      and (created_at at time zone 'America/Sao_Paulo')::date >= v_since_period
    group by 1
  )
  select
    json_build_object(
      'totalUsers', (select count(*)::int from public.user_profiles),
      'activeUsers', (select count(*)::int from public.user_profiles where is_active = true),
      'blockedUsers', (select count(*)::int from public.user_profiles where is_active = false),
      'scrapingsToday', coalesce((select count(*)::int from scraping_events where br_day = v_today), 0),
      'scrapingsPeriod', coalesce((select count(*)::int from scraping_events where br_day >= v_since_period), 0),
      'scrapingsTotal', coalesce((select count(*)::int from scraping_events), 0),
      'leadsTotal', coalesce((select count(*)::int from public.results), 0),
      'loginsToday', coalesce((
        select count(*)::int from public.access_logs
        where event_type = 'login_success'
          and (created_at at time zone 'America/Sao_Paulo')::date = v_today
      ), 0),
      'failedLogins24h', coalesce((
        select count(*)::int from public.access_logs
        where event_type in ('login_failed', 'blocked_login_attempt')
          and created_at >= now() - interval '24 hours'
      ), 0)
    ),
    coalesce((
      select json_agg(json_build_object(
        'id', p.id,
        'email', p.email,
        'full_name', p.full_name,
        'role', case when lower(p.email) = public.superadmin_email() then 'superadmin' else p.role end,
        'is_active', p.is_active,
        'blocked_reason', p.blocked_reason,
        'created_at', p.created_at,
        'last_login_at', coalesce(l.last_login_log_at, p.last_login_at, u.last_sign_in_at),
        'last_seen_at', p.last_seen_at,
        'scrapings_today', coalesce(us.scrapings_today, 0),
        'scrapings_7d', coalesce(us.scrapings_7d, 0),
        'scrapings_period', coalesce(us.scrapings_period, 0),
        'scrapings_total', coalesce(us.scrapings_total, 0),
        'max_scrapings_in_day', coalesce(upd.max_scrapings_in_day, 0),
        'peak_scraping_day', upd.peak_scraping_day,
        'last_scraping_at', us.last_scraping_at,
        'spreadsheets_total', coalesce(ush.spreadsheets_total, 0),
        'failed_jobs_total', coalesce(ufj.failed_jobs_total, 0),
        'leads_total', coalesce(ul.leads_total, 0),
        'leads_today', coalesce(ul.leads_today, 0),
        'logins_total', coalesce(l.logins_total, 0),
        'logins_7d', coalesce(l.logins_7d, 0)
      ) order by coalesce(us.scrapings_today, 0) desc, coalesce(us.scrapings_total, 0) desc, p.created_at desc)
      from public.user_profiles p
      left join auth.users u on u.id = p.id
      left join user_scrapings us on us.user_id = p.id
      left join user_peak_day upd on upd.user_id = p.id
      left join user_sheets ush on ush.user_id = p.id
      left join user_failed_jobs ufj on ufj.user_id = p.id
      left join user_leads ul on ul.user_id = p.id
      left join user_logins l on l.user_id = p.id
    ), '[]'::json),
    coalesce((
      select json_agg(json_build_object(
        'day', dg.br_day,
        'label', to_char(dg.br_day, 'DD/MM'),
        'scrapings', coalesce(dsa.scrapings, 0),
        'spreadsheets', coalesce(dsh.spreadsheets, 0),
        'leads', coalesce(dsa.leads, 0),
        'activeUsers', coalesce(dsa.active_users, 0)
      ) order by dg.br_day asc)
      from days_grid dg
      left join daily_scraping_agg dsa on dsa.br_day = dg.br_day
      left join daily_sheet_agg dsh on dsh.br_day = dg.br_day
    ), '[]'::json)
  into v_summary, v_users, v_daily;

  return json_build_object(
    'days', v_days,
    'today', v_today,
    'summary', v_summary,
    'users', v_users,
    'dailySeries', v_daily
  );
end;
$$;

create or replace function public.admin_get_daily_scrapings(
  p_days    int default 14,
  p_user_id uuid default null
) returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_days  int := least(greatest(coalesce(p_days, 14), 1), 365);
  v_since date := (now() at time zone 'America/Sao_Paulo')::date - (v_days - 1);
begin
  if not public.is_superadmin() then
    raise exception 'Acesso restrito ao superadmin';
  end if;

  return coalesce((
    with scraping_events as (
      select
        s.user_id,
        s.created_at,
        (s.created_at at time zone 'America/Sao_Paulo')::date as br_day,
        coalesce(s.total_results, s.inserted_count + s.merged_count, 0)::int as leads_count,
        case when lower(coalesce(s.source, '')) = 'spreadsheet' then 1 else 0 end as is_sheet,
        case when lower(coalesce(s.source, 'extension')) in ('extension', 'extensao') then 1 else 0 end as is_scraping
      from public.searches s
      where (s.created_at at time zone 'America/Sao_Paulo')::date >= v_since
        and (p_user_id is null or s.user_id = p_user_id)
      union all
      select
        mj.user_id,
        mj.created_at,
        (mj.created_at at time zone 'America/Sao_Paulo')::date as br_day,
        coalesce(mj.captured_count, 0)::int as leads_count,
        0 as is_sheet,
        1 as is_scraping
      from public.mining_jobs mj
      where mj.search_id is null
        and mj.status in ('running', 'completed')
        and (mj.created_at at time zone 'America/Sao_Paulo')::date >= v_since
        and (p_user_id is null or mj.user_id = p_user_id)
    ),
    grouped as (
      select
        se.br_day,
        se.user_id,
        sum(se.is_scraping)::int as scrapings_count,
        sum(se.is_sheet)::int as spreadsheets_count,
        sum(se.leads_count)::int as leads_captured,
        max(se.created_at) as last_activity_at
      from scraping_events se
      group by se.br_day, se.user_id
    )
    select json_agg(json_build_object(
      'day', g.br_day,
      'day_label', to_char(g.br_day, 'DD/MM/YYYY'),
      'user_id', g.user_id,
      'email', coalesce(p.email, ''),
      'full_name', coalesce(p.full_name, ''),
      'scrapings_count', g.scrapings_count,
      'spreadsheets_count', g.spreadsheets_count,
      'leads_captured', g.leads_captured,
      'last_activity_at', g.last_activity_at
    ) order by g.br_day desc, g.scrapings_count desc, g.leads_captured desc)
    from grouped g
    left join public.user_profiles p on p.id = g.user_id
  ), '[]'::json);
end;
$$;

create or replace function public.admin_get_access_logs(
  p_limit      int default 150,
  p_user_id    uuid default null,
  p_event_type text default null,
  p_search     text default null
) returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 150), 1), 500);
  v_q     text := trim(coalesce(p_search, ''));
begin
  if not public.is_superadmin() then
    raise exception 'Acesso restrito ao superadmin';
  end if;

  return coalesce((
    select json_agg(row_data)
    from (
      select
        l.id,
        l.user_id,
        l.email,
        coalesce(p.full_name, '') as full_name,
        coalesce(p.role, case when lower(l.email) = public.superadmin_email() then 'superadmin' else 'user' end) as user_role,
        l.event_type,
        l.login_context,
        l.provider,
        l.ip_address,
        l.user_agent,
        l.path,
        l.metadata,
        l.created_at
      from public.access_logs l
      left join public.user_profiles p on p.id = l.user_id
      where (p_user_id is null or l.user_id = p_user_id)
        and (nullif(trim(coalesce(p_event_type, '')), '') is null or l.event_type = p_event_type)
        and (
          v_q = ''
          or l.email ilike '%' || v_q || '%'
          or coalesce(p.full_name, '') ilike '%' || v_q || '%'
          or coalesce(l.ip_address, '') ilike '%' || v_q || '%'
          or coalesce(l.login_context, '') ilike '%' || v_q || '%'
        )
      order by l.created_at desc
      limit v_limit
    ) row_data
  ), '[]'::json);
end;
$$;

create or replace function public.admin_toggle_user_status(
  p_target_user_id uuid,
  p_is_active      boolean,
  p_reason         text default ''
) returns json
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target public.user_profiles%rowtype;
  v_reason text := left(trim(coalesce(p_reason, '')), 240);
begin
  if not public.is_superadmin() then
    raise exception 'Acesso restrito ao superadmin';
  end if;

  select * into v_target
  from public.user_profiles
  where id = p_target_user_id;

  if not found then
    raise exception 'Usuario nao encontrado';
  end if;

  if lower(v_target.email) = public.superadmin_email() then
    raise exception 'Nao e permitido bloquear a conta superadmin principal';
  end if;

  update public.user_profiles
  set
    is_active = p_is_active,
    blocked_reason = case when p_is_active then '' else v_reason end,
    updated_at = now()
  where id = p_target_user_id
  returning * into v_target;

  insert into public.access_logs (
    user_id, email, event_type, login_context, provider, metadata
  ) values (
    v_target.id,
    v_target.email,
    'admin_user_updated',
    'superadm',
    'system',
    jsonb_build_object(
      'actor', public.superadmin_email(),
      'is_active', p_is_active,
      'blocked_reason', v_target.blocked_reason
    )
  );

  return row_to_json(v_target);
end;
$$;

-- ── Permissões ──────────────────────────────────────────────────────────────
grant select on public.user_profiles to authenticated;
grant select on public.access_logs to authenticated;

grant execute on function public.superadmin_email() to authenticated;
grant execute on function public.is_superadmin() to authenticated;
grant execute on function public.get_my_profile() to authenticated;
grant execute on function public.update_my_profile(text) to authenticated;
grant execute on function public.record_access_event(text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.admin_get_overview(int) to authenticated;
grant execute on function public.admin_get_daily_scrapings(int, uuid) to authenticated;
grant execute on function public.admin_get_access_logs(int, uuid, text, text) to authenticated;
grant execute on function public.admin_toggle_user_status(uuid, boolean, text) to authenticated;
