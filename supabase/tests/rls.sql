begin;
select plan(66);

select is((select array_agg(email_normalized) from private.bootstrap_admin_emails), array['glicia.app.admin@gmail.com']::text[], 'somente a conta administrativa recebe privilégios no primeiro login');
select is((select status from public.access_requests where email_normalized = 'glicia.app@gmail.com'), 'rejected', 'a conta de comunicação não tem acesso');
select is((select status from public.access_requests where email_normalized = 'deniofriacamoreirajr@gmail.com'), 'approved', 'a conta pessoal permanece como piloto aprovado');

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
  (select status from public.access_requests where email_normalized = 'glicia.app.admin@gmail.com'),
  'approved',
  'a conta administrativa exclusiva permanece pré-aprovada'
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

select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'meal_records' and column_name = 'meal_items'
  ),
  'o histórico armazena os itens estruturados da refeição'
);
select ok(
  (select is_nullable = 'NO' and column_default = '''[]''::jsonb'
   from information_schema.columns
   where table_schema = 'public' and table_name = 'meal_records' and column_name = 'meal_items'),
  'itens da refeição são obrigatórios e registros antigos recebem uma lista vazia'
);
select ok(
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.meal_records'::regclass
      and conname = 'meal_records_meal_items_array'
      and contype = 'c'
  ),
  'meal_items possui uma restrição de formato no banco'
);
select ok(
  to_regclass('public.meal_records_user_type_created_idx') is not null,
  'a consulta contextual possui índice por pessoa, tipo e data'
);
select ok(
  has_function_privilege('service_role', 'public.access_entry_state_from_edge(text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.access_entry_state_from_edge(text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.access_entry_state_from_edge(text,text)', 'EXECUTE'),
  'somente service_role consulta o estado de entrada por e-mail'
);

insert into public.access_requests (email_normalized, status, reviewed_at)
values ('recusada@example.test', 'rejected', now());

select is(public.access_entry_state_from_edge('nova@example.test', repeat('1', 64)), 'new', 'um e-mail desconhecido inicia como novo');
select is(public.access_entry_state_from_edge('conta-bloqueada@example.test', repeat('2', 64)), 'pending', 'uma solicitação existente permanece pendente');
select is(public.access_entry_state_from_edge('recusada@example.test', repeat('3', 64)), 'rejected', 'uma solicitação recusada não volta à lista');
select is(public.access_entry_state_from_edge('candidato@example.test', repeat('4', 64)), 'approved', 'uma aprovação sem conta já permite o envio do código');
select is(public.access_entry_state_from_edge('CONTA-A@example.test', repeat('5', 64)), 'approved', 'uma conta com concessão ativa é reconhecida com e-mail normalizado');

insert into public.app_access_grants (user_id, access_request_id)
values ('33333333-3333-4333-8333-333333333333', (select id from public.access_requests where email_normalized = 'conta-bloqueada@example.test'));

select ok(to_regclass('private.ai_runtime_config') is not null and to_regclass('private.ai_request_metrics') is not null, 'configuração e métricas de IA ficam no schema privado');
select ok(
  has_function_privilege('service_role', 'public.reserve_ai_request_from_edge(uuid,integer)', 'EXECUTE')
  and has_function_privilege('service_role', 'public.finish_ai_request_from_edge(uuid,uuid,text,integer,integer,integer,integer,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'public.reserve_ai_request_from_edge(uuid,integer)', 'EXECUTE'),
  'operações de consumo de IA são exclusivas do service_role'
);

set local role service_role;
select is((select allowed from public.reserve_ai_request_from_edge('11111111-1111-4111-8111-111111111111', 500)), true, 'uma conta ativa reserva uma análise');
reset role;
select is((select status from private.ai_request_metrics order by started_at desc limit 1), 'active', 'a reserva registra somente metadados operacionais');

select is(public.finish_ai_request_from_edge(
  (select request_id from private.ai_request_metrics where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  '11111111-1111-4111-8111-111111111111', 'completed', 300, 100, 50, 750, null
), true, 'a Edge Function conclui a própria reserva');
select ok(
  (select input_tokens = 100 and output_tokens = 50 and latency_ms = 750 and estimated_cost_microusd = 45
   from private.ai_request_metrics where user_id = '11111111-1111-4111-8111-111111111111' order by started_at desc limit 1),
  'métricas guardam tokens, custo e latência, sem conteúdo da conversa'
);

set local role service_role;
select is((select tokens_today from public.ai_admin_controls_from_edge('11111111-1111-4111-8111-111111111111')), 150::bigint, 'o painel agrega tokens do dia');
select is((select estimated_cost_month_microusd from public.ai_admin_controls_from_edge('11111111-1111-4111-8111-111111111111')), 45::bigint, 'o painel agrega custo do mês');
select is((select average_cost_per_analysis_microusd from public.ai_admin_controls_from_edge('11111111-1111-4111-8111-111111111111')), 45::bigint, 'o painel calcula custo médio por análise concluída');
select is((select active_users_month from public.ai_admin_controls_from_edge('11111111-1111-4111-8111-111111111111')), 1::bigint, 'o painel informa pessoas ativas no mês sem expor conteúdo');
select throws_ok(
  $$select * from public.ai_admin_controls_from_edge('33333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'uma pessoa não administradora não acessa métricas'
);
select is(public.set_app_access_from_edge('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', true), true, 'a administração suspende uma conta');
select is((select denial_code from public.reserve_ai_request_from_edge('33333333-3333-4333-8333-333333333333', 100)), 'suspended', 'uma conta suspensa não consome IA');
select is(public.set_app_access_from_edge('11111111-1111-4111-8111-111111111111', '33333333-3333-4333-8333-333333333333', false), false, 'a administração reativa uma conta');
select is(public.update_ai_runtime_from_edge('11111111-1111-4111-8111-111111111111', false), false, 'a administração aciona a pausa emergencial');
select is((select denial_code from public.reserve_ai_request_from_edge('11111111-1111-4111-8111-111111111111', 100)), 'disabled', 'a pausa emergencial bloqueia novas chamadas');
select public.update_ai_runtime_from_edge('11111111-1111-4111-8111-111111111111', true);
reset role;

update private.ai_runtime_config set per_user_daily_request_limit = 1;
set local role service_role;
select is((select denial_code from public.reserve_ai_request_from_edge('11111111-1111-4111-8111-111111111111', 100)), 'user_daily_limit', 'a quota diária por pessoa é aplicada atomicamente');
reset role;
update private.ai_runtime_config set per_user_daily_request_limit = 40;

insert into private.ai_request_metrics (user_id, input_chars, status, expires_at, finished_at, started_at)
values ('11111111-1111-4111-8111-111111111111', 1, 'failed', now(), now(), now() - interval '91 days');
set local role service_role;
select is(private.purge_ai_request_metrics(), 1, 'métricas operacionais são removidas após 90 dias');
reset role;

update public.app_access_grants
set revoked_at = now()
where user_id = '11111111-1111-4111-8111-111111111111';

select is(public.access_entry_state_from_edge('conta-a@example.test', repeat('6', 64)), 'revoked', 'uma concessão revogada bloqueia uma conta existente');

do $$
begin
  for attempt in 1..10 loop
    perform public.access_entry_state_from_edge('limite@example.test', repeat('7', 64));
  end loop;
end;
$$;

select is(
  public.access_entry_state_from_edge('limite@example.test', repeat('7', 64)),
  'rate_limited',
  'a consulta pública limita tentativas repetidas sem armazenar o e-mail em texto aberto'
);

select * from finish();
rollback;
