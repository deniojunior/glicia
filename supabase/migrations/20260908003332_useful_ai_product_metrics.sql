-- Replace the operational snapshot with cost and product indicators useful to the pilot owner.
drop function public.ai_admin_controls_from_edge(uuid);

create function public.ai_admin_controls_from_edge(p_admin_id uuid)
returns table(
  enabled boolean,
  per_user_daily_request_limit integer,
  per_user_daily_token_limit bigint,
  global_daily_cost_limit_microusd bigint,
  max_concurrent_requests integer,
  requests_today bigint,
  completed_today bigint,
  failed_today bigint,
  active_users_today bigint,
  tokens_today bigint,
  estimated_cost_today_microusd bigint,
  requests_month bigint,
  completed_month bigint,
  failed_month bigint,
  active_users_month bigint,
  tokens_month bigint,
  estimated_cost_month_microusd bigint,
  projected_month_cost_microusd bigint,
  average_cost_per_analysis_microusd bigint,
  active_requests bigint,
  average_latency_ms bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  month_start date := pg_catalog.date_trunc('month', current_date)::date;
  days_in_month integer := extract(day from (pg_catalog.date_trunc('month', current_date) + interval '1 month - 1 day'))::integer;
  elapsed_days integer := extract(day from current_date)::integer;
begin
  if not exists (select 1 from public.app_admins where user_id = p_admin_id) then
    raise exception using errcode = '42501', message = 'Acesso administrativo obrigatório.';
  end if;

  return query
  with today as (
    select count(*) as requests,
           count(*) filter (where status = 'completed') as completed,
           count(*) filter (where status in ('failed', 'expired')) as failed,
           count(distinct user_id) filter (where status in ('completed', 'failed')) as active_users,
           coalesce(sum(input_tokens + output_tokens) filter (where status in ('completed', 'failed')), 0)::bigint as tokens,
           coalesce(sum(estimated_cost_microusd) filter (where status in ('completed', 'failed')), 0)::bigint as cost,
           count(*) filter (where status = 'active') as active,
           coalesce(avg(latency_ms) filter (where status in ('completed', 'failed')), 0)::bigint as latency
    from private.ai_request_metrics where usage_day = current_date
  ), month as (
    select count(*) as requests,
           count(*) filter (where status = 'completed') as completed,
           count(*) filter (where status in ('failed', 'expired')) as failed,
           count(distinct user_id) filter (where status in ('completed', 'failed')) as active_users,
           coalesce(sum(input_tokens + output_tokens) filter (where status in ('completed', 'failed')), 0)::bigint as tokens,
           coalesce(sum(estimated_cost_microusd) filter (where status in ('completed', 'failed')), 0)::bigint as cost
    from private.ai_request_metrics where usage_day >= month_start and usage_day <= current_date
  )
  select config.enabled,
         config.per_user_daily_request_limit,
         config.per_user_daily_token_limit,
         config.global_daily_cost_limit_microusd,
         config.max_concurrent_requests,
         today.requests, today.completed, today.failed, today.active_users, today.tokens, today.cost,
         month.requests, month.completed, month.failed, month.active_users, month.tokens, month.cost,
         pg_catalog.round(month.cost::numeric / elapsed_days * days_in_month)::bigint,
         case when month.completed > 0 then pg_catalog.round(month.cost::numeric / month.completed)::bigint else 0 end,
         today.active, today.latency
  from private.ai_runtime_config config cross join today cross join month
  where config.singleton;
end;
$$;

revoke all on function public.ai_admin_controls_from_edge(uuid) from public, anon, authenticated;
grant execute on function public.ai_admin_controls_from_edge(uuid) to service_role;
