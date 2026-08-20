# Implementation Plan: LLM_Food_Resolution

## Overview

Converte o design em passos incrementais de codificação em TypeScript (ESM NodeNext,
strict, arquitetura hexagonal), **estendendo** os componentes existentes do Glicia em vez
de duplicá-los. A ordem constrói o núcleo determinístico primeiro (`Normalizer` →
`Repository.listActiveFoodEntries` → `Candidate_Provider`), depois a porta e a extensão do
`Food_Resolver`, o adapter opcional `LlmFoodSelector`, a extensão do
`Conversation_Orchestrator` e, por fim, o `wiring`.

Fronteira de segurança inviolável em toda a implementação: **o LLM/Food_Selector NUNCA
fornece valores nutricionais**; `carbsPerServing`, `servingQuantity` e `unit` vêm
EXCLUSIVAMENTE da `FoodMeasure` real adotada do Food_Database. O núcleo determinístico
(`Normalizer`, `Candidate_Provider`, `Food_Resolver` sem selector) permanece puro e offline;
o `Food_Selector` é opcional e injetável.

Testes com fast-check (`{ numRuns: 100 }`), tag de rastreabilidade no `describe`:
`Feature: llm-food-resolution, Property {N}: {texto}`. Cada uma das 17 Correctness Properties
vira um único teste de propriedade.

## Tasks

- [x] 1. Núcleo de normalização Unicode (domínio puro)
  - [x] 1.1 Implementar `Normalizer` (`src/domain/foods/normalizer.ts`)
    - Criar função pura `normalizeKey(raw)`: `trim` → `toLowerCase` Unicode → decompor NFD e remover marcas diacríticas `\u0300-\u036f`; texto vazio/branco → `""`.
    - Criar `tokenize(normalizedKey)`: separa por espaço e descarta tokens vazios de espaços consecutivos.
    - Sem IO/rede; funções determinísticas e idempotentes.
    - _Requirements: 2.1, 2.2, 2.5, 2.6, 2.7, 9.7_

  - [ ]* 1.2 Escrever teste de propriedade do Normalizer (forma/idempotência/determinismo)
    - Arquivo `tests/property/normalizer-form-idempotent.property.test.ts`.
    - **Property 1: Forma, idempotência e determinismo do Normalizer**
    - **Validates: Requirements 2.1, 2.5, 2.6, 2.7, 9.7**

  - [ ]* 1.3 Escrever teste de propriedade de equivalência (caixa/acentos/espaços)
    - Arquivo `tests/property/normalizer-equivalence.property.test.ts`.
    - **Property 2: Equivalência sob caixa, acentos e espaços**
    - **Validates: Requirements 2.2**

  - [x] 1.4 Fazer `normalizeName` delegar ao `normalizeKey`
    - Em `src/domain/foods/food-resolver.ts`, substituir o corpo de `normalizeName` por uma delegação a `normalizeKey`, mantendo a assinatura para não quebrar o import do `Conversation_Orchestrator`.
    - Garantir que o matching por texto do orquestrador passe a ser insensível a acentos.
    - _Requirements: 2.3, 2.4_

- [x] 2. Leitura em lote de alimentos ativos (Repository)
  - [x] 2.1 Estender a porta `Repository` com `listActiveFoodEntries`
    - Em `src/domain/ports/repository.ts`, adicionar a interface `FoodEntry { food, aliases[], measures[] }` e o método `listActiveFoodEntries(): Promise<FoodEntry[]>` (apenas `active = 1`; ordenação estável por id).
    - Preservar os métodos exatos existentes para compatibilidade.
    - _Requirements: 3.1, 3.3, 3.7, 10.1_

  - [x] 2.2 Implementar `listActiveFoodEntries` no `SqliteRepository`
    - Em `src/adapters/persistence/sqlite-repository.ts`, ler `food` + `food_alias` + `food_measure` (medidas `active = 1`), agregar por `food.id` em memória com ordenação estável por id, sem depender de `lower()` do SQLite para semântica.
    - Memoizar o resultado imutável (base somente-leitura em runtime) preservando o determinismo.
    - _Requirements: 3.1, 3.3, 3.7, 10.1_

  - [x] 2.3 Implementar `listActiveFoodEntries` no `InMemoryRepository`
    - Em `src/adapters/persistence/in-memory-repository.ts`, projetar as entradas ativas com aliases e medidas ativas, ordenação estável por id, para uso em testes offline.
    - _Requirements: 3.1, 3.3, 3.7, 10.1_

  - [ ]* 2.4 Escrever teste de integração de `SqliteRepository.listActiveFoodEntries`
    - Arquivo `tests/integration/sqlite-active-food-entries.test.ts` sobre banco `:memory:` semeado.
    - Validar que registros com maiúsculas acentuadas ("Óleo de Soja", "Água de coco") são carregados/alcançáveis (fecha o bug do `lower()` ASCII-only) e que o resultado é idêntico entre chamadas repetidas.
    - _Requirements: 2.4, 10.1_

- [x] 3. Geração de candidatos (Candidate_Provider)
  - [x] 3.1 Implementar `Candidate_Provider` e tipos (`src/domain/foods/candidate-provider.ts`)
    - Definir `MatchLevel`, `FoodCandidate { candidateId, food, measure, matchLevel }` (com `candidateId = ${food.id}:${measure.id}`), `CandidateSet { term, normalizedKey, candidates[], distinctFoodCount }` e `MAX_CANDIDATES = 25`.
    - `candidatesFor(term)`: key vazia → set vazio; matching por token (subcadeia) sobre `Normalized_Key` de nome/aliases; expandir cada Food em 1 candidato por `FoodMeasure` ativa; descartar Foods sem medida ativa.
    - Ordenação total de 5 níveis (nível de correspondência → menor comprimento do nome → nome crescente → id do Food → id da FoodMeasure) e limite `MAX_CANDIDATES` preservando a ordem; calcular `distinctFoodCount`.
    - Consumir apenas `repo.listActiveFoodEntries` (injeção); domínio puro, sem rede.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

  - [ ]* 3.2 Escrever teste de propriedade do conteúdo do Candidate_Set
    - Arquivo `tests/property/candidate-set-content.property.test.ts`.
    - **Property 3: Conteúdo válido do Candidate_Set**
    - **Validates: Requirements 3.1, 3.3, 3.7**

  - [ ]* 3.3 Escrever teste de propriedade do matching por token com alcançabilidade Unicode
    - Arquivo `tests/property/candidate-token-match.property.test.ts` (model-based com predicado de referência).
    - **Property 4: Matching por token com alcançabilidade Unicode**
    - **Validates: Requirements 3.2, 2.3, 2.4**

  - [ ]* 3.4 Escrever teste de propriedade da ordem total e do limite
    - Arquivo `tests/property/candidate-total-order.property.test.ts`.
    - **Property 5: Ordem total determinística e limite do Candidate_Set**
    - **Validates: Requirements 3.4, 3.5**

  - [ ]* 3.5 Escrever teste de propriedade do determinismo de `candidatesFor`
    - Arquivo `tests/property/candidate-determinism.property.test.ts`.
    - **Property 6: Determinismo de repetição da geração de candidatos**
    - **Validates: Requirements 10.1**

- [x] 4. Porta Food_Selector (opcional/injetável)
  - [x] 4.1 Definir a porta `FoodSelector` e tipos (`src/domain/ports/food-selector.ts`)
    - Declarar `SelectorCandidate { candidateId, foodName, measureLabel }` (sem campos nutricionais), `SelectionRequest { userText, informedQuantity, candidates[] }` e `SelectionResult = { kind: "SELECTED"; candidateId } | { kind: "ABSTAIN" }`.
    - Declarar `interface FoodSelector { select(request): Promise<SelectionResult> }` — contrato fechado, restrito a id ou abstenção.
    - _Requirements: 4.2, 4.7_

- [ ] 5. Checkpoint - núcleo determinístico
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Estender o Food_Resolver (Selection_Outcome, seleção e fronteira de segurança)
  - [x] 6.1 Estender `FoodResolver` com o núcleo determinístico do novo pipeline
    - Em `src/domain/foods/food-resolver.ts`, adicionar a união fechada `SelectionOutcome` (`RESOLVED` | `NEEDS_FOOD_DISAMBIGUATION` | `NEEDS_MEASURE_DISAMBIGUATION` | `UNRESOLVED`) e `FoodResolverDeps { candidateProvider, selector?, now? }`.
    - Reescrever `resolveItem`/`resolveAll` para: normalizar termo (key vazia → `UNRESOLVED`); gerar `Candidate_Set`; 0 candidatos → `UNRESOLVED`; `distinctFoodCount === MAX_CANDIDATES` → `NEEDS_FOOD_DISAMBIGUATION`; 1 Food distinto → resolver medida; escolha de medida por unidade (casa 1 → adota; ausente com 1 medida → adota; ausente/casa 0 ou >1 → `NEEDS_MEASURE_DISAMBIGUATION`).
    - Montar o `ResolvedItem` com `carbsPerServing`/`servingQuantity`/`unit` **exclusivamente** da `FoodMeasure` adotada e `foodName`/`quantity` preservados do `InterpretedItem`; medida sem carboidrato/porção numéricos → `NEEDS_MEASURE_DISAMBIGUATION` (nunca adota).
    - _Requirements: 3.6, 3.8, 5.1, 5.2, 5.3, 5.5, 5.6, 7.1, 7.2, 7.3, 7.5, 10.4, 10.5_

  - [x] 6.2 Adicionar a seleção assistida com timeout e 1 tentativa
    - Quando `distinctFoodCount > 1` e sem selector → `NEEDS_FOOD_DISAMBIGUATION`; com selector, acionar `select()` com `Candidate_Set` fechado, **1 tentativa**, `SELECTOR_TIMEOUT_MS = 5000` via `Promise.race` + relógio injetável.
    - Normalizar para abstenção: id ausente do conjunto, múltiplos ids, retorno não parseável, erro, indisponibilidade ou timeout → `NEEDS_FOOD_DISAMBIGUATION`, registrando indicação observável da falha via logger de domínio (sem vazar segredos); id válido → fixa o Food e segue à resolução de medida.
    - Ignorar qualquer valor nutricional retornado pelo selector.
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 9.2, 9.3, 9.4, 9.5, 9.6, 10.2_

  - [ ]* 6.3 Escrever teste de propriedade da exaustividade/exclusividade do Selection_Outcome
    - Arquivo `tests/property/outcome-exhaustive.property.test.ts`.
    - **Property 7: Exaustividade e exclusividade mútua do Selection_Outcome**
    - **Validates: Requirements 10.4**

  - [ ]* 6.4 Escrever teste de propriedade do pertencimento do candidato RESOLVED
    - Arquivo `tests/property/resolved-membership.property.test.ts`.
    - **Property 8: Pertencimento do candidato RESOLVED ao Candidate_Set**
    - **Validates: Requirements 10.5, 5.4**

  - [ ]* 6.5 Escrever teste de propriedade da invariante de segurança nutricional
    - Arquivo `tests/property/nutrition-safety-invariant.property.test.ts` (inclui interpreter/selector com valores "isca").
    - **Property 9: Invariante de segurança dos valores nutricionais**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.6, 1.3, 1.4, 4.4, 7.4**

  - [ ]* 6.6 Escrever teste de propriedade da abstenção segura ante retorno inválido
    - Arquivo `tests/property/selector-safe-abstain.property.test.ts` (erro/timeout/malformado/id ausente/múltiplos).
    - **Property 10: Abstenção segura ante retorno inválido do Food_Selector**
    - **Validates: Requirements 4.2, 4.3, 4.6, 9.3**

  - [ ]* 6.7 Escrever teste de propriedade da resolução sem depender do Food_Selector
    - Arquivo `tests/property/resolve-without-selector.property.test.ts`.
    - **Property 11: Resolução sem depender do Food_Selector**
    - **Validates: Requirements 9.2, 9.6**

  - [ ]* 6.8 Escrever teste de propriedade da seleção assistida válida
    - Arquivo `tests/property/selector-valid-selection.property.test.ts`.
    - **Property 12: Seleção assistida válida adota o candidato escolhido**
    - **Validates: Requirements 4.5, 4.1**

  - [ ]* 6.9 Escrever teste de propriedade da resolução direta e desambiguação de medida
    - Arquivo `tests/property/measure-resolution.property.test.ts`.
    - **Property 13: Resolução direta e desambiguação de medida**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5**

  - [ ]* 6.10 Escrever teste de propriedade da medida sem valores numéricos
    - Arquivo `tests/property/measure-missing-values.property.test.ts`.
    - **Property 14: Medida sem valores numéricos não é adotada**
    - **Validates: Requirements 5.5**

  - [ ]* 6.11 Escrever teste de propriedade do determinismo e independência posicional
    - Arquivo `tests/property/resolver-determinism-position.property.test.ts`.
    - **Property 15: Determinismo e independência posicional do Food_Resolver**
    - **Validates: Requirements 10.3, 10.7, 1.6, 9.5**

- [x] 7. Adapter opcional LlmFoodSelector
  - [x] 7.1 Implementar `LlmFoodSelector` (`src/adapters/food-selector-openai/llm-food-selector.ts`)
    - Implementar a porta `FoodSelector` via OpenAI Responses API + JSON Schema restrito a `{ candidateId: enum(ids do Candidate_Set) | null }`, usando `fetch` nativo injetável, sem dependência nova.
    - Converter na fronteira do adapter qualquer retorno fora do contrato (id ausente, múltiplos ids, não parseável) em `ABSTAIN`; nunca logar/expor `OPENAI_API_KEY`; erros tipados apenas com status/código.
    - _Requirements: 4.2, 4.3, 4.7_

  - [ ]* 7.2 Escrever testes unitários do `LlmFoodSelector`
    - Arquivo `tests/unit/llm-food-selector.test.ts` (spy de `fetch`): retorno malformado → `ABSTAIN`; id fora do conjunto → `ABSTAIN`; ausência de segredo em logs/erros.
    - _Requirements: 4.2, 4.3, 4.7_

- [ ] 8. Checkpoint - resolver e selector
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Estender o Conversation_Orchestrator (desambiguação por alimento e por medida)
  - [x] 9.1 Estender o estado e o fluxo de desambiguação por alimento
    - Em `src/domain/conversation/orchestrator.ts`, adicionar `FoodAmbiguityEntry`/`MeasureAmbiguityEntry` ao `PendingMealState` e adaptar `interpretAndResolve` para consumir o novo `SelectionOutcome`.
    - Implementar `NEEDS_FOOD_DISAMBIGUATION`: opções numeradas a partir de 1, uma por Food distinto na ordem determinística (nome + unidade); escolha por número ou por texto cujo `Normalized_Key` casa exatamente uma opção adota o candidato; escolha inválida/ambígua re-solicita a mesma lista; saturação (`distinctFoodCount === MAX_CANDIDATES`) pede mais detalhes antes de listar.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 9.2 Implementar desambiguação por medida e reforçar a guarda de confirmação
    - Implementar `NEEDS_MEASURE_DISAMBIGUATION`: lista numerada a partir de 1 (unidade + quantidade de porção); escolha por número ou por texto cujo `Normalized_Key` casa a unidade de exatamente uma medida adota, obtendo carboidrato/porção/unidade exclusivamente dessa `FoodMeasure`; escolha inválida/ambígua re-solicita a mesma lista.
    - Reforçar Req 8: enquanto houver qualquer item aguardando desambiguação, não apresentar para confirmação nem calcular/persistir; no resumo exibir nome informado, quantidade, unidade, descrição da FoodMeasure e carboidrato vindo exclusivamente do Food_Database, reutilizando `classifyConfirmation`.
    - Preservar os itens já resolvidos ao longo dos turnos de desambiguação.
    - _Requirements: 7.1, 7.3, 7.4, 7.6, 7.7, 8.1, 8.7, 6.6_

  - [ ]* 9.3 Escrever teste de propriedade da numeração e re-solicitação
    - Arquivo `tests/property/disambiguation-numbering.property.test.ts`.
    - **Property 16: Numeração e re-solicitação nas perguntas de desambiguação**
    - **Validates: Requirements 6.2, 6.3, 6.4, 7.6**

  - [ ]* 9.4 Escrever teste de propriedade da preservação de itens e guarda de confirmação
    - Arquivo `tests/property/resolved-preservation-guard.property.test.ts`.
    - **Property 17: Preservação de itens resolvidos e guarda de confirmação**
    - **Validates: Requirements 6.6, 7.7, 8.7, 8.5**

- [x] 10. Composição (wiring)
  - [x] 10.1 Estender o `buildApp` para compor Candidate_Provider e injetar Food_Selector opcional
    - Em `src/app/wiring.ts`, compor o `CandidateProvider` sobre `repo.listActiveFoodEntries` e injetar as `FoodResolverDeps` no `FoodResolver`.
    - Adicionar `foodSelector?` a `BuildAppOptions` e a regra de seleção: injetado → usa; senão `GLICIA_FOOD_SELECTOR === "openai"` → `LlmFoodSelector`; caso contrário nenhum selector (offline puro, `MockInterpreter` padrão).
    - _Requirements: 9.1, 9.2, 9.7_

  - [ ]* 10.2 Escrever teste smoke/unit da composição padrão
    - Arquivo `tests/unit/wiring-food-selector.test.ts`: `buildApp` padrão usa `MockInterpreter` e nenhum `Food_Selector`; núcleo (`Normalizer`, `Candidate_Provider`) sem chamadas de rede.
    - _Requirements: 9.1, 9.2, 9.7, 10.6_

- [ ] 11. Integração final
  - [ ]* 11.1 Escrever teste E2E do fluxo de desambiguação até a confirmação
    - Estender `tests/e2e/questions-flow.e2e.test.ts` com `MockInterpreter` roteirizado e `seedFoods: false` sobre fixtures controladas, cobrindo desambiguação por alimento e por medida até a confirmação afirmativa explícita.
    - _Requirements: 6.1, 7.1, 8.3_

  - [ ]* 11.2 Escrever testes de exemplo do Interpreter e do resumo de confirmação
    - Unit tests do `MockInterpreter` (extração de itens; mensagem vazia/sem alimento → coleção vazia) e da formatação do resumo de confirmação.
    - _Requirements: 1.1, 1.5, 8.1_

- [ ] 12. Checkpoint final
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tarefas marcadas com `*` são de teste (opcionais para um MVP mais rápido) e não devem ser implementadas pelo agente de código automaticamente.
- A extensão reaproveita `FoodResolver`, `ConversationOrchestrator`, `Repository`, `wiring` e `sanitizeInterpretation` existentes; nenhuma nova tabela/migration é necessária.
- Fronteira de segurança: `carbsPerServing`/`servingQuantity`/`unit` vêm SEMPRE da `FoodMeasure` adotada; o Food_Selector só escolhe um `candidateId` fechado ou se abstém.
- O núcleo determinístico (`Normalizer`, `Candidate_Provider`, `Food_Resolver` sem selector) opera 100% offline; o selector é opcional/injetável com timeout de 5 s e 1 tentativa.
- Cada teste de propriedade referencia sua Property de design e a cláusula de requisito validada.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.2", "2.3"] },
    { "id": 2, "tasks": ["2.4", "3.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "4.1"] },
    { "id": 4, "tasks": ["6.1", "7.1"] },
    { "id": 5, "tasks": ["6.2", "7.2"] },
    { "id": 6, "tasks": ["6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "6.11", "9.1"] },
    { "id": 7, "tasks": ["9.2"] },
    { "id": 8, "tasks": ["9.3", "9.4", "10.1"] },
    { "id": 9, "tasks": ["10.2", "11.1", "11.2"] }
  ]
}
```
