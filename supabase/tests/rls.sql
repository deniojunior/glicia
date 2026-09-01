begin;
select plan(32);

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
  (select relrowsecurity from pg_class where oid = 'public.access_requests'::regclass),
  'access_requests tem RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_admins'::regclass),
  'app_admins tem RLS habilitado'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.app_access_grants'::regclass),
  'app_access_grants tem RLS habilitado'
);

select ok(
  (select count(*) >= 7 from pg_policies where schemaname = 'public' and tablename in ('profiles', 'user_preferences', 'food_memory', 'meal_records', 'ai_connections', 'app_admins', 'app_access_grants')),
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
select ok(
  has_function_privilege('service_role', 'public.submit_access_request_from_edge(text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.review_access_request_from_edge(uuid,uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.mark_access_notification_from_edge(uuid,text)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.release_access_notification_from_edge(uuid,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.submit_access_request_from_edge(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.review_access_request_from_edge(uuid,uuid,text)', 'EXECUTE'),
  'operações da fila de acesso são exclusivas do service_role'
);

select is(
  (private.before_user_created('{"user":{"email":"sem-aprovacao@example.test"}}'::jsonb) -> 'error' ->> 'http_code')::integer,
  403,
  'o hook bloqueia criação de conta sem aprovação'
);

insert into public.access_requests (email_normalized, status, reviewed_at)
values
  ('conta-a@example.test', 'approved', now()),
  ('conta-b@example.test', 'approved', now()),
  ('conta-bloqueada@example.test', 'pending', null);

select is(
  private.before_user_created('{"user":{"email":"CONTA-A@example.test"}}'::jsonb),
  '{}'::jsonb,
  'o hook permite criação com e-mail aprovado e normalizado'
);

set local role service_role;
select lives_ok(
  $$select * from public.submit_access_request_from_edge('candidato@example.test')$$,
  'a Edge Function pode registrar uma solicitação'
);
reset role;

select is(
  (select status from public.access_requests where email_normalized = 'candidato@example.test'),
  'pending',
  'uma nova solicitação começa pendente'
);

set local role service_role;
select is(
  (select should_notify from public.submit_access_request_from_edge('candidato@example.test')),
  false,
  'uma solicitação repetida não reserva a mesma notificação duas vezes'
);
reset role;

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'conta-a@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'conta-b@example.test'),
  ('33333333-3333-4333-8333-333333333333', 'conta-bloqueada@example.test');

insert into public.app_admins (user_id)
values ('11111111-1111-4111-8111-111111111111');

select is(
  (select count(*) from public.app_access_grants where user_id in ('11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222')),
  2::bigint,
  'o trigger concede acesso às contas previamente aprovadas'
);
select is(
  (select count(*) from public.app_access_grants where user_id = '33333333-3333-4333-8333-333333333333'),
  0::bigint,
  'inserção direta de conta pendente não cria concessão'
);

set local role service_role;
select throws_ok(
  $$select * from public.review_access_request_from_edge((select id from public.access_requests where email_normalized = 'candidato@example.test'), '22222222-2222-4222-8222-222222222222', 'approved')$$,
  '42501',
  null,
  'uma pessoa não administradora não revisa solicitações'
);
select lives_ok(
  $$select * from public.review_access_request_from_edge((select id from public.access_requests where email_normalized = 'candidato@example.test'), '11111111-1111-4111-8111-111111111111', 'approved')$$,
  'uma pessoa administradora aprova a solicitação'
);
reset role;

select is(
  (select status from public.access_requests where email_normalized = 'candidato@example.test'),
  'approved',
  'a decisão aprovada fica persistida'
);

set local role service_role;
select is(
  (select should_notify from public.review_access_request_from_edge((select id from public.access_requests where email_normalized = 'candidato@example.test'), '11111111-1111-4111-8111-111111111111', 'approved')),
  false,
  'repetir a mesma aprovação é idempotente e não duplica a notificação'
);
reset role;

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

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select throws_ok(
  $$insert into public.user_preferences (user_id, clinical_settings, interaction_mode, provider, model) values ('33333333-3333-4333-8333-333333333333', '{"target_glucose": 100}'::jsonb, 'preciso', 'openai', 'modelo-bloqueado')$$,
  '42501',
  null,
  'uma conta sem concessão não grava nem os próprios dados'
);
reset role;

select * from finish();
rollback;
