begin;
select plan(16);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'profiles tem RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.user_preferences'::regclass),
  'user_preferences tem RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.food_memory'::regclass),
  'food_memory tem RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.meal_records'::regclass),
  'meal_records tem RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.ai_connections'::regclass),
  'ai_connections tem RLS habilitado'
);

select ok(
  (select count(*) >= 5 from pg_policies where schemaname = 'public' and tablename in ('profiles', 'user_preferences', 'food_memory', 'meal_records', 'ai_connections')),
  'as tabelas expostas têm políticas explícitas'
);

select ok(
  to_regprocedure('public.store_ai_connection(text,text,text)') is null,
  'a gravação BYOK não fica exposta como RPC na Data API'
);
select ok(
  has_function_privilege('service_role', 'public.store_ai_connection_from_edge(uuid,text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.store_ai_connection_from_edge(uuid,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.store_ai_connection_from_edge(uuid,text,text,text)', 'EXECUTE'),
  'somente service_role executa a gravação BYOK interna'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'conta-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'conta-b@example.test');

insert into public.user_preferences (
  user_id, clinical_settings, interaction_mode, provider, model
)
values
  ('11111111-1111-4111-8111-111111111111', '{"target_glucose": 110}'::jsonb, 'preciso', 'openai', 'modelo-a'),
  ('22222222-2222-4222-8222-222222222222', '{"target_glucose": 120}'::jsonb, 'rapido', 'openai', 'modelo-b');

set local role service_role;
select lives_ok(
  $$select * from public.store_ai_connection_from_edge('11111111-1111-4111-8111-111111111111', 'openai', 'gpt-4o-mini', 'diagnostic-value-first-not-real')$$,
  'a Edge Function pode criar uma conexão BYOK'
);
select lives_ok(
  $$select * from public.store_ai_connection_from_edge('11111111-1111-4111-8111-111111111111', 'openai', 'gpt-4o-mini', 'diagnostic-value-second-not-real')$$,
  'a Edge Function pode rotacionar uma conexão BYOK'
);
reset role;
select is(
  (select decrypted_secret from vault.decrypted_secrets join public.ai_connections on id = vault_secret_id where user_id = '11111111-1111-4111-8111-111111111111'),
  'diagnostic-value-second-not-real',
  'a rotação substitui o segredo cifrado existente'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);

select is(
  (select count(*) from public.user_preferences),
  1::bigint,
  'a conta autenticada lê somente as próprias preferências'
);
select is(
  (select model from public.user_preferences),
  'modelo-a',
  'a conta autenticada não recebe dados da outra conta'
);
select is(
  (select count(*) from public.user_preferences where user_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'a conta autenticada não lê a linha de outra pessoa'
);
select throws_ok(
  $$insert into public.food_memory (user_id, food, usual_preparation) values ('22222222-2222-4222-8222-222222222222', 'alimento fictício', 'preparo fictício')$$,
  '42501',
  null,
  'a conta autenticada não grava dados para outra pessoa'
);
select throws_ok(
  $$insert into public.ai_connections (user_id, provider, model, vault_secret_id) values ('11111111-1111-4111-8111-111111111111', 'openai', 'modelo-a', '33333333-3333-4333-8333-333333333333')$$,
  '42501',
  null,
  'a conta autenticada não grava metadados BYOK diretamente'
);

reset role;

select * from finish();
rollback;
