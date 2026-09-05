-- Glicia v0.9: credencial de IA central e exclusão total por conta.
-- O histórico técnico preserva provider/model em meal_records, mas preferências e segredos
-- individuais deixam de existir.

drop function if exists public.store_ai_connection(text, text, text);
drop function if exists public.store_ai_connection_from_edge(uuid, text, text, text);

delete from vault.secrets
where id in (select vault_secret_id from public.ai_connections);

drop table if exists public.ai_connections;

alter table public.user_preferences
  drop column if exists provider,
  drop column if exists model;

-- A conta institucional pode assumir a administração sem retirar o acesso do piloto atual.
insert into private.bootstrap_admin_emails (email_normalized)
values ('glicia.app@gmail.com')
on conflict do nothing;

insert into public.access_requests (email_normalized, status, reviewed_at)
values ('glicia.app@gmail.com', 'approved', now())
on conflict (email_normalized) do update
set status = 'approved',
    reviewed_at = coalesce(public.access_requests.reviewed_at, now()),
    updated_at = now();

insert into public.app_admins (user_id)
select id
from auth.users
where lower(btrim(email)) = 'glicia.app@gmail.com'
on conflict do nothing;

-- Executado na mesma transação que remove auth.users. As tabelas de saúde usam ON DELETE
-- CASCADE; a fila de acesso precisa ser removida explicitamente para apagar também o e-mail.
create or replace function private.before_user_deleted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.app_access_grants where user_id = old.id;
  delete from public.access_requests
  where user_id = old.id
     or email_normalized = lower(btrim(old.email));
  return old;
end;
$$;

revoke all on function private.before_user_deleted() from public, anon, authenticated;

drop trigger if exists before_auth_user_deleted on auth.users;
create trigger before_auth_user_deleted
  before delete on auth.users
  for each row execute procedure private.before_user_deleted();

create or replace function private.purge_expired_access_requests()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer;
begin
  delete from public.access_requests
  where status in ('pending', 'rejected')
    and user_id is null
    and last_requested_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function private.purge_expired_access_requests() from public, anon, authenticated;
grant usage on schema private to service_role;
grant execute on function private.purge_expired_access_requests() to service_role;
