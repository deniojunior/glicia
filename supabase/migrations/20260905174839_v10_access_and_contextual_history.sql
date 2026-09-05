-- Glicia v0.10: entrada única e composição reutilizável do histórico.

alter table public.meal_records
  add column meal_items jsonb not null default '[]'::jsonb;

alter table public.meal_records
  add constraint meal_records_meal_items_array
  check (jsonb_typeof(meal_items) = 'array');

create index meal_records_user_type_created_idx
  on public.meal_records (user_id, meal_type, created_at desc);

create table private.access_entry_rate_limits (
  subject_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

revoke all on private.access_entry_rate_limits from public, anon, authenticated;

create or replace function public.access_entry_state_from_edge(p_email text, p_client_hash text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(p_email));
  request_row public.access_requests;
  current_attempts integer;
begin
  if normalized_email is null
    or char_length(normalized_email) not between 3 and 320
    or position('@' in normalized_email) <= 1 then
    raise exception using errcode = '22023', message = 'E-mail inválido.';
  end if;
  if p_client_hash is null or p_client_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'Identificador de cliente inválido.';
  end if;

  delete from private.access_entry_rate_limits
  where window_started_at < now() - interval '1 day';

  insert into private.access_entry_rate_limits (subject_hash)
  values ('email:' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(normalized_email, 'UTF8')), 'hex'))
  on conflict (subject_hash) do update
  set attempt_count = case
        when private.access_entry_rate_limits.window_started_at < now() - interval '15 minutes' then 1
        else private.access_entry_rate_limits.attempt_count + 1
      end,
      window_started_at = case
        when private.access_entry_rate_limits.window_started_at < now() - interval '15 minutes' then now()
        else private.access_entry_rate_limits.window_started_at
      end,
      updated_at = now()
  returning attempt_count into current_attempts;

  if current_attempts > 10 then
    return 'rate_limited';
  end if;

  insert into private.access_entry_rate_limits (subject_hash)
  values ('client:' || p_client_hash)
  on conflict (subject_hash) do update
  set attempt_count = case
        when private.access_entry_rate_limits.window_started_at < now() - interval '15 minutes' then 1
        else private.access_entry_rate_limits.attempt_count + 1
      end,
      window_started_at = case
        when private.access_entry_rate_limits.window_started_at < now() - interval '15 minutes' then now()
        else private.access_entry_rate_limits.window_started_at
      end,
      updated_at = now()
  returning attempt_count into current_attempts;

  if current_attempts > 30 then
    return 'rate_limited';
  end if;

  select * into request_row
  from public.access_requests
  where email_normalized = normalized_email;

  if request_row.id is null then
    return 'new';
  end if;
  if request_row.status = 'pending' then
    return 'pending';
  end if;
  if request_row.status = 'rejected' then
    return 'rejected';
  end if;
  if request_row.user_id is null then
    return 'approved';
  end if;
  if exists (
    select 1
    from public.app_access_grants
    where user_id = request_row.user_id
      and revoked_at is null
  ) then
    return 'approved';
  end if;
  return 'revoked';
end;
$$;

revoke all on function public.access_entry_state_from_edge(text, text) from public, anon, authenticated;
grant execute on function public.access_entry_state_from_edge(text, text) to service_role;
