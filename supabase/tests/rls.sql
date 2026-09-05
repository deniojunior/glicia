begin;
select plan(33);

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
  (select count(*) >= 6 from pg_policies where schemaname = 'public' and tablename in ('profiles', 'user_preferences', 'food_memory', 'meal_records', 'app_admins', 'app_access_grants')),
  'as tabelas expostas têm políticas explícitas'
);

select ok(
  to_regclass('public.ai_connections') is null
  and to_regprocedure('public.store_ai_connection(text,text,text)') is null
  and to_regprocedure('public.store_ai_connection_from_edge(uuid,text,text,text)') is null,
  'estruturas e operações BYOK foram removidas'
);
select ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_preferences'
      and column_name in ('provider', 'model')
  ),
  'preferências não armazenam provedor ou modelo administrado pelo backend'
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
  user_id, clinical_settings, interaction_mode
)
values
  ('11111111-1111-4111-8111-111111111111', '{"target_glucose": 110}'::jsonb, 'preciso'),
  ('22222222-2222-4222-8222-222222222222', '{"target_glucose": 120}'::jsonb, 'rapido');

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
  (select interaction_mode from public.user_preferences),
  'preciso',
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
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',
  true
);
select throws_ok(
  $$insert into public.user_preferences (user_id, clinical_settings, interaction_mode) values ('33333333-3333-4333-8333-333333333333', '{"target_glucose": 100}'::jsonb, 'preciso')$$,
  '42501',
  null,
  'uma conta sem concessão não grava nem os próprios dados'
);
reset role;

delete from auth.users where id = '22222222-2222-4222-8222-222222222222';

select is(
  (select count(*) from public.user_preferences where user_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'excluir a conta remove os dados de saúde por cascata'
);
select is(
  (select count(*) from public.app_access_grants where user_id = '22222222-2222-4222-8222-222222222222'),
  0::bigint,
  'excluir a conta remove a concessão de acesso'
);
select is(
  (select count(*) from public.access_requests where email_normalized = 'conta-b@example.test'),
  0::bigint,
  'excluir a conta remove também o e-mail da fila de acesso'
);
select is(
  (select status from public.access_requests where email_normalized = 'glicia.app@gmail.com'),
  'approved',
  'a conta institucional permanece pré-aprovada para assumir a administração'
);

insert into public.access_requests (email_normalized, status, last_requested_at)
values ('expirada@example.test', 'pending', now() - interval '91 days');

select ok(
  has_function_privilege('service_role', 'private.purge_expired_access_requests()', 'EXECUTE')
  and not has_function_privilege('authenticated', 'private.purge_expired_access_requests()', 'EXECUTE')
  and not has_function_privilege('anon', 'private.purge_expired_access_requests()', 'EXECUTE'),
  'somente service_role pode executar a retenção da fila'
);

set local role service_role;
select is(
  private.purge_expired_access_requests(),
  1,
  'a retenção remove solicitações sem conta após 90 dias'
);
reset role;

select * from finish();
rollback;
