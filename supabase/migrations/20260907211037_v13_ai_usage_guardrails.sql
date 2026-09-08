-- Glicia v0.13: quotas atômicas, limite de custo, concorrência, suspensão e métricas sem conteúdo.

create table private.ai_runtime_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default true,
  per_user_daily_request_limit integer not null default 40 check (per_user_daily_request_limit between 1 and 10000),
  per_user_daily_token_limit bigint not null default 2000000 check (per_user_daily_token_limit between 1000 and 1000000000),
  global_daily_cost_limit_microusd bigint not null default 1000000 check (global_daily_cost_limit_microusd > 0),
  max_concurrent_requests integer not null default 4 check (max_concurrent_requests between 1 and 100),
  max_input_chars integer not null default 12000 check (max_input_chars between 1000 and 100000),
  max_output_chars integer not null default 12000 check (max_output_chars between 1000 and 100000),
  reservation_timeout_seconds integer not null default 180 check (reservation_timeout_seconds between 30 and 600),
  input_usd_per_million_tokens numeric(12, 6) not null default 0.15 check (input_usd_per_million_tokens >= 0),
  output_usd_per_million_tokens numeric(12, 6) not null default 0.60 check (output_usd_per_million_tokens >= 0),
  updated_at timestamptz not null default now()
);

insert into private.ai_runtime_config (singleton) values (true);

create table private.ai_request_metrics (
  request_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  usage_day date not null default current_date,
  status text not null default 'active' check (status in ('active', 'completed', 'failed', 'expired')),
  input_chars integer not null check (input_chars >= 0),
  output_chars integer not null default 0 check (output_chars >= 0),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  estimated_cost_microusd bigint not null default 0 check (estimated_cost_microusd >= 0),
  failure_code text check (failure_code is null or char_length(failure_code) between 1 and 80),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  finished_at timestamptz,
  check ((status = 'active' and finished_at is null) or (status <> 'active' and finished_at is not null))
);

create index ai_request_metrics_user_day_idx
  on private.ai_request_metrics (user_id, usage_day, started_at desc);
create index ai_request_metrics_day_status_idx
  on private.ai_request_metrics (usage_day, status);
create index ai_request_metrics_active_expiry_idx
  on private.ai_request_metrics (expires_at)
  where status = 'active';

revoke all on private.ai_runtime_config from public, anon, authenticated;
revoke all on private.ai_request_metrics from public, anon, authenticated;

create or replace function public.reserve_ai_request_from_edge(p_user_id uuid, p_input_chars integer)
returns table(request_id uuid, allowed boolean, denial_code text, max_output_chars integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  config private.ai_runtime_config;
  current_user_requests bigint;
  current_user_tokens bigint;
  current_global_cost bigint;
  current_concurrency bigint;
begin
  if p_user_id is null or p_input_chars is null or p_input_chars < 0 then
    raise exception using errcode = '22023', message = 'Reserva de IA inválida.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('glicia/ai-usage', 0));
  update private.ai_request_metrics
  set status = 'expired', finished_at = now(), failure_code = 'reservation_expired'
  where status = 'active' and expires_at <= now();

  select * into config from private.ai_runtime_config where singleton for update;
  max_output_chars := config.max_output_chars;

  if not config.enabled then
    return query select null::uuid, false, 'disabled'::text, config.max_output_chars;
    return;
  end if;
  if not exists (select 1 from public.app_access_grants where user_id = p_user_id and revoked_at is null) then
    return query select null::uuid, false, 'suspended'::text, config.max_output_chars;
    return;
  end if;
  if p_input_chars > config.max_input_chars then
    return query select null::uuid, false, 'input_too_large'::text, config.max_output_chars;
    return;
  end if;

  select count(*) into current_user_requests
  from private.ai_request_metrics
  where user_id = p_user_id and usage_day = current_date;
  if current_user_requests >= config.per_user_daily_request_limit then
    return query select null::uuid, false, 'user_daily_limit'::text, config.max_output_chars;
    return;
  end if;

  select coalesce(sum(input_tokens + output_tokens), 0) into current_user_tokens
  from private.ai_request_metrics
  where user_id = p_user_id and usage_day = current_date and status in ('completed', 'failed');
  if current_user_tokens >= config.per_user_daily_token_limit then
    return query select null::uuid, false, 'user_daily_token_limit'::text, config.max_output_chars;
    return;
  end if;

  select coalesce(sum(estimated_cost_microusd), 0) into current_global_cost
  from private.ai_request_metrics
  where usage_day = current_date and status in ('completed', 'failed');
  if current_global_cost >= config.global_daily_cost_limit_microusd then
    return query select null::uuid, false, 'global_cost_limit'::text, config.max_output_chars;
    return;
  end if;

  select count(*) into current_concurrency
  from private.ai_request_metrics where status = 'active';
  if current_concurrency >= config.max_concurrent_requests then
    return query select null::uuid, false, 'concurrency_limit'::text, config.max_output_chars;
    return;
  end if;

  insert into private.ai_request_metrics (user_id, input_chars, expires_at)
  values (p_user_id, p_input_chars, now() + pg_catalog.make_interval(secs => config.reservation_timeout_seconds))
  returning ai_request_metrics.request_id into request_id;
  allowed := true;
  denial_code := null;
  return next;
end;
$$;

create or replace function public.finish_ai_request_from_edge(
  p_request_id uuid,
  p_user_id uuid,
  p_status text,
  p_output_chars integer default 0,
  p_input_tokens integer default 0,
  p_output_tokens integer default 0,
  p_latency_ms integer default 0,
  p_failure_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  config private.ai_runtime_config;
  changed integer;
begin
  if p_status not in ('completed', 'failed')
    or p_output_chars < 0 or p_input_tokens < 0 or p_output_tokens < 0 or p_latency_ms < 0
    or (p_failure_code is not null and char_length(p_failure_code) not between 1 and 80) then
    raise exception using errcode = '22023', message = 'Conclusão de IA inválida.';
  end if;
  select * into config from private.ai_runtime_config where singleton;
  update private.ai_request_metrics
  set status = p_status,
      output_chars = p_output_chars,
      input_tokens = p_input_tokens,
      output_tokens = p_output_tokens,
      latency_ms = p_latency_ms,
      estimated_cost_microusd = pg_catalog.ceil(
        p_input_tokens * config.input_usd_per_million_tokens
        + p_output_tokens * config.output_usd_per_million_tokens
      )::bigint,
      failure_code = case when p_status = 'failed' then coalesce(p_failure_code, 'unknown') else null end,
      finished_at = now()
  where request_id = p_request_id and user_id = p_user_id and status = 'active';
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;

create or replace function public.ai_admin_controls_from_edge(p_admin_id uuid)
returns table(
  enabled boolean,
  per_user_daily_request_limit integer,
  per_user_daily_token_limit bigint,
  global_daily_cost_limit_microusd bigint,
  max_concurrent_requests integer,
  requests_today bigint,
  tokens_today bigint,
  estimated_cost_today_microusd bigint,
  active_requests bigint,
  average_latency_ms bigint,
  failed_requests bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_admins where user_id = p_admin_id) then
    raise exception using errcode = '42501', message = 'Acesso administrativo obrigatório.';
  end if;
  return query
  select config.enabled,
         config.per_user_daily_request_limit,
         config.per_user_daily_token_limit,
         config.global_daily_cost_limit_microusd,
         config.max_concurrent_requests,
         count(metrics.request_id),
         coalesce(sum(metrics.input_tokens + metrics.output_tokens) filter (where metrics.status in ('completed', 'failed')), 0)::bigint,
         coalesce(sum(metrics.estimated_cost_microusd) filter (where metrics.status in ('completed', 'failed')), 0)::bigint,
         count(metrics.request_id) filter (where metrics.status = 'active'),
         coalesce(avg(metrics.latency_ms) filter (where metrics.status in ('completed', 'failed')), 0)::bigint,
         count(metrics.request_id) filter (where metrics.status = 'failed')
  from private.ai_runtime_config config
  left join private.ai_request_metrics metrics on metrics.usage_day = current_date
  where config.singleton
  group by config.enabled, config.per_user_daily_request_limit, config.per_user_daily_token_limit,
           config.global_daily_cost_limit_microusd, config.max_concurrent_requests;
end;
$$;

create or replace function public.update_ai_runtime_from_edge(p_admin_id uuid, p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_admins where user_id = p_admin_id) then
    raise exception using errcode = '42501', message = 'Acesso administrativo obrigatório.';
  end if;
  update private.ai_runtime_config set enabled = p_enabled, updated_at = now() where singleton;
  return p_enabled;
end;
$$;

create or replace function public.set_app_access_from_edge(p_admin_id uuid, p_user_id uuid, p_suspended boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.app_admins where user_id = p_admin_id) then
    raise exception using errcode = '42501', message = 'Acesso administrativo obrigatório.';
  end if;
  if p_admin_id = p_user_id and p_suspended then
    raise exception using errcode = '22023', message = 'A conta administradora atual não pode suspender a si mesma.';
  end if;
  update public.app_access_grants
  set revoked_at = case when p_suspended then now() else null end
  where user_id = p_user_id;
  if not found then raise exception using errcode = 'P0002', message = 'Acesso não encontrado.'; end if;
  return p_suspended;
end;
$$;

create or replace function private.purge_ai_request_metrics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_count integer;
begin
  delete from private.ai_request_metrics where started_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.reserve_ai_request_from_edge(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_ai_request_from_edge(uuid, uuid, text, integer, integer, integer, integer, text) from public, anon, authenticated;
revoke all on function public.ai_admin_controls_from_edge(uuid) from public, anon, authenticated;
revoke all on function public.update_ai_runtime_from_edge(uuid, boolean) from public, anon, authenticated;
revoke all on function public.set_app_access_from_edge(uuid, uuid, boolean) from public, anon, authenticated;
revoke all on function private.purge_ai_request_metrics() from public, anon, authenticated;
grant execute on function public.reserve_ai_request_from_edge(uuid, integer) to service_role;
grant execute on function public.finish_ai_request_from_edge(uuid, uuid, text, integer, integer, integer, integer, text) to service_role;
grant execute on function public.ai_admin_controls_from_edge(uuid) to service_role;
grant execute on function public.update_ai_runtime_from_edge(uuid, boolean) to service_role;
grant execute on function public.set_app_access_from_edge(uuid, uuid, boolean) to service_role;
grant execute on function private.purge_ai_request_metrics() to service_role;
