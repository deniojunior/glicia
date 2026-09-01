-- Glicia v0.8: admissão controlada para o experimento fechado.
-- Solicitações e decisões passam somente por Edge Functions; o navegador nunca recebe
-- privilégios administrativos nem acesso direto à fila de solicitações.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  email_normalized text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  request_count integer not null default 1 check (request_count > 0),
  requested_at timestamptz not null default now(),
  last_requested_at timestamptz not null default now(),
  admin_notification_claimed_at timestamptz,
  admin_notification_sent_at timestamptz,
  decision_notification_claimed_at timestamptz,
  decision_notification_sent_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users (id) on delete set null,
  user_id uuid unique references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint access_requests_normalized_email
    check (
      email_normalized = lower(btrim(email_normalized))
      and char_length(email_normalized) between 3 and 320
      and position('@' in email_normalized) > 1
    ),
  constraint access_requests_review_state
    check (
      (status = 'pending' and reviewed_at is null and reviewed_by is null)
      or (status in ('approved', 'rejected') and reviewed_at is not null)
    )
);

create index access_requests_pending_idx
  on public.access_requests (last_requested_at asc)
  where status = 'pending';

create table public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.app_access_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  access_request_id uuid not null unique references public.access_requests (id) on delete restrict,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint app_access_grants_revocation_time
    check (revoked_at is null or revoked_at >= granted_at)
);

create table private.bootstrap_admin_emails (
  email_normalized text primary key,
  constraint bootstrap_admin_emails_normalized
    check (email_normalized = lower(btrim(email_normalized)))
);

insert into private.bootstrap_admin_emails (email_normalized)
values ('deniofriacamoreirajr@gmail.com')
on conflict do nothing;

alter table public.access_requests enable row level security;
alter table public.app_admins enable row level security;
alter table public.app_access_grants enable row level security;

revoke all on public.access_requests from public, anon, authenticated;
revoke all on public.app_admins from public, anon, authenticated;
revoke all on public.app_access_grants from public, anon, authenticated;

grant select on public.app_admins to authenticated;
grant select on public.app_access_grants to authenticated;
grant select, insert, update on public.access_requests to service_role;
grant select, insert, update, delete on public.app_admins to service_role;
grant select, insert, update, delete on public.app_access_grants to service_role;

create policy "admins read own membership" on public.app_admins
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "users read own access grant" on public.app_access_grants
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- O endereço do autor precisa poder criar a primeira conta administrativa local ou remota.
insert into public.access_requests (
  email_normalized,
  status,
  reviewed_at
)
values (
  'deniofriacamoreirajr@gmail.com',
  'approved',
  now()
)
on conflict (email_normalized) do update
set status = 'approved',
    reviewed_at = coalesce(public.access_requests.reviewed_at, now()),
    updated_at = now();

-- Contas existentes pertencem aos pilotos anteriores à fila de aprovação e são preservadas.
insert into public.access_requests (
  email_normalized,
  status,
  reviewed_at,
  user_id
)
select lower(btrim(email)), 'approved', now(), id
from auth.users
where email is not null
on conflict (email_normalized) do update
set status = 'approved',
    reviewed_at = coalesce(public.access_requests.reviewed_at, now()),
    user_id = excluded.user_id,
    updated_at = now();

insert into public.app_access_grants (user_id, access_request_id)
select user_id, id
from public.access_requests
where status = 'approved' and user_id is not null
on conflict (user_id) do nothing;

insert into public.app_admins (user_id)
select users.id
from auth.users as users
join private.bootstrap_admin_emails as admins
  on admins.email_normalized = lower(btrim(users.email))
on conflict do nothing;

create or replace function private.has_app_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.app_access_grants
    where user_id = (select auth.uid())
      and revoked_at is null
  );
$$;

revoke all on function private.has_app_access() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.has_app_access() to authenticated;

drop policy if exists "profiles own rows" on public.profiles;
create policy "profiles own approved rows" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id and (select private.has_app_access()))
  with check ((select auth.uid()) = user_id and (select private.has_app_access()));

drop policy if exists "preferences own rows" on public.user_preferences;
create policy "preferences own approved rows" on public.user_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id and (select private.has_app_access()))
  with check ((select auth.uid()) = user_id and (select private.has_app_access()));

drop policy if exists "food memory own rows" on public.food_memory;
create policy "food memory own approved rows" on public.food_memory
  for all to authenticated
  using ((select auth.uid()) = user_id and (select private.has_app_access()))
  with check ((select auth.uid()) = user_id and (select private.has_app_access()));

drop policy if exists "meal records own rows" on public.meal_records;
create policy "meal records own approved rows" on public.meal_records
  for all to authenticated
  using ((select auth.uid()) = user_id and (select private.has_app_access()))
  with check ((select auth.uid()) = user_id and (select private.has_app_access()));

drop policy if exists "connection metadata own rows" on public.ai_connections;
create policy "connection metadata own approved rows" on public.ai_connections
  for select to authenticated
  using ((select auth.uid()) = user_id and (select private.has_app_access()));

create or replace function public.submit_access_request_from_edge(p_email text)
returns table(request_id uuid, should_notify boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(btrim(p_email));
  request_row public.access_requests;
begin
  if normalized_email is null
    or char_length(normalized_email) not between 3 and 320
    or position('@' in normalized_email) <= 1 then
    raise exception using errcode = '22023', message = 'E-mail inválido.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('access-request/' || normalized_email, 0));

  select * into request_row
  from public.access_requests
  where email_normalized = normalized_email
  for update;

  if request_row.id is null then
    insert into public.access_requests (email_normalized)
    values (normalized_email)
    returning * into request_row;
  elsif request_row.status = 'pending' then
    update public.access_requests
    set request_count = request_count + 1,
        last_requested_at = now(),
        updated_at = now()
    where id = request_row.id
    returning * into request_row;
  elsif request_row.status = 'rejected'
    and request_row.last_requested_at <= now() - interval '30 days' then
    update public.access_requests
    set status = 'pending',
        request_count = request_count + 1,
        last_requested_at = now(),
        admin_notification_claimed_at = null,
        admin_notification_sent_at = null,
        decision_notification_claimed_at = null,
        decision_notification_sent_at = null,
        reviewed_at = null,
        reviewed_by = null,
        updated_at = now()
    where id = request_row.id
    returning * into request_row;
  end if;

  request_id := request_row.id;
  should_notify := request_row.status = 'pending'
    and request_row.admin_notification_sent_at is null
    and (
      request_row.admin_notification_claimed_at is null
      or request_row.admin_notification_claimed_at <= now() - interval '10 minutes'
    );
  if should_notify then
    update public.access_requests
    set admin_notification_claimed_at = now(), updated_at = now()
    where id = request_row.id;
  end if;
  return next;
end;
$$;

revoke all on function public.submit_access_request_from_edge(text) from public, anon, authenticated;
grant execute on function public.submit_access_request_from_edge(text) to service_role;

create or replace function public.review_access_request_from_edge(
  p_request_id uuid,
  p_reviewer_id uuid,
  p_decision text
)
returns table(
  request_id uuid,
  email_normalized text,
  status text,
  user_id uuid,
  should_notify boolean
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.access_requests;
  existing_user_id uuid;
begin
  if p_decision not in ('approved', 'rejected') then
    raise exception using errcode = '22023', message = 'Decisão inválida.';
  end if;
  if not exists (select 1 from public.app_admins where app_admins.user_id = p_reviewer_id) then
    raise exception using errcode = '42501', message = 'Acesso administrativo obrigatório.';
  end if;

  select * into request_row
  from public.access_requests
  where id = p_request_id
  for update;

  if request_row.id is null then
    raise exception using errcode = 'P0002', message = 'Solicitação não encontrada.';
  end if;
  if request_row.status <> 'pending' and request_row.status <> p_decision then
    raise exception using errcode = '23514', message = 'A solicitação já possui outra decisão.';
  end if;

  if request_row.status = 'pending' then
    update public.access_requests
    set status = p_decision,
        reviewed_at = now(),
        reviewed_by = p_reviewer_id,
        updated_at = now()
    where id = request_row.id
    returning * into request_row;
  end if;

  if request_row.status = 'approved' then
    select id into existing_user_id
    from auth.users
    where lower(btrim(email)) = request_row.email_normalized
    order by created_at asc
    limit 1;

    if existing_user_id is not null then
      update public.access_requests
      set user_id = existing_user_id, updated_at = now()
      where id = request_row.id
      returning * into request_row;

      insert into public.app_access_grants (user_id, access_request_id)
      values (existing_user_id, request_row.id)
      on conflict (user_id) do update
      set access_request_id = excluded.access_request_id,
          revoked_at = null,
          granted_at = now();
    end if;
  end if;

  request_id := request_row.id;
  email_normalized := request_row.email_normalized;
  status := request_row.status;
  user_id := request_row.user_id;
  should_notify := request_row.decision_notification_sent_at is null
    and (
      request_row.decision_notification_claimed_at is null
      or request_row.decision_notification_claimed_at <= now() - interval '10 minutes'
    );
  if should_notify then
    update public.access_requests
    set decision_notification_claimed_at = now(), updated_at = now()
    where id = request_row.id;
  end if;
  return next;
end;
$$;

revoke all on function public.review_access_request_from_edge(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.review_access_request_from_edge(uuid, uuid, text) to service_role;

create or replace function public.mark_access_notification_from_edge(
  p_request_id uuid,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'admin' then
    update public.access_requests
    set admin_notification_claimed_at = null,
        admin_notification_sent_at = coalesce(admin_notification_sent_at, now()),
        updated_at = now()
    where id = p_request_id and status = 'pending';
  elsif p_kind = 'decision' then
    update public.access_requests
    set decision_notification_claimed_at = null,
        decision_notification_sent_at = coalesce(decision_notification_sent_at, now()),
        updated_at = now()
    where id = p_request_id and status in ('approved', 'rejected');
  else
    raise exception using errcode = '22023', message = 'Tipo de notificação inválido.';
  end if;
end;
$$;

revoke all on function public.mark_access_notification_from_edge(uuid, text) from public, anon, authenticated;
grant execute on function public.mark_access_notification_from_edge(uuid, text) to service_role;

create or replace function public.release_access_notification_from_edge(
  p_request_id uuid,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_kind = 'admin' then
    update public.access_requests
    set admin_notification_claimed_at = null, updated_at = now()
    where id = p_request_id and admin_notification_sent_at is null;
  elsif p_kind = 'decision' then
    update public.access_requests
    set decision_notification_claimed_at = null, updated_at = now()
    where id = p_request_id and decision_notification_sent_at is null;
  else
    raise exception using errcode = '22023', message = 'Tipo de notificação inválido.';
  end if;
end;
$$;

revoke all on function public.release_access_notification_from_edge(uuid, text) from public, anon, authenticated;
grant execute on function public.release_access_notification_from_edge(uuid, text) to service_role;

create or replace function private.before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  candidate_email text := lower(btrim(event -> 'user' ->> 'email'));
begin
  if candidate_email is not null and exists (
    select 1
    from public.access_requests
    where email_normalized = candidate_email
      and status = 'approved'
  ) then
    return '{}'::jsonb;
  end if;

  return jsonb_build_object(
    'error', jsonb_build_object(
      'http_code', 403,
      'message', 'Acesso à Glicia ainda não aprovado.'
    )
  );
end;
$$;

revoke all on function private.before_user_created(jsonb) from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;
grant execute on function private.before_user_created(jsonb) to supabase_auth_admin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  approved_request_id uuid;
  normalized_email text := lower(btrim(new.email));
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict do nothing;

  select id into approved_request_id
  from public.access_requests
  where email_normalized = normalized_email
    and status = 'approved'
  for update;

  if approved_request_id is not null then
    update public.access_requests
    set user_id = new.id, updated_at = now()
    where id = approved_request_id;

    insert into public.app_access_grants (user_id, access_request_id)
    values (new.id, approved_request_id)
    on conflict (user_id) do update
    set access_request_id = excluded.access_request_id,
        revoked_at = null,
        granted_at = now();
  end if;

  if exists (
    select 1 from private.bootstrap_admin_emails
    where email_normalized = normalized_email
  ) then
    insert into public.app_admins (user_id)
    values (new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
