# Implementation Plan: Glicia (MVP Local — Fase 1)

## Overview

Este plano converte o design em passos incrementais de código, em **TypeScript**, para a **Fase 1 (MVP Local)**: aplicação de terminal, 100% offline, com `MockInterpreter`, `FoodResolver` contra base local, `Insulin_Calculator` determinístico (função pura), fluxo de confirmação e persistência local em SQLite.

A ordem respeita o princípio **"IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."**: o cálculo vive em um único lugar (`calculateInsulin`), sem dependências externas; os valores nutricionais vêm só do `Food_Database`; nada é persistido sem confirmação explícita.

Ordem de construção: fundação e tipos/contratos → motor determinístico `Insulin_Calculator` → cálculo determinístico de carboidratos → base de alimentos (importação SBD) + `Food_Resolver` → `Interpreter` (Mock) + contrato `MealInterpretation` → `Conversation_Orchestrator` → persistência local (snapshot, `formula_version`, dose calculada vs aplicada) → `Terminal_Channel` + fluxo end-to-end → testes de fluxo. Integrações de rede (WhatsApp, OpenAI, Supabase, áudio, Sheets, web) ficam ao final como **[FASE FUTURA]** e não bloqueiam o MVP.

Ferramentas: Vitest (runner), fast-check (PBT), better-sqlite3 (persistência local/`:memory:`). Testes de propriedade usam `{ numRuns: 100 }` no mínimo e referenciam a propriedade de design no formato `Feature: glicia, Property {n}: {texto}`.

## Tasks

- [x] 1. Fundação do projeto e ferramentas
  - Inicializar projeto TypeScript: `package.json`, `tsconfig.json`, `vitest.config.ts`
  - Instalar dependências: `typescript`, `vitest`, `fast-check`, `better-sqlite3` (+ `@types`)
  - Criar a estrutura de diretórios do design: `src/domain`, `src/adapters`, `src/app`, `migrations`, `seeds`, `tests/{unit,property,e2e}`
  - Criar `.env.example` sem valores de segredos reais (usado só na fase futura)
  - Garantir que nenhuma dependência exija rede em runtime da Fase 1
  - _Requirements: 1.7, 15.3, 18.6, 20.6_

- [x] 2. Tipos de domínio e contratos de portas
  - [x] 2.1 Definir tipos de domínio em `src/domain/types.ts`
    - `MealType`, `MissingInfo`, `ConversationStatus`, `InterpretedItem`, `MealInterpretation` (sem campo de dose)
    - _Requirements: 3.1, 3.3, 3.4, 3.5, 3.6, 3.9, 16.1_
  - [x] 2.2 Definir as portas do domínio em `src/domain/ports/`
    - `channel-adapter.ts` (`InboundMessage`, `ChannelAdapter`), `interpreter.ts` (`Interpreter`), `repository.ts` (`InsulinParameters`, `Repository` e entidades `Patient`/`Food`/`Conversation`/`SaveMealInput`/`NewConversationMessage`)
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 8.1, 8.2, 9.1, 10.1, 13.1, 16.5_

- [x] 3. Motor de cálculo de insulina (função pura e determinística)
  - [x] 3.1 Implementar `calculateInsulin` e `roundHalfAwayFromZero` em `src/domain/insulin/calculate-insulin.ts`
    - `FORMULA_VERSION = "1.0"`, `InsulinInput`, `InsulinResult`, `InsulinCalculationError` (`MISSING_OR_INVALID_INPUT`, `ZERO_DIVISOR`)
    - Validação de entradas (null/NaN/Infinity/não-número); divisores zero; `correctionDose`, `carbohydrateDose`, `totalDose`, `roundedDose`; único lugar do cálculo, sem IO/rede/env
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8, 7.9, 7.10, 7.11, 7.12, 7.13, 17.1_
  - [x] 3.2 Escrever testes unitários abrangentes de `calculateInsulin`
    - Glicemia igual/acima/abaixo da meta; zero CHO; ratios 8/6/8/10; decimais; arredondamento `2.5→3`, `-2.5→-3`, `2.4→2`, `3.5→4`; `factor=0`, `ratio=0`; `NaN`/`Infinity`/`null`
    - _Requirements: 18.1, 18.2, 18.3, 7.4, 7.9, 7.10, 7.11, 7.12, 7.13_
  - [x] 3.3 Escrever teste de propriedade — composição da dose
    - **Property 1: Composição da dose de insulina**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.5, 7.9, 7.10, 7.11**
  - [x] 3.4 Escrever teste de propriedade — determinismo
    - **Property 2: Determinismo do Insulin_Calculator**
    - **Validates: Requirements 7.6, 2.7, 17.1**
  - [x] 3.5 Escrever teste de propriedade — monotonicidade da correção
    - **Property 3: Monotonicidade da correção em relação à glicemia**
    - **Validates: Requirements 7.1, 7.9**
  - [x] 3.6 Escrever teste de propriedade — arredondamento
    - **Property 4: Arredondamento da dose (meio para maior magnitude)**
    - **Validates: Requirements 7.4**
  - [x] 3.7 Escrever teste de propriedade — divisor zero / entrada inválida
    - **Property 5: Erro em divisor zero ou entrada inválida**
    - **Validates: Requirements 7.12, 7.13**

- [x] 4. Cálculo determinístico de carboidratos
  - [x] 4.1 Implementar `calculateMealCarbs` e `round2` em `src/domain/meals/calculate-meal-carbs.ts`
    - `ResolvedItem`, `UnresolvedItem`, `MealCarbsResult`; CHO por item = `round2(quantity * carbsPerServing / servingQuantity)`; total = soma (2 casas)
    - Excluir itens inválidos/não resolvidos do total, preservando os válidos; determinístico
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_
  - [x] 4.2 Escrever testes unitários de `calculateMealCarbs`
    - Itens válidos, quantidade `<= 0`/ausente/não numérica, itens não resolvidos
    - _Requirements: 5.1, 5.4, 5.5, 5.6_
  - [x] 4.3 Escrever teste de propriedade — total é a soma dos itens
    - **Property 6: Total de carboidratos é a soma dos itens**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**
  - [x] 4.4 Escrever teste de propriedade — itens inválidos/não resolvidos excluídos
    - **Property 7: Itens inválidos ou não resolvidos são excluídos, preservando os válidos**
    - **Validates: Requirements 5.5, 5.6, 4.8**

- [x] 5. Checkpoint - calculadoras puras
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Esquema de persistência e bootstrap do repositório
  - [x] 6.1 Escrever as migrations SQL em `migrations/`
    - `0001_init.sql` (tabelas `patient`, `insulin_settings`, `insulin_meal_settings`, `food`, `food_alias`, `conversation`, `conversation_message`, `meal`, `meal_item`, `insulin_calculation` + índices/constraints/`UNIQUE`)
    - `0002_seed_patient_defaults.sql` (paciente única + defaults `target_glucose=120`, `correction_factor=40`, ratios 8/6/8/10)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 9.5, 9.6, 9.7, 9.8, 10.1, 13.1, 14.1, 14.5, 16.5, 16.6, 20.6_
  - [x] 6.2 Implementar bootstrap e métodos de leitura em `src/adapters/persistence/sqlite-repository.ts`
    - Conexão better-sqlite3 (`:memory:`/arquivo), aplicação das migrations, geração de UUID na aplicação
    - `getPatient`, `getInsulinParameters(mealType)`, `findFoodByAliasExact`, `findFoodByNameExact`, `findFoodCandidates` (normalização case/trim)
    - _Requirements: 4.2, 4.9, 8.6, 8.7, 14.1, 14.3_
  - [x] 6.3 Escrever testes de integração do bootstrap e leitura de parâmetros
    - Defaults 120/40 e ratios por refeição; `getInsulinParameters` retorna null quando ausente
    - _Requirements: 8.3, 8.4, 8.6, 8.7_

- [x] 7. Importação da base de alimentos (SBD 2025)
  - [x] 7.1 Criar seeds versionados e `importSbdFoods` em `seeds/`
    - `seeds/sbd-foods.csv` e `seeds/sbd-aliases.csv` (amostra da tabela SBD, págs. 48-153); `seeds/import-sbd-foods.ts`
    - Validação por linha, `ImportReport` (inserted + errors), `active=true`, idempotência por nome normalizado, cadastro de aliases
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_
  - [x] 7.2 Escrever teste de propriedade — robustez da importação
    - **Property 23: Robustez da importação da base SBD**
    - **Validates: Requirements 12.3, 12.4**

- [x] 8. Resolução de alimentos (Food_Resolver)
  - [x] 8.1 Implementar `normalizeName` e `FoodResolver` em `src/domain/foods/food-resolver.ts`
    - Cadeia de precedência alias exato → nome exato → candidato único conhecido, parando no primeiro nível
    - Outcomes `RESOLVED`/`AMBIGUOUS`/`UNRESOLVED`; valores nutricionais só do repositório
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.8, 4.9, 4.10_
  - [x] 8.2 Escrever testes unitários do `FoodResolver`
    - Cada nível da cadeia, 0/1/N candidatos, variações de caixa/espaço
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.8_
  - [x] 8.3 Escrever teste de propriedade — precedência da resolução
    - **Property 8: Precedência da resolução de alimentos**
    - **Validates: Requirements 4.1, 4.3, 4.4, 4.5**
  - [x] 8.4 Escrever teste de propriedade — insensível a caixa/espaços e normalização idempotente
    - **Property 9: Resolução insensível a caixa e espaços, e normalização idempotente**
    - **Validates: Requirements 4.2**
  - [x] 8.5 Escrever teste de propriedade — múltiplos candidatos → ambiguidade
    - **Property 10: Múltiplos candidatos produzem ambiguidade**
    - **Validates: Requirements 4.6**

- [x] 9. Interpretador Mock e contrato MealInterpretation
  - [x] 9.1 Implementar `sanitizeInterpretation` em `src/domain/conversation/sanitize-interpretation.ts`
    - Remove qualquer campo de dose e preserva `glucose`, `meal`, `items`, `missingInformation`
    - _Requirements: 3.9, 3.10_
  - [x] 9.2 Implementar `MockInterpreter` em `src/adapters/interpreter-mock/mock-interpreter.ts`
    - Determinístico e configurável (mapa roteirizado + parsing leve), sem rede
    - `glucose` (`> 0`/null), `meal`, `items` (≤50), `missingInformation`; mensagem vazia → 4 itens ausentes; nunca inventa dados
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.11, 3.12_
  - [x] 9.3 Escrever testes do Interpreter e do contrato (completa/incompleta/ambígua/vazia)
    - _Requirements: 18.4, 3.8_
  - [x] 9.4 Escrever teste de propriedade — MealInterpretation bem-formada e sem dose
    - **Property 11: MealInterpretation bem-formada e sem dose**
    - **Validates: Requirements 3.1, 3.3, 3.4, 3.5, 3.6, 3.9**
  - [x] 9.5 Escrever teste de propriedade — sanitização ignora campo de dose
    - **Property 12: Sanitização ignora campo de dose do interpretador**
    - **Validates: Requirements 3.10**

- [x] 10. Checkpoint - dados, alimentos e interpretação
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Logger seguro (sem dados clínicos)
  - [x] 11.1 Implementar logger seguro em `src/domain/logging/logger.ts`
    - Tipo `LogEvent` restrito a `message_id`, `patient_id`, `event_type`, `status`, `processing_time`, `timestamp`, `correlation_id`
    - _Requirements: 15.4, 15.5_
  - [x] 11.2 Escrever teste de propriedade — log seguro sem dados clínicos
    - **Property 27: Log seguro sem dados clínicos**
    - **Validates: Requirements 15.4, 15.5**

- [x] 12. Persistência da refeição, cálculo e conversa
  - [x] 12.1 Implementar métodos de conversa e idempotência em `src/adapters/persistence/sqlite-repository.ts`
    - `createConversation`, `updateConversationStatus`, `appendConversationMessage`, `isMessageProcessed`
    - _Requirements: 13.1, 13.2, 13.3, 16.1, 16.2, 16.3, 16.4, 16.5, 16.6_
  - [x] 12.2 Implementar persistência atômica e atualizações de parâmetros/dose em `src/adapters/persistence/sqlite-repository.ts`
    - `saveMealWithCalculation` (transação `meal` + `insulin_calculation` + `meal_item[]` com `ROLLBACK` em falha), `Parameter_Snapshot` + `formula_version`
    - `updateInsulinSetting`, `updateCarbohydrateRatio` (faixa `(0,999]`), `saveAppliedDose` (faixa `[0.1,250]`, independente da calculada)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9, 8.8, 8.9, 10.1, 10.2, 10.3, 10.4, 10.5_
  - [x] 12.3 Escrever teste de integração — persistência atômica, rollback e round-trip
    - _Requirements: 9.3, 9.4, 9.7, 9.8_
  - [x] 12.4 Escrever teste de propriedade — fidelidade do Parameter_Snapshot
    - **Property 16: Fidelidade do Parameter_Snapshot**
    - **Validates: Requirements 9.5, 9.6**
  - [x] 12.5 Escrever teste de propriedade — round-trip de persistência da refeição
    - **Property 17: Round-trip de persistência da refeição**
    - **Validates: Requirements 9.7, 9.8**
  - [x] 12.6 Escrever teste de propriedade — imutabilidade histórica frente a mudanças no Food
    - **Property 18: Imutabilidade histórica frente a mudanças no Food**
    - **Validates: Requirements 9.9**
  - [x] 12.7 Escrever teste de propriedade — idempotência por External_Message_Id
    - **Property 19: Idempotência por External_Message_Id**
    - **Validates: Requirements 13.2, 13.3**
  - [x] 12.8 Escrever teste de propriedade — validação de faixa dos parâmetros
    - **Property 21: Validação de faixa dos parâmetros de cálculo**
    - **Validates: Requirements 8.8, 8.9**
  - [x] 12.9 Escrever teste de propriedade — validação de faixa da dose aplicada
    - **Property 22: Validação de faixa da dose aplicada**
    - **Validates: Requirements 10.3, 10.4**
  - [x] 12.10 Escrever teste de propriedade — registro de mensagens da conversa
    - **Property 24: Registro de mensagens da conversa**
    - **Validates: Requirements 16.5**

- [x] 13. Orquestrador de conversa (máquina de estados + fluxo)
  - [x] 13.1 Implementar `ConversationOrchestrator` em `src/domain/conversation/orchestrator.ts`
    - `handleInbound` (idempotência, autorização paciente única, roteamento por status), `interpretAndResolve`, `nextPrompt` (pergunta apenas o que falta + ambiguidades), `presentForConfirmation` (`WAITING_CONFIRMATION`)
    - `handleConfirmationReply` (afirmativa → calcula+persiste; correção → `ACTIVE`; ambígua → reapresenta; timeout 10 min via clock injetado), `calculateAndPersist` (único ponto que chama `calculateInsulin`), `handleAppliedDose` (diferença aplicada vs calculada)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 16.1, 16.2, 16.3, 16.4, 17.3, 19.1, 19.2, 19.3, 19.4, 19.5, 4.6, 4.7, 4.8, 8.6, 8.7, 10.6, 14.2, 14.3_
  - [x] 13.2 Escrever testes unitários do orquestrador
    - Confirmação afirmativa, correção, resposta ambígua, timeout, dados insuficientes, seleção inválida entre candidatos
    - _Requirements: 6.3, 6.4, 6.6, 6.7, 4.7, 11.5_
  - [x] 13.3 Escrever teste de propriedade — perguntas mínimas
    - **Property 13: Perguntas mínimas por informação ausente ou ambígua**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.6**
  - [x] 13.4 Escrever teste de propriedade — guarda de dados insuficientes
    - **Property 14: Guarda de dados insuficientes**
    - **Validates: Requirements 17.3, 6.4**
  - [x] 13.5 Escrever teste de propriedade — segurança da confirmação
    - **Property 15: Segurança da confirmação**
    - **Validates: Requirements 6.4**
  - [x] 13.6 Escrever teste de propriedade — independência entre dose calculada e aplicada
    - **Property 20: Independência entre dose calculada e dose aplicada**
    - **Validates: Requirements 10.1, 10.2, 10.6**

- [x] 14. Canal de terminal (Terminal_Channel)
  - [x] 14.1 Implementar `TerminalChannel` em `src/adapters/terminal/terminal-channel.ts`
    - REPL via readline; rejeita vazia/só espaços e `> 4000` chars; `externalMessageId` determinístico para dedupe; encaminha texto íntegro; `send` imprime resposta íntegra
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.3_
  - [x] 14.2 Escrever testes unitários de validação do `TerminalChannel`
    - _Requirements: 1.2, 1.3_
  - [x] 14.3 Escrever teste de propriedade — preservação do conteúdo textual
    - **Property 25: Preservação do conteúdo textual pelo canal**
    - **Validates: Requirements 1.4**
  - [x] 14.4 Escrever teste de propriedade — rejeição de mensagens vazias/só espaços
    - **Property 26: Rejeição de mensagens vazias ou só com espaços**
    - **Validates: Requirements 1.2**

- [x] 15. Composição (wiring), CLI e fluxo end-to-end
  - [x] 15.1 Implementar `src/app/wiring.ts` e `src/app/main.ts`
    - Compor `TerminalChannel` + `MockInterpreter` + `SqliteRepository` + `FoodResolver` + `ConversationOrchestrator`; bootstrap de paciente/parâmetros/alimentos (seed); entrypoint da CLI, sem rede
    - _Requirements: 1.7, 14.1, 14.3, 19.1, 19.2, 19.3, 19.4, 19.5, 20.6_
  - [x] 15.2 Escrever teste end-to-end — mensagem completa
    - Interpreta → resolve → calcula CHO → confirma ("Sim") → calcula dose → persiste com snapshot e `formula_version="1.0"` → registra dose aplicada e mostra diferença
    - _Requirements: 18.5, 19.1, 19.2, 19.3, 19.4_
  - [x] 15.3 Escrever teste end-to-end — fluxo que requer perguntas
    - Sem glicemia ou alimento ambíguo → pergunta apenas o que falta → segue ao mesmo desfecho
    - _Requirements: 18.5, 19.5, 11.5_

- [x] 16. Fixtures opcionais e equivalência de canais
  - [x] 16.1 Implementar `InMemoryRepository` e um `ChannelAdapter` de teste em `src/adapters/persistence/in-memory-repository.ts`
    - Fixture offline para exercitar o domínio sem SQLite
    - _Requirements: 18.6_
  - [x] 16.2 Escrever teste de propriedade — equivalência entre canais
    - **Property 28: Equivalência entre canais**
    - **Validates: Requirements 2.4**

- [x] 17. Checkpoint final do MVP local
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 18. [FASE FUTURA] Adaptadores de extensão (opcionais, não bloqueiam o MVP)
  - [x] 18.1 [FASE FUTURA] Implementar `OpenAiInterpreter` (porta `Interpreter`)
    - OpenAI Responses API + JSON Schema reproduzindo `MealInterpretation` sem campo de dose; domínio inalterado
    - _Requirements: 20.2, 2.5, 2.6_
  - [~] 18.2 [FASE FUTURA] Implementar `WhatsAppChannel` (porta `ChannelAdapter`)
    - Webhook do WhatsApp Cloud API; `messageId` do WhatsApp como `external_message_id`; autorização por `whatsapp_phone`
    - _Requirements: 20.1, 13.4, 14.4, 2.3, 2.4_
  - [~] 18.3 [FASE FUTURA] Implementar `SupabaseRepository` (porta `Repository`)
    - Mesmo esquema relacional sobre Postgres/Supabase; segredos server-side; preparado para RLS/Auth
    - _Requirements: 20.6, 15.1, 15.2, 2.6_
  - [~] 18.4 [FASE FUTURA] Implementar `AudioTranscriber` e roteamento de áudio para o pipeline de texto
    - `conversation_message.message_type = AUDIO` já suportado; injeta texto no mesmo pipeline
    - _Requirements: 20.3, 16.6_
  - [~] 18.5 [FASE FUTURA] Implementar `GoogleSheetsSink`
    - Postgres como fonte de verdade; falha de sync não afeta a refeição persistida
    - _Requirements: 20.4_

## Notes

- Tarefas marcadas com `*` são opcionais (testes e adaptadores de fase futura) e podem ser puladas para um MVP mais rápido; as tarefas de implementação central nunca são opcionais.
- O foco imediato é a **Fase 1 (MVP Local)**; as tarefas `18.x` são **[FASE FUTURA]** e não bloqueiam o MVP.
- Cada tarefa referencia cláusulas específicas de requisitos para rastreabilidade; cada teste de propriedade referencia explicitamente uma propriedade do design.
- Todos os testes da Fase 1 rodam offline, sem chamadas de rede (Req 18.6).
- O cálculo de insulina vive em um único lugar (`calculateInsulin`), sem dependências externas; os valores nutricionais vêm só do `Food_Database`; nada é persistido sem confirmação explícita.
- Os checkpoints garantem validação incremental antes de avançar.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["3.1", "4.1", "6.1", "8.1", "9.1", "9.2", "11.1", "14.1"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "4.2", "4.3", "4.4", "6.2", "8.2", "8.3", "8.4", "8.5", "9.3", "9.4", "9.5", "11.2", "14.2", "14.3", "14.4", "16.1"] },
    { "id": 5, "tasks": ["6.3", "7.1", "12.1"] },
    { "id": 6, "tasks": ["7.2", "12.2"] },
    { "id": 7, "tasks": ["12.3", "12.4", "12.5", "12.6", "12.7", "12.8", "12.9", "12.10", "13.1"] },
    { "id": 8, "tasks": ["13.2", "13.3", "13.4", "13.5", "13.6", "15.1"] },
    { "id": 9, "tasks": ["15.2", "15.3", "16.2"] },
    { "id": 10, "tasks": ["18.1", "18.2", "18.3", "18.4", "18.5"] }
  ]
}
```
