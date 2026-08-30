# Plano de execução da PWA

Este documento transforma o [roadmap](roadmap.md) em uma sequência de trabalho. Ele detalha
`v0.2.0` a `v0.5.0` e mantém os marcos posteriores em nível progressivamente mais amplo. Não é
um compromisso de prazo: cada versão avança somente quando seu critério de saída estiver
atendido.

## Decisões confirmadas

- PWA mobile-first em TypeScript, React e Vite.
- Aplicação estática e client-side, sem backend, conta ou sincronização obrigatórios.
- CLI em Python preservada como produto utilizável e referência de comportamento.
- Desenvolvimento visual `code-first`: primeiro um fluxo navegável, depois refinamento visual.
- OpenAI com BYOK na primeira versão; outros modelos e provedores entram depois da paridade.
- Dados informados manualmente; sem integração com LibreLink, LibreView ou o sensor.
- Exportação, importação e backup manual dos dados locais no marco `v0.6.0`.

## Estratégia de entrega

O porte será vertical e incremental. Cada marco deve produzir uma versão demonstrável, sem
desativar a CLI e sem reescrever cálculo e segurança ao mesmo tempo que a interface.

1. Congelar o comportamento atual em contratos e testes executáveis.
2. Separar orquestração, domínio e integrações na implementação Python somente até o ponto
   necessário para testar o fluxo sem terminal ou rede.
3. Implementar o mesmo contrato em TypeScript.
4. Construir a conversa mobile sobre adaptadores substituíveis.
5. Adicionar onboarding e persistência antes de liberar o cálculo completo.
6. Atingir paridade e só então ampliar instalação, portabilidade, segurança e provedores.

Mudanças intencionais nas regras atuais devem ter documentação, caso de conformidade e revisão
próprios. Não devem entrar escondidas em uma tarefa de porte.

## Arquitetura-alvo mínima

```text
React/PWA ──> casos de uso da sessão ──> domínio puro
                 │                         ├─ configuração e validação
                 │                         ├─ turno e completude
                 │                         ├─ regras de segurança
                 │                         └─ cálculo determinístico
                 │
                 ├─ porta de IA ───────> adaptador OpenAI
                 └─ portas de dados ───> adaptadores IndexedDB/armazenamento seguro possível

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
   - ADR: PWA estática e BYOK sem backend obrigatório.
   - ADR: duas implementações de domínio verificadas por contrato.
   - Registrar como riscos abertos o armazenamento da chave e chamadas diretas ao provedor.

### Critério de saída

- Fluxo principal executável em testes sem terminal, rede ou banco real.
- Casos de conformidade versionados e aprovados na implementação Python.
- CLI continua funcionando e toda a suíte Python permanece verde.
- Nenhuma regra clínica foi alterada durante a extração.

## `v0.3.0` — Protótipo mobile-first da conversa

### Dependência

Começa somente depois que os contratos de `v0.2.0` estiverem estáveis.

### Pacotes de trabalho

1. **Fundação web**
   - Evoluir `apps/pwa` com TypeScript, React, Vite, testes unitários e manifesto PWA mínimo.
   - Configurar lint, typecheck, testes e build na CI ao lado do pipeline Python.
   - Adotar composição manual e estado da sessão com reducer; não adicionar biblioteca global
     de estado antes de surgir uma necessidade concreta.

2. **Domínio TypeScript**
   - Portar enums, validações, completude, ajuste de tendência, fórmula e arredondamento.
   - Executar as mesmas fixtures usadas pelo Python.
   - Proibir imports de React, navegador, rede ou armazenamento nessa camada.

3. **Caso de uso conversacional**
   - Implementar a máquina de estados com provedor fake primeiro.
   - Preservar mensagens entre turnos, correções e reinício ao finalizar uma refeição.
   - Manter o modo escolhido fixo durante uma refeição.

4. **Adaptador OpenAI e prova de viabilidade**
   - Implementar o schema estruturado e o prompt equivalentes ao Python.
   - Validar em navegadores móveis suportados se a chamada direta ao provedor é tecnicamente e
     contratualmente viável.
   - Usar no protótipo uma chave transitória informada na sessão; nunca embutir segredo em
     variável `VITE_*`, bundle, fixture, log ou captura de tela.
   - Se a chamada direta for inviável, interromper a publicação e abrir decisão explícita sobre
     proxy opcional ou implantação auto-hospedada; não adicionar backend silenciosamente.

5. **Interface da conversa**
   - Criar app shell, feed, compositor fixado, envio, espera, erro recuperável e nova refeição.
   - Renderizar Markdown permitido de forma segura.
   - Usar `input` ou `textarea` compatível com o ditado do teclado, sem gravação própria.
   - Garantir foco, teclado virtual, áreas seguras, zoom e uso com uma mão.

### Critério de saída

- PWA abre por URL no celular e o fluxo de vários turnos funciona com provedor fake.
- Adaptador real passa por uma prova controlada sem segredo no bundle.
- Casos de domínio produzem os mesmos resultados em Python e TypeScript.
- Estados de carregamento, erro e retomada são demonstráveis em viewport mobile.

## `v0.4.0` — Onboarding, configuração e BYOK

### Pacotes de trabalho

1. **Persistência versionada**
   - Criar schema IndexedDB com versão e migrações desde o primeiro release.
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
   - Implementar apresentação e limites, chave, parâmetros, cinco RICs, modo e revisão.
   - Salvar cada etapa válida e restaurar o ponto exato depois de fechar a aplicação.
   - Validar números finitos e as mesmas invariantes da CLI.
   - Bloquear a conversa enquanto faltar requisito obrigatório.

4. **Configurações visuais**
   - Permitir consultar e editar os valores com resumo antes de salvar.
   - Permitir validar, substituir e remover a chave.
   - Permitir reiniciar o onboarding sem apagar histórico.
   - Substituir `/mode`, `/config` e `/edit` por controles visuais acessíveis.

5. **Testes**
   - Cobrir primeiro acesso, abandono e retomada em cada etapa.
   - Cobrir chave ausente, inválida, substituída e removida.
   - Cobrir campos vazios, zero, negativos, infinito, `NaN`, separador decimal e valores
     extremos sem travar a tela.

### Critério de saída

- Uma pessoa sem terminal conclui a configuração obrigatória pelo celular.
- A conversa só é liberada com estado válido e confirmado.
- Atualizar ou fechar a página não perde o progresso já validado.
- Nenhuma credencial aparece em DOM persistente, URL, logs, histórico ou exportações.

## `v0.5.0` — Paridade funcional com a CLI

### Pacotes de trabalho

1. **Confirmação e correção**
   - Mostrar os quatro campos estruturados independentemente do Markdown da IA.
   - Exigir ação explícita para confirmar; uma negativa abre correção e retorna à coleta.
   - Impedir duplo envio, confirmação duplicada e cálculo com resposta antiga.

2. **Segurança e cálculo**
   - Bloquear cálculo abaixo do limite de hipoglicemia.
   - Mostrar o alerta específico de queda rápida abaixo de 100 mg/dL.
   - Calcular somente após confirmação e arredondar somente no resultado final.
   - Exibir entradas, RIC aplicado, ajuste da tendência, dose bruta e sugestão.

3. **Memória e histórico**
   - Persistir apenas atualizações alimentares explicitamente informadas ou confirmadas.
   - Criar registro imutável da refeição confirmada, parâmetros usados, modelo/provedor,
     resultado calculado e dose aplicada opcional.
   - Usar identificadores estáveis para permitir futura importação e deduplicação.

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

### `v0.6.0` — Persistência, portabilidade e instalação

- Estabilizar schema IndexedDB, migrações e rollback de atualização.
- Implementar cache do app shell e comportamento offline explícito; consultas à IA continuam
  exigindo rede.
- Orientar instalação conforme a plataforma, sem prometer instalação automática onde o
  navegador não oferece essa capacidade.
- Exportar configurações, memória e histórico em arquivo JSON com `schemaVersion`, versão do
  aplicativo e data de exportação; credenciais nunca entram no arquivo.
- Validar integralmente uma importação antes de gravar, mostrar resumo do conteúdo e criar um
  backup automático do estado anterior.
- Definir política de mesclagem e deduplicação por identificadores estáveis; qualquer opção de
  substituir tudo exige confirmação clara e caminho de recuperação.
- Testar exportação no dispositivo A e restauração no dispositivo B, incluindo arquivo antigo,
  inválido, parcialmente corrompido e de versão futura.

O primeiro backup será manual e local. Backup automático em nuvem ou sincronização entre
dispositivos exige conta ou provedor externo e permanece fora deste marco.

### `v0.7.0` — Segurança, privacidade e contingência

- Revisão independente do tratamento de credenciais e dados de saúde.
- Política de conteúdo, dependências e CSP restritivas; verificação de que logs e relatórios não
  carregam dados sensíveis.
- Exclusão seletiva e total de dados, com confirmação e explicação do que permanece.
- Modo manual sem IA para inserir carboidratos, glicemia, tendência e refeição diretamente.
- Documentação de privacidade e riscos revisada para navegador e PWA instalada.

### `v0.8.0` — Modelos e múltiplos provedores

- Transformar a porta já existente em registro de provedores, sem alterar domínio ou casos de
  uso.
- Credenciais isoladas por provedor e troca somente entre refeições.
- Lista curta de modelos aprovados, identificador avançado não validado e registro técnico do
  modelo usado.
- Avaliações repetíveis de schema, contagem, perguntas, modos, correções, memória, recusas de
  cálculo e situações de segurança.

### `v0.9.0` / RC — Beta fechada

- Matriz real de Android/iOS e navegadores suportados.
- Auditoria de acessibilidade, teclado, leitor de tela, contraste, zoom e redução de movimento.
- Rodadas observadas com usuários pilotos usando somente dados apropriados para teste.
- Correções de instalação, migração, importação e atualização encontradas na beta.
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
| Integração | Smoke test controlado | Adaptador real sem chave em CI ou logs |
| Qualidade | lint, typecheck e build | Falhas de compilação, tipos e bundle |

Testes de interface e documentação usam dados fictícios. Testes do provedor real não fazem
parte da CI de forks e nunca recebem credenciais de contribuidores automaticamente.

## Portões e riscos

| Portão | Deve estar resolvido antes de | Evidência esperada |
| --- | --- | --- |
| Chamada direta ao provedor no navegador | uso real da `v0.3.0` | spike em navegadores suportados e decisão registrada |
| Armazenamento da chave | persistência em `v0.4.0` | modelo de ameaça, UX de consentimento e revisão |
| Licença da tabela SBD | publicação pública da PWA | autorização ou estratégia de distribuição alternativa |
| Migração sem perda | `v0.6.0` | testes com todas as versões de schema suportadas |
| Exportação/importação | `v0.6.0` | formato versionado, validação e restauração demonstrada |
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

`v0.2.0` está em andamento. O manifesto, os schemas e as fixtures de cálculo, arredondamento,
tendência, configuração, turnos e segurança já possuem um consumidor Python. A avaliação das
travas foi extraída de `presentation/cli.py`, e o coordenador de sessão cobre coleta, correção, confirmação,
memória alimentar, nova tentativa e reinício. A CLI já consome esse coordenador pelo adaptador
`OpenAIResponsesClient`, enquanto os testes usam um provedor fake.

O próximo incremento deve levar o pós-confirmação para a camada de aplicação: avaliar segurança,
calcular, receber a dose aplicada e persistir um registro por uma porta de histórico fake. O
scaffold React continua aguardando a conclusão desse fluxo testável sem terminal, rede ou SQLite.
