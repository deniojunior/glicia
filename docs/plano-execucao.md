# Plano de execução da PWA

Este documento transforma o [roadmap](roadmap.md) em uma sequência de trabalho. Ele detalha
`v0.2.0` a `v0.8.0` e mantém os marcos posteriores em nível progressivamente mais amplo. Não é
um compromisso de prazo: cada versão avança somente quando seu critério de saída estiver
atendido.

## Decisões confirmadas

- PWA mobile-first em TypeScript, React e Vite.
- PWA autenticada, com Supabase Auth, PostgreSQL e Edge Functions como plataforma backend.
- CLI em Python preservada como produto utilizável e referência de comportamento.
- Desenvolvimento visual `code-first`: primeiro um fluxo navegável, depois refinamento visual.
- O BYOK entregue na primeira versão remota será substituído por uma chave central do projeto,
  armazenada somente nos secrets das Edge Functions e administrada pelo autor.
- Dados informados manualmente; sem integração com LibreLink, LibreView ou o sensor.
- Backup local entregue em `v0.6.0`; a partir de `v0.7.0`, os dados pertencem à conta e a
  recuperação do banco é responsabilidade operacional da infraestrutura.
- Acesso inicialmente fechado: a solicitação é pública, mas somente e-mails aprovados pelo autor
  podem criar uma conta e autenticar na aplicação.

### Replanejamento de arquitetura

A decisão original de PWA estática com chamada direta ao provedor foi superada após a validação
real no navegador. A partir da `v0.7.0`, Supabase é a plataforma de conta, PostgreSQL, Vault e
Edge Functions. A CLI continua local e não depende desse backend.

## Estratégia de entrega

O porte será vertical e incremental. Cada marco deve produzir uma versão demonstrável, sem
desativar a CLI e sem reescrever cálculo e segurança ao mesmo tempo que a interface.

1. Congelar o comportamento atual em contratos e testes executáveis.
2. Separar orquestração, domínio e integrações na implementação Python somente até o ponto
   necessário para testar o fluxo sem terminal ou rede.
3. Implementar o mesmo contrato em TypeScript.
4. Construir a conversa mobile sobre adaptadores substituíveis.
5. Adicionar onboarding e persistência antes de liberar o cálculo completo.
6. Atingir paridade, introduzir a plataforma autenticada e só então ampliar segurança e provedores.

Mudanças intencionais nas regras atuais devem ter documentação, caso de conformidade e revisão
próprios. Não devem entrar escondidas em uma tarefa de porte.

## Arquitetura-alvo mínima

```text
React/PWA ──> Supabase Auth ──> Edge Functions ──> casos de uso ──> domínio puro
                 │                         ├─ configuração e validação
                 │                         ├─ turno e completude
                 │                         ├─ regras de segurança
                 │                         └─ cálculo determinístico
                 │
                 ├─ porta de IA ───────> adaptador OpenAI no backend
                 └─ portas de dados ───> adaptadores PostgreSQL

CLI/Rich ──> aplicação Python equivalente ──> domínio Python atual
                         │
                         └──────── contratos de conformidade compartilhados ────────┘
```

A arquitetura não exige que Python e TypeScript compartilhem código executável. Eles
compartilham contratos, schemas e casos esperados. Isso mantém o navegador independente de um
servidor Python e torna divergências observáveis.

Estrutura atual do monorepo:

```text
apps/
  cli/
    src/glicia/            # implementação Python separada por camadas
    tests/                 # testes Python e consumidor dos contratos
  pwa/
    src/                   # domínio, aplicação, adaptadores e interface TypeScript
packages/
  contracts/
    schemas/               # turno, configuração, registro e backup
    fixtures/              # cálculo, segurança, conversa e persistência
```

As portas iniciais serão somente as que criam isolamento real:

- `AiProvider`: recebe mensagens e contexto neutros e devolve um turno estruturado; detalhes
  como `previous_response_id` ficam dentro do adaptador.
- `SettingsRepository`: onboarding, parâmetros, modo e configuração do provedor.
- `FoodMemoryRepository`: preferências alimentares confirmadas.
- `HistoryRepository`: refeições confirmadas e dose aplicada.

Não serão introduzidos microserviços, CQRS, event sourcing, barramento de eventos ou um
framework de injeção de dependência. Composição manual é suficiente para esta fase.

## Máquina de estados da sessão

A conversa precisa ser modelada fora dos componentes React para impedir que regras de fluxo se
espalhem pela interface:

```text
unconfigured
    ↓ onboarding concluído
ready
    ↓ mensagem inicial
collecting ── resposta incompleta ──> collecting
    ↓ quatro campos completos
awaiting_confirmation
    ├─ corrigir ──> collecting
    ├─ glicemia abaixo do limite ──> blocked_by_hypoglycemia
    └─ confirmar ──> calculated
                         ↓
                 awaiting_applied_dose
                         ↓
                      completed
```

Erros de autenticação, rede, limite, modelo e resposta inválida não apagam a sessão. A troca de
modelo ou provedor só produz efeito em uma nova refeição.

## `v0.2.0` — Contrato de comportamento

### Objetivo

Tornar explícito e testável tudo que precisa permanecer igual entre CLI e PWA.

### Pacotes de trabalho

1. **Inventário de comportamento**
   - Registrar entradas, estados e saídas do fluxo atual.
   - Incluir primeira mensagem, turnos incompletos, correção, confirmação, hipoglicemia,
     queda rápida, cálculo, dose aplicada e encerramento da refeição.
   - Separar texto de apresentação de decisões observáveis do domínio.

2. **Contratos neutros**
   - Criar schemas versionados para `ConversationTurn`, `ClinicalSettings`, `MealRecord` e erros
     classificados de provedor.
   - Criar fixtures JSON para validação numérica, faixas de tendência, arredondamento,
     completude e bloqueios.
   - Usar apenas dados fictícios e nunca incluir chaves ou dados reais do piloto.

3. **Aplicação Python testável**
   - Extrair de `presentation/cli.py` um coordenador de sessão que não importe Rich, `prompt_toolkit`, SQLite
     nem cliente HTTP.
   - Introduzir uma porta mínima de IA e um adaptador fake para testes de múltiplos turnos.
   - Manter `presentation/ui.py` e `presentation/cli.py` como adaptadores de entrada, sem alterar a experiência existente.

4. **Caracterização e regressão**
   - Cobrir precedência e validação de parâmetros, memória alimentar, confirmação e correção.
   - Cobrir o registro completo salvo no histórico.
   - Fazer a suíte Python consumir as fixtures compartilhadas.

5. **Decisões registradas**
   - ADR: PWA estática e BYOK sem backend obrigatório (substituída pela arquitetura Supabase na
     `v0.7.0`).
   - ADR: duas implementações de domínio verificadas por contrato.
   - Registrar como riscos abertos o armazenamento da chave e chamadas diretas ao provedor.

### Critério de saída

- Fluxo principal executável em testes sem terminal, rede ou banco real.
- Casos de conformidade versionados e aprovados na implementação Python.
- CLI continua funcionando e toda a suíte Python permanece verde.
- Nenhuma regra clínica foi alterada durante a extração.

## `v0.3.0` — Protótipo mobile-first da conversa (concluído)

### Dependência

Começa somente depois que os contratos de `v0.2.0` estiverem estáveis.

### Pacotes de trabalho

1. **Fundação web**
   - Evoluir `apps/pwa` com TypeScript, React, Vite, testes unitários e manifesto PWA mínimo. ✅
   - Configurar lint, typecheck, testes e build na CI ao lado do pipeline Python. ✅
   - Adotar composição manual e estado da sessão com reducer; não adicionar biblioteca global
     de estado antes de surgir uma necessidade concreta.

2. **Domínio TypeScript**
   - Portar enums, validações, completude, ajuste de tendência, fórmula e arredondamento. ✅
   - Executar as mesmas fixtures usadas pelo Python. ✅
   - Proibir imports de React, navegador, rede ou armazenamento nessa camada.

3. **Caso de uso conversacional**
   - Implementar a máquina de estados com provedor fake primeiro. ✅
   - Preservar mensagens entre turnos, correções e reinício ao finalizar uma refeição. ✅
   - Manter o modo escolhido fixo durante uma refeição. ✅

4. **Adaptador OpenAI e prova de viabilidade**
   - Implementar o schema estruturado compatível com o contrato e uma porta isolada que receba
     as instruções da composição da aplicação. ✅
   - Validar o contrato HTTP sem rede real: `store: false`, saída JSON Schema, continuação de
     contexto apenas no adaptador e classificação de falhas. ✅
   - Usar no protótipo uma chave transitória informada na sessão; nunca embutir segredo em
     variável `VITE_*`, bundle, fixture, log ou captura de tela. ✅
   - Se a chamada direta for inviável, interromper a publicação e abrir decisão explícita sobre
     proxy opcional ou implantação auto-hospedada; não adicionar backend silenciosamente.

5. **Interface da conversa**
   - Criar app shell, feed, compositor fixado, envio, espera, erro recuperável e nova refeição. ✅
   - Renderizar Markdown permitido de forma segura, sem HTML bruto. ✅
   - Usar `input` ou `textarea` compatível com o ditado do teclado, sem gravação própria.
   - Garantir foco, teclado virtual, áreas seguras, zoom e uso com uma mão.

### Critério de saída

- PWA abre por URL no celular e o fluxo de vários turnos funciona com provedor fake.
- Adaptador OpenAI passa por prova controlada automatizada sem segredo no bundle; a chamada
  direta com uma chave real fica deliberadamente fora deste release, até existir a tela de
  configuração transitória do `v0.4.0`.
- Casos de domínio produzem os mesmos resultados em Python e TypeScript.
- Estados de carregamento, erro e retomada são demonstráveis em viewport mobile.

## `v0.4.0` — Onboarding, configuração e BYOK (concluído)

### Pacotes de trabalho

1. **Persistência versionada**
   - Criar schema IndexedDB com versão desde o primeiro release. ✅
   - Separar credencial, configurações clínicas, preferências e progresso do onboarding.
   - Manter repositórios em memória para testes rápidos e determinísticos.

2. **Decisão de segurança da chave**
   - Documentar modelo de ameaça para dispositivo compartilhado, XSS, extensões, backup e
     ferramentas do navegador.
   - Começar com chave somente na sessão e oferecer persistência apenas após decisão e aviso
     explícitos. IndexedDB, `localStorage` e Web Crypto não devem ser descritos como proteção
     suficiente contra código executado na mesma origem.
   - Garantir exclusão de credenciais em histórico, exportações, erros e telemetria.

3. **Onboarding retomável**
   - Implementar apresentação, chave transitória, cinco RICs, modo e revisão. ✅
   - Salvar cada etapa válida e restaurar o ponto exato depois de fechar a aplicação. ✅
   - Validar números finitos e as mesmas invariantes da CLI.
   - Bloquear a conversa enquanto faltar requisito obrigatório.

4. **Configurações visuais**
   - Permitir consultar e editar RICs, modelo e modo. ✅
   - Permitir validar, substituir e remover a chave.
   - Permitir reiniciar o onboarding sem apagar histórico.
   - Substituir `/mode`, `/config` e `/edit` por controles visuais acessíveis.

5. **Testes**
   - Cobrir primeiro acesso, abandono e retomada em cada etapa.
   - Cobrir chave ausente, inválida, substituída e removida.
   - Cobrir campos vazios, zero, negativos, infinito, `NaN`, separador decimal e valores
     extremos sem travar a tela.

### Critério de saída

- Uma pessoa sem terminal conclui a configuração obrigatória pelo celular. ✅
- A conversa só é liberada com chave transitória e estado válido. ✅
- Atualizar ou fechar a página não perde o progresso já validado; a chave é pedida novamente. ✅
- Nenhuma credencial aparece em armazenamento persistente, URL, logs, histórico ou exportações. ✅

## `v0.5.0` — Paridade funcional com a CLI (concluído)

### Pacotes de trabalho

1. **Confirmação e correção**
   - Mostrar os quatro campos estruturados independentemente do Markdown da IA.
   - Exigir ação explícita para confirmar; uma negativa abre correção e retorna à coleta. ✅
   - Impedir duplo envio, confirmação duplicada e cálculo com resposta antiga.

2. **Segurança e cálculo**
   - Bloquear cálculo abaixo do limite de hipoglicemia. ✅
   - Mostrar o alerta específico de queda rápida abaixo de 100 mg/dL. ✅
   - Calcular somente após confirmação e arredondar somente no resultado final. ✅
   - Exibir entradas, RIC aplicado, ajuste da tendência, dose bruta e sugestão.

3. **Memória e histórico**
   - Persistir apenas atualizações alimentares explicitamente informadas ou confirmadas.
   - Criar registro imutável da refeição confirmada, parâmetros usados, modelo/provedor,
     resultado calculado e dose aplicada opcional.
   - Usar identificadores estáveis para permitir futura sincronização e deduplicação. ✅

4. **Fluxo completo e falhas**
   - Reiniciar o contexto do provedor ao concluir ou bloquear uma refeição.
   - Preservar rascunho diante de falhas de rede e respostas inválidas.
   - Oferecer nova tentativa sem executar o cálculo duas vezes nem duplicar histórico.

5. **Validação cruzada**
   - Rodar contratos em Python e TypeScript na mesma CI.
   - Criar E2E do caminho feliz, correção, hipoglicemia, erro do provedor e dose não informada.
   - Fazer uma comparação manual com a CLI usando dados fictícios documentados.

### Critério de saída

- Todos os casos de conformidade têm o mesmo resultado observável na CLI e na PWA.
- Histórico contém somente refeições confirmadas e não duplica registros em novas tentativas.
- O fluxo completo funciona em viewport mobile com teclado virtual.
- Nenhuma regressão clínica ou funcional conhecida permanece aberta.

## Marcos posteriores

### `v0.6.0` — Persistência, portabilidade e instalação (concluído)

- Schema IndexedDB compartilhado entre preferências e histórico, com abertura versionada. ✅
- App shell pré-cacheado; a interface deixa implícito que consultas à IA continuam exigindo rede. ✅
- Instalação orientada no primeiro acesso, com prompt nativo quando houver suporte e caminho
  manual para Safari no iPhone. ✅
- Exportação de configurações, memória e histórico em JSON com `schemaVersion`, versão do app e
  data; credenciais nunca entram no arquivo. ✅
- Validação integral do arquivo, resumo e backup automático do estado anterior antes da
  substituição. ✅
- Política inicial: substituição total explícita. Registros preservam identificadores estáveis;
  mesclagem e deduplicação ficam para uma evolução posterior. ✅
- Cobertura automatizada para versão futura, conteúdo inválido e restauração validada. A prova
  manual entre dois dispositivos continua parte da validação de beta. ✅

O primeiro backup será manual e local. Backup automático em nuvem ou sincronização entre
dispositivos exige conta ou provedor externo e permanece fora deste marco.

### `v0.7.0` — Plataforma Supabase, conta e BYOK seguro (concluído)

1. **Infraestrutura como código**
   - Criar `supabase/config.toml`, migrations SQL imperativas, Edge Functions, dados fictícios de
     desenvolvimento e testes de RLS no repositório. ✅
   - Vincular o projeto vazio `snsdnxlwdhadrehksati` somente pela CLI; usar `db push --dry-run`
     antes de toda aplicação remota. ✅
   - Manter URL pública, chaves de publicação e segredos em variáveis de ambiente; nunca em
     migrations, bundle ou Git. ✅

2. **Conta e dados por pessoa**
   - Integrar Supabase Auth por link ou código mágico e exigir sessão válida antes do onboarding. ✅
   - Persistir preferências, memória e refeições em PostgreSQL com `user_id`, RLS,
     índices de acesso por pessoa e testes explícitos de permitir/negar. ✅

3. **Conexão BYOK e proxy de IA**
   - Criar a conexão OpenAI por Edge Function: validar chave, cifrar no Vault, guardar apenas
     metadados visíveis e permitir sua substituição. A remoção fica no marco de privacidade da
     `v0.8.0`. ✅
   - Mover o adaptador Responses para a Edge Function e retirar a chamada direta da PWA. ✅
   - Validar JWT no servidor e nunca confiar em `user_id` enviado no corpo da requisição. ✅

4. **PWA e transição**
   - Substituir IndexedDB como fonte principal por adaptadores HTTP autenticados; manter apenas
     rascunho efêmero quando fizer sentido. ✅
   - Converter onboarding, configurações e histórico para os endpoints autenticados. ✅
   - Manter a CLI independente e local; não migrar automaticamente os seus dados. ✅

### Critério de saída

- Uma pessoa entra por e-mail, conecta a própria chave e conversa sem chamada direta do navegador
  à OpenAI.
- Dados de duas contas não podem ser lidos ou alterados entre si em testes de RLS.
- Uma instalação `supabase db reset` reproduz o banco e as funções com dados fictícios.
- Migrations e restauração operacional são reproduzíveis em ambiente isolado, sem incluir credenciais.

### `v0.8.0` — Acesso experimental controlado (concluído)

#### Objetivo

Permitir que uma pessoa solicite participação na Glicia sem criar uma conta automaticamente e
que o autor aprove ou rejeite essa solicitação em um fluxo autenticado, auditável e reproduzível
no ambiente local.

#### Pacotes de trabalho

1. **Solicitação pública**
   - Criar `access_requests` com e-mail normalizado, estado `pending`, `approved` ou `rejected`,
     datas de solicitação e revisão, responsável pela decisão e vínculo posterior ao usuário.
   - Habilitar RLS e impedir acesso direto de `anon` e `authenticated`; a entrada pública passa
     somente pela Edge Function `request-access`.
   - Validar, normalizar, deduplicar e limitar solicitações repetidas, respondendo de forma neutra
     para não revelar quais endereços já existem.

2. **Revisão administrativa**
   - Criar `app_admins`, inicialmente com a conta do autor, sem usar `user_metadata` como fonte de
     autorização.
   - Enviar a nova solicitação para `deniofriacamoreirajr@gmail.com` com link para uma página
     administrativa autenticada.
   - O link apenas abre a revisão; aprovação e rejeição exigem ação explícita por `POST`, evitando
     decisões acidentais causadas por scanners de e-mail.
   - Registrar decisão, responsável e horário, com operações idempotentes para cliques e novas
     tentativas repetidas.

3. **Bloqueio e concessão de acesso**
   - Configurar o hook `Before User Created` do Supabase Auth para permitir novas contas somente
     quando o e-mail normalizado estiver aprovado.
   - Vincular a aprovação ao `user_id` estável depois do primeiro login e exigir essa concessão
     nas políticas de acesso aos dados, além da sessão autenticada.
   - Auditar as contas já existentes antes de habilitar o bloqueio, pois o hook protege somente
     novas criações.
   - Manter o login sem senha por magic link ou OTP e liberar o onboarding apenas depois da
     autenticação e da verificação da concessão.

4. **Notificações por e-mail**
   - Definir uma porta de notificação independente do provedor.
   - Usar Mailpit no ambiente local e um adaptador transacional, inicialmente Resend, em produção.
   - Enviar ao usuário a aprovação com um caminho claro para entrar; uma rejeição poderá ser
     notificada conforme a política definida antes da implementação.
   - Manter chaves do provedor de e-mail somente nos secrets das Edge Functions e nunca no bundle,
     banco, logs ou migrations.

5. **Interface e testes**
   - Separar visualmente “Solicitar acesso” de “Já tenho acesso”, com estados de envio, espera,
     aprovação pendente e erro recuperável.
   - Cobrir solicitação nova e repetida, aprovação, rejeição, revisão sem privilégio, scanner que
     abre o link, login aprovado, bloqueio não aprovado e repetição idempotente.
   - Executar os fluxos localmente com Supabase CLI e Mailpit e testar RLS com duas contas e um
     usuário anônimo.

#### Arquitetura mínima do fluxo

```text
PWA pública ──> request-access ──> AccessRequest ──> PostgreSQL
                                      │
                                      └─ NotificationPort ──> Mailpit | Resend

Administrador autenticado ──> review-access-request ──> aprovar/rejeitar
                                                            │
Usuário ──> Supabase Auth ──> Before User Created Hook ─────┘
                  │
                  └─ concessão aprovada por user_id ──> onboarding e dados da conta
```

Os casos de uso serão `RequestAccess`, `ReviewAccessRequest`, `CheckApprovedAccess` e
`SendLoginLink`. PostgreSQL, Supabase Auth e o serviço de e-mail serão adaptadores; não serão
introduzidos CQRS, event sourcing ou microserviços para esse fluxo.

#### Critério de saída

- Uma pessoa não aprovada consegue apenas solicitar acesso e não consegue criar conta, entrar no
  onboarding ou acessar dados protegidos.
- O autor recebe a solicitação, autentica-se, revisa e toma uma decisão explícita e auditável.
- Uma pessoa aprovada recebe a liberação, entra por e-mail e prossegue para o onboarding.
- Repetições e falhas parciais não duplicam solicitações, decisões, contas ou notificações.
- O fluxo completo funciona localmente com Docker Compose/Supabase CLI e Mailpit, e em produção
  sem expor chaves administrativas ou do provedor de e-mail.

### `v0.9.0` — Credencial central, segurança, CI/CD, privacidade e contingência

- Substituir o BYOK pela chave central da OpenAI nos secrets das Edge Functions. ✅
- Remover chave, provedor e modelo do onboarding e das configurações da pessoa. ✅
- Manter a porta de IA neutra e selecionar provedor e modelo na composição do backend. ✅
- Ler a credencial e o modelo dos secrets de `ai-chat`, devolvendo metadados técnicos para o
  histórico sem expor a chave. ✅
- Após validar a transição, remover conexões BYOK e segredos individuais sem alterar o histórico
  técnico de provedor e modelo das refeições já registradas. ✅
- Revisar modelo de ameaça, rotação da credencial central, RLS, CSP, dependências e logs. ✅
- Implementar exclusão seletiva e total por conta, política de retenção e procedimento testado de
  recuperação operacional. ✅
- Criar modo manual sem IA para inserir carboidratos, glicemia, tendência e refeição diretamente. ✅
- Documentar recuperação de conta, indisponibilidade do provedor, falha de rede e limites da
  sincronização. ✅
- Evoluir o GitHub Actions de CI para validar CLI, PWA, contratos, migrations, RLS e Edge Functions
  em pull requests e na branch principal. ✅
- Criar CD para publicar automaticamente o Supabase e a PWA em staging somente depois da CI. ✅
- Configurar promoção para produção por tag em um GitHub Environment protegido por aprovação
  manual, sem compartilhar credenciais entre ambientes. ✅
- Garantir permissões mínimas, isolamento de secrets e nenhuma credencial de deploy disponível em
  workflows executados a partir de forks. ✅

Limites próprios de consumo, classificação de intenção e guardrails contra prompt injection não
fazem parte deste marco. O piloto aceita temporariamente esse risco porque o acesso permanece
restrito a pessoas próximas aprovadas pelo autor.

### `v0.10.0` — Acesso fluido e histórico contextual

Implementação concluída em 2026-09-05. O staging usa o remetente verificado
`Glicia <acesso@glicia.app>`; o magic link permanece como contingência operacional do fluxo de
entrada.

- Substituir o seletor da entrada por um único campo de e-mail e um caso de uso que diferencie
  acesso aprovado, solicitação ausente, pendente, recusada e revogada.
- Pedir confirmação antes de incluir um novo endereço na lista e impedir duplicação quando já
  existir uma solicitação pendente.
- Trocar o magic link principal por OTP digitável dentro da PWA, mantendo link apenas como
  contingência, sessão renovável e retorno explícito ao app instalado.
- Limitar tentativas e revisar o risco de enumeração de e-mails antes de expor estados de admissão.
- Executar uma prova de viabilidade de passkeys/WebAuthn com Supabase, iOS/Safari e
  Android/Chrome; biometria permanece no dispositivo e não é armazenada pela Glicia.
- Criar uma consulta de histórico por intervalo temporal, fuso e tipo de refeição, sempre limitada
  à conta autenticada e coberta por RLS.
- Resolver expressões como “a mesma coisa que ontem” para candidatos reais, pedir escolha quando
  houver ambiguidade e confirmar alimentos, porções, data e carboidratos antes de reutilizar.
- Recolher glicemia e tendência atuais e recalcular a sugestão pelas regras vigentes; nunca copiar
  a dose sugerida ou aplicada do registro anterior.
- Evoluir o contrato do registro para preservar uma composição estruturada reutilizável, com
  migration retrocompatível para registros antigos que tenham somente resumo textual.

### `v0.11.0` — Modelos e múltiplos provedores

- Transformar a porta de IA em registro de provedores sem alterar domínio ou casos de uso.
- Isolar as credenciais centrais por provedor nos secrets do backend e aplicar troca somente entre
  refeições.
- Oferecer uma lista administrativa de modelos aprovados e registrar tecnicamente o modelo usado.
- Executar avaliações repetíveis de schema, contagem, perguntas, modos, correções, memória,
  recusas de cálculo e situações de segurança.

### `v0.12.0` — Limites de uso e guardrails de IA

- Implementar quotas diárias por pessoa, limite global de custo e limite de concorrência.
- Adicionar suspensão administrativa e mecanismo de interrupção emergencial.
- Tornar as instruções do sistema autoritativas no backend e mitigar prompt injection.
- Restringir o uso ao fluxo de contagem de carboidratos e rejeitar desvio de finalidade.
- Limitar entrada e saída, validar o schema no backend e registrar somente métricas não sensíveis.
- Manter uma suíte de avaliações de abuso e regressão antes de ampliar o piloto.

### `v0.13.0` / Beta fechada

- Matriz real de Android/iOS e navegadores suportados.
- Auditoria de acessibilidade, teclado, leitor de tela, contraste, zoom e redução de movimento.
- Rodadas observadas com usuários pilotos usando somente dados apropriados para teste.
- Correções de instalação, autenticação, persistência e atualização encontradas na beta.
- Congelamento de contratos e checklist de release candidate.

### `v1.0.0` — PWA estável

- Fluxo principal, onboarding, persistência, instalação e recuperação documentados.
- Política de compatibilidade e migrações definida.
- Nenhum problema crítico de cálculo, segurança, privacidade, acessibilidade ou perda de dados.
- CLI e PWA com responsabilidades e suporte explicitamente documentados.

## Sequência inicial de pull requests

Para manter revisões pequenas, o trabalho pode começar nesta ordem:

1. Adicionar schemas e fixtures de conformidade, sem refatorar produção.
2. Fazer os testes Python consumirem os casos de cálculo, configuração e segurança.
3. Extrair coordenador de sessão e porta fake de IA da CLI.
4. Cobrir conversa incompleta, correção, confirmação e falhas com testes da aplicação.
5. Adicionar ADRs da PWA client-side e do contrato entre linguagens.
6. Evoluir `apps/pwa` com pipeline de qualidade e uma tela vazia acessível.
7. Portar domínio TypeScript e executar fixtures compartilhadas.
8. Implementar máquina de estados com provedor fake.
9. Construir a primeira conversa mobile navegável.
10. Executar a prova de viabilidade do adaptador OpenAI no navegador.

Cada PR deve fazer uma mudança conceitual, manter Python e web verdes e atualizar a
documentação afetada.

## Estratégia de testes e CI

| Nível | Ferramenta ou abordagem | Responsabilidade |
| --- | --- | --- |
| Contrato | Fixtures JSON compartilhadas | Paridade Python/TypeScript e migrações |
| Domínio Python | `pytest` | Cálculo, validação e comportamento da CLI |
| Domínio web | Vitest | Regras puras e máquina de estados |
| Componentes | Testing Library | Formulários, foco, erros e semântica |
| Fluxo | Playwright com provedor fake | Onboarding e refeição completa no navegador |
| Banco e autorização | Supabase CLI + testes SQL de RLS | Migrations reproduzíveis e isolamento absoluto por `user_id` |
| Edge Functions | Deno/Supabase CLI com OpenAI fake | JWT, classificação de erros e ausência de chave em logs |
| Integração | Smoke test controlado | Caminho PWA → Edge Function sem chave real em CI ou logs |
| Qualidade | lint, typecheck e build | Falhas de compilação, tipos e bundle |

Testes de interface e documentação usam dados fictícios. Testes do provedor real não fazem
parte da CI de forks e nunca recebem credenciais de contribuidores automaticamente.

## Portões e riscos

| Portão | Deve estar resolvido antes de | Evidência esperada |
| --- | --- | --- |
| Chamada ao provedor | `v0.7.0` | Edge Function autenticada, sem CORS e sem chave no navegador |
| Credencial BYOK | `v0.7.0` | Vault, remoção/rotação, modelo de ameaça e revisão |
| Isolamento por conta | `v0.7.0` | RLS com casos explícitos de permitir/negar para todas as tabelas |
| Admissão controlada | `v0.8.0` | hook de criação, revisão administrativa autenticada e concessão por `user_id` testados localmente |
| Credencial central | `v0.9.0` | secret apenas no backend, BYOK removido da experiência e migração verificada |
| CI/CD | `v0.9.0` | PR sem secrets, CI completa, staging automático e produção com aprovação manual |
| Limites e guardrails | ampliação do piloto | quotas, interrupção emergencial e avaliações de abuso aprovadas |
| Entrada única e OTP | beta fechada | estados de admissão, rate limit, OTP na PWA e recuperação testados em dispositivos reais |
| Reutilização do histórico | beta fechada | seleção temporal determinística, confirmação e recálculo sem copiar dose anterior |
| Licença da tabela SBD | publicação pública da PWA | autorização ou estratégia de distribuição alternativa |
| Persistência e recuperação | `v0.9.0` | migrations reproduzíveis e restauração operacional testada em ambiente isolado |
| Privacidade e enquadramento | ampliação além do piloto | documentação e avaliação apropriadas |
| Compatibilidade móvel | RC | matriz real de dispositivos e navegadores |

## Definição de pronto por entrega

Uma tarefa só está concluída quando:

- possui critérios de aceite reproduzíveis;
- não move cálculo ou travas para IA ou componentes React;
- inclui testes proporcionais ao risco e mantém os contratos verdes;
- trata carregamento, vazio, erro, sucesso e repetição quando aplicável;
- não registra chave, glicemia, refeição ou histórico em logs e fixtures;
- funciona no menor viewport móvel suportado e com zoom de texto;
- atualiza documentação, schema e migração quando altera dados persistidos;
- foi verificada em uma rodada de inspeção mobile e desktop, sem polimento infinito.

## Próximo incremento recomendado

A `v0.10.0-alpha` concluiu a entrada única e a reutilização segura de refeições do histórico. O
próximo incremento é a `v0.11.0-alpha`: cadastrar modelos e múltiplos provedores administrados sem
expor credenciais ao navegador. Limites e guardrails permanecem obrigatórios na
`v0.12.0-alpha`, antes de ampliar o piloto fechado.
