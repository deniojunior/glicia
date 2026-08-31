-- A Edge Function valida a sessão e o provedor antes de chamar esta função.
-- Somente service_role pode executá-la; anon/authenticated não têm acesso pela Data API.
create or replace function public.store_ai_connection_from_edge(
  p_user_id uuid,
  p_provider text,
  p_model text,
  p_api_key text
)
returns table(provider text, model text, connected_at timestamptz)
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $$
declare
  secret_id uuid;
  connection public.ai_connections;
begin
  if p_user_id is null or p_provider <> 'openai'
    or char_length(trim(p_api_key)) < 20
    or char_length(trim(p_model)) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'Conexão de provedor inválida.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || '/openai', 0));

  select vault_secret_id into secret_id
    from public.ai_connections
    where user_id = p_user_id and ai_connections.provider = p_provider
    for update;

  if secret_id is null then
    select vault.create_secret(
      trim(p_api_key),
      'glicia/' || p_user_id::text || '/' || p_provider
    ) into secret_id;
  else
    perform vault.update_secret(secret_id, trim(p_api_key));
  end if;

  insert into public.ai_connections (user_id, provider, model, vault_secret_id)
    values (p_user_id, p_provider, trim(p_model), secret_id)
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

revoke all on function public.store_ai_connection_from_edge(uuid, text, text, text) from public;
revoke all on function public.store_ai_connection_from_edge(uuid, text, text, text) from anon, authenticated;
grant execute on function public.store_ai_connection_from_edge(uuid, text, text, text) to service_role;
