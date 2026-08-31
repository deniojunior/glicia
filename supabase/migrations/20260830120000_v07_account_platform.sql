-- Glicia v0.7: dados remotos por conta e metadados de conexão BYOK.
-- Segredos nunca são armazenados nas tabelas da aplicação; ficam no Supabase Vault.

create extension if not exists pgcrypto;
create extension if not exists supabase_vault with schema vault;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  version integer not null default 1 check (version = 1),
  clinical_settings jsonb not null,
  interaction_mode text not null check (interaction_mode in ('preciso', 'rapido')),
  provider text not null check (provider in ('openai')),
  model text not null check (char_length(trim(model)) between 1 and 120),
  onboarding_progress jsonb,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_memory (
  user_id uuid not null references auth.users (id) on delete cascade,
  food text not null check (char_length(trim(food)) between 1 and 160),
  usual_preparation text not null check (char_length(trim(usual_preparation)) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, food)
);

create table if not exists public.meal_records (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  meal_input text not null,
  assistant_summary text not null,
  interaction_mode text not null check (interaction_mode in ('preciso', 'rapido')),
  meal_type text not null check (meal_type in ('CAFE_DA_MANHA', 'ALMOCO', 'CAFE_DA_TARDE', 'JANTAR', 'CEIA')),
  carbohydrates numeric not null check (carbohydrates >= 0),
  glucose numeric not null check (glucose > 0),
  glucose_trend text not null check (glucose_trend in ('SUBINDO_RAPIDO', 'SUBINDO', 'ESTAVEL', 'CAINDO', 'CAINDO_RAPIDO', 'NAO_INFORMADA')),
  target_glucose numeric not null check (target_glucose > 0),
  correction_factor numeric not null check (correction_factor > 0),
  carbohydrate_ratio numeric not null check (carbohydrate_ratio > 0),
  basal_morning_units numeric not null check (basal_morning_units >= 0),
  correction_dose numeric not null,
  carbohydrate_dose numeric not null check (carbohydrate_dose >= 0),
  trend_adjustment integer not null check (trend_adjustment between -2 and 2),
  calculated_dose numeric not null,
  suggested_dose integer not null check (suggested_dose >= 0),
  applied_dose numeric check (applied_dose is null or applied_dose >= 0),
  provider text not null check (char_length(trim(provider)) between 1 and 80),
  model text not null check (char_length(trim(model)) between 1 and 120),
  primary key (id, user_id)
);

create table if not exists public.ai_connections (
  user_id uuid not null references auth.users (id) on delete cascade,
  provider text not null check (provider in ('openai')),
  model text not null check (char_length(trim(model)) between 1 and 120),
  vault_secret_id uuid not null unique,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

create index if not exists meal_records_user_created_idx
  on public.meal_records (user_id, created_at desc);

create index if not exists food_memory_user_updated_idx
  on public.food_memory (user_id, updated_at desc);

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert, update, delete on public.food_memory to authenticated;
grant select, insert, update, delete on public.meal_records to authenticated;
grant select on public.ai_connections to authenticated;

alter table public.profiles enable row level security;
alter table public.user_preferences enable row level security;
alter table public.food_memory enable row level security;
alter table public.meal_records enable row level security;
alter table public.ai_connections enable row level security;

create policy "profiles own rows" on public.profiles
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "preferences own rows" on public.user_preferences
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "food memory own rows" on public.food_memory
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "meal records own rows" on public.meal_records
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "connection metadata own rows" on public.ai_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- A chave entra por uma Edge Function autenticada e é cifrada pelo Vault.
-- O segredo nunca passa pela tabela ai_connections nem é devolvido ao cliente.
create or replace function public.store_ai_connection(
  p_provider text,
  p_model text,
  p_api_key text
)
returns table(provider text, model text, connected_at timestamptz)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  current_user_id uuid := (select auth.uid());
  secret_id uuid;
  connection public.ai_connections;
begin
  if current_user_id is null then
    raise exception using errcode = '42501', message = 'Sessão autenticada obrigatória.';
  end if;
  if p_provider <> 'openai' or char_length(trim(p_api_key)) < 20
    or char_length(trim(p_model)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Conexão de provedor inválida.';
  end if;
  select vault_secret_id into secret_id
    from public.ai_connections
    where user_id = current_user_id and ai_connections.provider = p_provider;
  if secret_id is null then
    select vault.create_secret(trim(p_api_key), 'glicia/' || current_user_id::text || '/' || p_provider)
      into secret_id;
  else
    perform vault.update_secret(secret_id, trim(p_api_key));
  end if;
  insert into public.ai_connections (user_id, provider, model, vault_secret_id)
    values (current_user_id, p_provider, trim(p_model), secret_id)
    on conflict on constraint ai_connections_pkey do update
      set model = excluded.model,
          vault_secret_id = excluded.vault_secret_id,
          updated_at = now()
    returning * into connection;
  provider := connection.provider;
  model := connection.model;
  connected_at := connection.updated_at;
  return next;
end;
$$;

revoke all on function public.store_ai_connection(text, text, text) from public;
revoke all on function public.store_ai_connection(text, text, text) from anon;
grant execute on function public.store_ai_connection(text, text, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;
revoke all on function public.handle_new_user() from anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
