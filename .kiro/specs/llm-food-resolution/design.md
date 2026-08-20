# Design Document — LLM_Food_Resolution

## Overview

Esta capacidade estende o pipeline de resolução de alimentos do Glicia (originalmente
o Requisito 4 do spec `glicia`) para lidar com termos genéricos ("café"), casos
ambíguos ("arroz") e nomes com maiúsculas acentuadas ("Óleo de Soja", "Água de coco"),
que hoje falham porque a correspondência exata usa o `lower()` do SQLite — ASCII-only —
e não normaliza acentos.

O design mantém **inviolável** o princípio arquitetural central:

> **"IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."**

A contribuição do LLM (Food_Selector) limita-se a **ESCOLHER** entre `Food_Candidate`
reais do banco apresentados a ele, ou a **abster-se**. O carboidrato, a quantidade de
porção e a unidade vêm SEMPRE de uma `FoodMeasure` real do `Food_Database`; nunca do
Interpreter, nunca do Food_Selector, nunca de qualquer valor gerado pela LLM.

Objetivos de design:

- **Reaproveitar e estender** os componentes existentes (`FoodResolver`,
  `ConversationOrchestrator`, `Repository`, `wiring`) sem quebrar o domínio puro nem a
  fronteira de segurança já validada por testes.
- Introduzir um **núcleo determinístico** de matching (`Normalizer` + `Candidate_Provider`)
  que opera sem rede e produz uma ordem total única de candidatos (Req 3, 9.7, 10.1).
- Tornar o **Food_Selector opcional e injetável**, com fallback determinístico para o
  fluxo de perguntas quando ausente, indisponível, com erro, malformado ou em timeout
  (5 s) (Req 4, 9).
- Preservar a operação **100% offline** do MVP local: o `MockInterpreter` continua o
  interpretador padrão e o caminho determinístico não depende de rede (Req 9.1, 9.7).

O design **não** introduz regras clínicas nem valores nutricionais novos: apenas melhora
a associação entre o texto da usuária e registros reais já presentes na base.

### Mapeamento requisitos → componentes

| Requisito | Componente responsável |
|-----------|------------------------|
| Req 1 — fronteira do Interpreter | `sanitizeInterpretation` (existente) + `Food_Resolver` |
| Req 2 — normalização Unicode | `Normalizer` (novo, domínio puro) |
| Req 3 — geração de candidatos | `Candidate_Provider` (novo) + `Repository.listActiveFoodEntries` (novo) |
| Req 4 — seleção assistida | `Food_Selector` (porta nova + adapters) + `Food_Resolver` |
| Req 5 — fronteira de segurança | `Food_Resolver` (montagem do `ResolvedItem` a partir da `FoodMeasure`) |
| Req 6 — desambiguação por alimento | `Conversation_Orchestrator` (estendido) |
| Req 7 — desambiguação por medida | `Conversation_Orchestrator` + `Food_Resolver` |
| Req 8 — confirmação obrigatória | `Conversation_Orchestrator` (existente, reforçado) |
| Req 9 — offline e fallback | `wiring` + `Food_Resolver` (timeout/1 tentativa) |
| Req 10 — determinismo/testabilidade | `Candidate_Provider`, `Food_Resolver`, `Selection_Outcome` |

## Architecture

A arquitetura mantém o padrão hexagonal ports & adapters: o domínio puro não conhece
rede, IO ou env; adapters concretos ficam nas bordas e são injetados pelo `wiring`.

```mermaid
graph TD
    subgraph Adapters
        MI[MockInterpreter\n(padrão offline)]
        OI[OpenAiInterpreter\n(fase futura)]
        LLMSel[LlmFoodSelector\n(adapter opcional)]
        SQL[SqliteRepository]
    end

    subgraph Domain[Domínio puro]
        ORCH[ConversationOrchestrator]
        FR[FoodResolver]
        NORM[Normalizer\nfunção pura]
        CP[CandidateProvider]
        subgraph Ports
            IP[[Interpreter port]]
            FSP[[FoodSelector port]]
            RP[[Repository port]]
        end
    end

    MI -.implementa.-> IP
    OI -.implementa.-> IP
    LLMSel -.implementa.-> FSP
    SQL -.implementa.-> RP

    ORCH --> FR
    ORCH --> IP
    ORCH --> RP
    FR --> CP
    FR --> NORM
    FR -. opcional/injetável .-> FSP
    CP --> NORM
    CP --> RP
```

O ponto central: o `Food_Selector` é uma dependência **opcional** do `Food_Resolver`.
Quando ausente, o resolver segue puramente pelo núcleo determinístico
(`Candidate_Provider` + `Normalizer`) e encaminha ambiguidades ao orquestrador.

### Fluxo de resolução de um item

```mermaid
flowchart TD
    A[InterpretedItem\n(foodName, quantity, unit)] --> B[Normalizer\nNormalized_Key do termo]
    B --> C{Key vazia?}
    C -- sim --> U[UNRESOLVED]
    C -- não --> D[CandidateProvider\ngera Candidate_Set ordenado]
    D --> E{tamanho do\nCandidate_Set}
    E -- 0 --> U
    E -- distintos == Max_Candidates --> FD[NEEDS_FOOD_DISAMBIGUATION\n(pedir detalhes — Req 6.5)]
    E -- 1 Food distinto --> M[Resolver medida]
    E -- >1 Food distinto --> S{Food_Selector\nconfigurado?}
    S -- não --> FD2[NEEDS_FOOD_DISAMBIGUATION]
    S -- sim --> SEL[Aciona Food_Selector\n1 tentativa, timeout 5s,\nCandidate_Set fechado]
    SEL --> SR{Retorno válido?\n(1 id ∈ Candidate_Set)}
    SR -- não / erro / timeout --> FD2
    SR -- sim --> M

    M --> N{Food tem\nmedidas ativas?}
    N -- 0 medidas --> U
    N -- 1 medida --> R{FoodMeasure tem\ncarb e porção numéricos?}
    N -- >1 medida --> UNIT{unidade informada?}
    UNIT -- ausente --> MD[NEEDS_MEASURE_DISAMBIGUATION]
    UNIT -- casa 1 medida --> R
    UNIT -- casa 0 ou >1 --> MD
    R -- sim --> RES[RESOLVED\nvalores da FoodMeasure adotada]
    R -- não --> MD
```

### Decisão de arquitetura: matching Unicode em código vs `lower()` do SQLite

O bug confirmado: `lower(trim(...))` do SQLite rebaixa apenas caracteres ASCII, deixando
registros com maiúsculas acentuadas ("Ó", "Á", "Ç") irresolvíveis (Req 2.4). Além disso,
o matching desta capacidade passa a ser **por token com subcadeia** (Req 3.2), o que não
é expresso de forma determinística e portável por SQL simples.

Opções avaliadas:

1. **Registrar função SQL Unicode-aware** (`db.function('norm', ...)`) e usar `LIKE`/`INSTR`
   sobre o valor normalizado.
   - Prós: filtra no banco, menos dados carregados.
   - Contras: empurra a lógica de normalização/ordenação para fora do domínio puro
     (fica acoplada ao adapter SQLite), dificulta os testes baseados em propriedades do
     núcleo, e a ordenação determinística de 5 níveis (Req 3.4) em SQL fica frágil.

2. **Carregar candidatos e filtrar/ordenar em código** (decisão adotada).
   - O `Repository` ganha um método de leitura em lote — `listActiveFoodEntries()` — que
     retorna os alimentos ativos com seus aliases e medidas ativas, **sem** depender do
     `lower()` do SQLite para semântica (usa apenas `active = 1`).
   - O `Candidate_Provider` (domínio puro) aplica `Normalizer`, matching por token e a
     ordem total de 5 níveis. Determinístico, testável offline e independente do dialeto.
   - Trade-off de desempenho: a base local tem ~2122 alimentos / ~2333 medidas. Carregar
     e filtrar em memória é plenamente viável para o MVP local (Fase 1) e mantém a
     fronteira de responsabilidades limpa. O `SqliteRepository` pode manter um cache
     imutável em memória das entradas ativas (a base é somente-leitura em runtime, semeada
     no boot), preservando o determinismo do Req 10.1.

Consequência: **a normalização vive no domínio** como função pura (`Normalizer`), e o
matching por token **não** depende do `lower()` do SQLite. Os métodos exatos existentes
(`findFoodByNameExact`, `findFoodByAliasExact`, `findFoodCandidates`) permanecem para
compatibilidade, mas o caminho novo usa `listActiveFoodEntries()` + matching em código.

## Components and Interfaces

### Normalizer (novo — domínio puro) — Req 2

Função pura, sem IO, que produz o `Normalized_Key` de um texto. Substitui/estende o
`normalizeName` atual (que só faz `trim().toLowerCase()` — insuficiente para acentos).

```typescript
// src/domain/foods/normalizer.ts

/**
 * Produz o Normalized_Key de um texto (Req 2.1):
 *   1) remove espaços em branco das extremidades (trim);
 *   2) rebaixa a caixa segundo regras Unicode (toLowerCase), inclusive
 *      maiúsculas acentuadas ("Ó" → "ó", "Ç" → "ç");
 *   3) remove marcas diacríticas via decomposição NFD + descarte de \u0300-\u036f.
 * Idempotente (Req 2.5) e determinística (Req 2.7). Texto vazio/branco → "" (Req 2.6).
 */
export function normalizeKey(raw: string): string;

/**
 * Tokeniza um Normalized_Key por espaços, descartando tokens vazios de espaços
 * consecutivos (Req 3.2). Usado pelo Candidate_Provider para matching por token.
 */
export function tokenize(normalizedKey: string): string[];
```

Notas de implementação:
- A ordem **rebaixar caixa → remover acentos** garante que "Ó" seja alcançado por "o"
  (o `toLowerCase` de "Ó" é "ó"; a decomposição NFD então separa o diacrítico).
- `normalizeKey` opera sobre o `String.prototype.toLowerCase` (Unicode-aware), diferente
  do `lower()` ASCII-only do SQLite.
- O `normalizeName` existente do `food-resolver.ts` passa a delegar para `normalizeKey`
  (ou é substituído por ele), mantendo o orquestrador — que já importa `normalizeName`
  para casar escolhas por texto — funcionando com a normalização Unicode correta.

### Candidate_Provider (novo) — Req 3

Componente de domínio que, dado um termo, retorna o `Candidate_Set` de `Food_Candidate`
reais e ativos, com matching por token (subcadeia) e ordem total determinística.

```typescript
// src/domain/foods/candidate-provider.ts
import type { Food, FoodMeasure } from "../ports/repository.js";

export const MAX_CANDIDATES = 25; // Req 3.5 (Max_Candidates)

export class CandidateProvider {
  constructor(
    private readonly repo: Pick<Repository, "listActiveFoodEntries">,
  ) {}

  /**
   * Gera o Candidate_Set para um termo (Req 3.1–3.8):
   *   - key = normalizeKey(term); se vazia → [] (Req 3.8);
   *   - para cada FoodEntry ativa: inclui o Food se TODO token do termo for
   *     subcadeia do Normalized_Key do nome OU de ≥1 alias (Req 3.2);
   *   - expande cada Food correspondente em 1 Food_Candidate por FoodMeasure
   *     ATIVA (Req 3.3); descarta Foods sem medida ativa (Req 3.7);
   *   - ordena pela ordem total de 5 níveis (Req 3.4);
   *   - limita a MAX_CANDIDATES preservando a ordem (Req 3.5).
   */
  async candidatesFor(term: string): Promise<CandidateSet>;
}
```

Ordenação determinística (Req 3.4), aplicada como comparador estável de 5 chaves:

1. **Nível de correspondência do nome** — `EXACT`(0) se `Normalized_Key(nome) === key`,
   `PREFIX`(1) se o nome começa com `key`, senão `SUBSTRING`(2);
2. **Menor comprimento do nome** (do `Normalized_Key` do nome), crescente;
3. **Nome** em ordem crescente (comparação do `Normalized_Key`, com desempate estável);
4. **Identificador do Food** crescente;
5. **Identificador da FoodMeasure** crescente.

Isso garante uma **ordem total única** entre todos os `Food_Candidate` (não há empates
residuais, pois `(foodId, measureId)` é único). O limite `Max_Candidates` conta cada
`Food_Candidate` individualmente (Req 3.5); a contagem de **Foods distintos** é usada pelo
orquestrador para numerar opções e detectar saturação (Req 6.5).

### Food_Candidate / Candidate_Set (novos tipos) — Req 3

```typescript
// src/domain/foods/candidate-provider.ts (ou candidate-types.ts)

// Nível de correspondência do nome, para ordenação (Req 3.4a).
export type MatchLevel = "EXACT" | "PREFIX" | "SUBSTRING";

// Par real (Food, FoodMeasure) do Food_Database (Req 3.1). Carrega a unidade e
// os valores nutricionais PRÓPRIOS da medida. NUNCA é construído a partir de
// valores do Interpreter ou do Food_Selector.
export interface FoodCandidate {
  candidateId: string;   // id estável = `${food.id}:${measure.id}` (referência fechada)
  food: Food;            // identidade (id, name, active)
  measure: FoodMeasure;  // unidade, porção e carboidrato — fonte nutricional (Req 5.1)
  matchLevel: MatchLevel;
}

// Conjunto ordenado e limitado (Req 3.4, 3.5).
export interface CandidateSet {
  term: string;               // termo original informado pela usuária
  normalizedKey: string;      // Normalized_Key do termo
  candidates: FoodCandidate[];// ordem total determinística; length ≤ MAX_CANDIDATES
  distinctFoodCount: number;  // nº de Foods distintos (para numeração/saturação — Req 6)
}
```

### Food_Selector (porta nova + adapters) — Req 4, 9

Porta opcional de seleção assistida. Recebe o texto original, a quantidade informada e
o `Candidate_Set` **fechado**; retorna o identificador de exatamente um candidato ou uma
abstenção. **Nunca** retorna valores nutricionais (o contrato nem os expõe — Req 4.2, 4.4).

```typescript
// src/domain/ports/food-selector.ts
import type { CandidateSet } from "../foods/candidate-provider.js";

// Descrição fechada apresentada ao selector: apenas id e textos (Req 4.7).
export interface SelectorCandidate {
  candidateId: string;   // único identificador que o selector pode devolver
  foodName: string;      // nome do Food (descritivo)
  measureLabel: string;  // ex.: "colher de sopa (25 g)" — descritivo, NÃO é dado de cálculo
}

export interface SelectionRequest {
  userText: string;              // texto original da usuária (Req 4.1)
  informedQuantity: number | null;
  candidates: SelectorCandidate[]; // conjunto fechado (Req 4.1, 4.7)
}

// Retorno restrito a DUAS formas (Req 4.2): escolha de 1 id, ou abstenção.
export type SelectionResult =
  | { kind: "SELECTED"; candidateId: string }
  | { kind: "ABSTAIN" };

export interface FoodSelector {
  // 1 tentativa por item; o timeout de 5s é imposto pelo Food_Resolver (Req 9.4).
  select(request: SelectionRequest): Promise<SelectionResult>;
}
```

Adapters:

- **`LlmFoodSelector`** (novo adapter, análogo ao `OpenAiInterpreter`): usa a OpenAI
  Responses API + JSON Schema restrito a `{ candidateId: enum(ids do Candidate_Set) | null }`,
  `fetch` nativo injetável, **sem dependência nova**, chave **nunca logada** (Req 15.1).
  Qualquer retorno fora do contrato (id ausente do conjunto, múltiplos ids, não parseável)
  é convertido em `ABSTAIN` na fronteira do adapter e também revalidado pelo resolver
  (defesa em profundidade — Req 4.3).
- **Ausência de selector**: o `wiring` simplesmente não injeta um `Food_Selector`; o
  resolver segue determinístico (Req 9.2). O padrão offline (MockInterpreter) **não** usa
  Food_Selector.

### Food_Resolver (estendido) — Req 4, 5, 7, 9, 10

O `FoodResolver` existente é estendido para: (a) usar o `Candidate_Provider` no lugar da
cadeia exata pura; (b) aceitar um `Food_Selector` **opcional e injetável**; (c) produzir o
novo `Selection_Outcome`; (d) impor timeout de 5 s / 1 tentativa; (e) garantir que os
valores nutricionais venham exclusivamente da `FoodMeasure` adotada.

```typescript
// src/domain/foods/food-resolver.ts (estendido)
import type { FoodSelector } from "../ports/food-selector.js";
import type { CandidateProvider, CandidateSet, FoodCandidate } from "./candidate-provider.js";

export const SELECTOR_TIMEOUT_MS = 5000; // Req 9.4

// Resultado da resolução de um item (Req 10.4) — união fechada e exaustiva.
export type SelectionOutcome =
  | { kind: "RESOLVED"; item: ResolvedItem; candidate: FoodCandidate }
  | { kind: "NEEDS_FOOD_DISAMBIGUATION"; term: string; set: CandidateSet }
  | { kind: "NEEDS_MEASURE_DISAMBIGUATION"; term: string; food: Food; measures: FoodMeasure[]; item: InterpretedItem }
  | { kind: "UNRESOLVED"; term: string };

export interface FoodResolverDeps {
  candidateProvider: CandidateProvider;
  selector?: FoodSelector;              // opcional/injetável (Req 4.1, 9.2, 10.2)
  now?: () => number;                   // relógio injetável (timeout testável)
}

export class FoodResolver {
  constructor(private readonly deps: FoodResolverDeps) {}

  async resolveItem(item: InterpretedItem, userText: string): Promise<SelectionOutcome>;
  async resolveAll(items: InterpretedItem[], userText: string): Promise<SelectionOutcome[]>;
}
```

Lógica de `resolveItem` (determinística exceto pela chamada opcional ao selector):

1. `key = normalizeKey(item.foodName)`; se vazia → `UNRESOLVED` (Req 3.8, alinhado a 1.6/5).
2. `set = candidateProvider.candidatesFor(item.foodName)`.
3. Se `set.candidates.length === 0` → `UNRESOLVED` (Req 3.6).
4. Se `set.distinctFoodCount >= MAX_CANDIDATES` → `NEEDS_FOOD_DISAMBIGUATION` (o
   orquestrador pedirá mais detalhes — Req 6.5).
5. Se há **>1 Food distinto**:
   - Se `selector` ausente → `NEEDS_FOOD_DISAMBIGUATION` (Req 9.2).
   - Se presente → aciona `select()` com o `Candidate_Set` fechado, **1 tentativa**,
     `timeout 5s` (Req 9.4). Resultado:
     - `SELECTED` com id **presente** no conjunto → fixa esse Food (segue ao passo 6 com o
       Food do candidato escolhido; a medida do candidato escolhido é a preferida).
     - `ABSTAIN` / id ausente / múltiplos / não parseável / erro / timeout / indisponível
       → trata como abstenção, registra indicação observável da falha e segue
       `NEEDS_FOOD_DISAMBIGUATION` (Req 4.3, 4.6, 9.3).
6. Com **1 Food** determinado (candidato único, ou Food escolhido pelo selector):
   - Reúne as `FoodMeasure` ativas desse Food a partir do `Candidate_Set`.
   - **0 medidas** → `UNRESOLVED` (não deveria ocorrer, pois Foods sem medida são
     descartados no passo 2 — Req 3.7).
   - **Escolha da medida**:
     - `item.unit` informado e `normalizeKey(unit)` casa **exatamente 1** medida →
       adota essa medida (Req 7.2).
     - `item.unit` informado e casa **0** ou **>1** medidas → `NEEDS_MEASURE_DISAMBIGUATION`
       (Req 7.1, 7.3).
     - `item.unit` ausente e o Food tem **1** medida → adota (Req 7.5).
     - `item.unit` ausente e o Food tem **>1** medida → `NEEDS_MEASURE_DISAMBIGUATION`
       (Req 7.1).
   - Antes de adotar: se a `FoodMeasure` escolhida **não** tem `carbohydrates` numérico
     ou `servingQuantity` numérico → `NEEDS_MEASURE_DISAMBIGUATION` (não adota, não calcula
     — Req 5.5).
   - Ao adotar → `RESOLVED`, montando o `ResolvedItem` com **`carbsPerServing`,
     `servingQuantity` e `unit` vindos da `FoodMeasure`** e **`foodName`/`quantity`
     preservados do `InterpretedItem`** (Req 5.1, 5.2). Nenhum valor do selector/interpreter
     de carboidrato/porção/unidade é usado (Req 4.4, 5.3).

Timeout/1 tentativa (Req 9.3, 9.4): o resolver embrulha `selector.select()` em uma corrida
contra um timer de 5 s (via `Promise.race` + relógio injetável). Timeout, rejeição e
retorno malformado colapsam todos em `ABSTAIN`.

### Conversation_Orchestrator (estendido) — Req 6, 7, 8

O orquestrador atual já trata um `AMBIGUOUS` genérico com pares `(food, measure)`. Ele é
estendido para distinguir **desambiguação por alimento** (Req 6) e **por medida** (Req 7),
mantendo a confirmação obrigatória (Req 8) intacta.

Estado pendente (`PendingMealState`) passa a guardar duas filas de desambiguação:

```typescript
interface FoodAmbiguityEntry {   // Req 6
  term: string;
  set: CandidateSet;             // opções por Food distinto (ordem determinística)
  item: InterpretedItem;         // preserva quantidade/unidade informadas
}

interface MeasureAmbiguityEntry { // Req 7
  term: string;
  food: Food;
  measures: FoodMeasure[];        // medidas ativas do Food, ordem determinística
  item: InterpretedItem;
}
```

Comportamento:

- **NEEDS_FOOD_DISAMBIGUATION** (Req 6):
  - Apresenta opções **numeradas a partir de 1**, uma por **Food distinto**, na ordem do
    `Candidate_Set`, exibindo nome do alimento + unidade da medida correspondente (Req 6.2).
  - Escolha por número, ou por texto cujo `Normalized_Key` casa exatamente uma opção (nome
    do alimento ou unidade) → adota o `Food_Candidate` (sujeita à Confirmation — Req 6.3).
    Se o Food escolhido tiver >1 medida, cai em `NEEDS_MEASURE_DISAMBIGUATION`.
  - Escolha que não casa nenhuma, ou casa mais de uma → re-solicita a **mesma** lista
    (Req 6.4).
  - Se `distinctFoodCount === Max_Candidates` → pede mais detalhes antes de listar (Req 6.5).
  - Itens já resolvidos são preservados enquanto houver desambiguação pendente (Req 6.6).

- **NEEDS_MEASURE_DISAMBIGUATION** (Req 7):
  - Apresenta as medidas em lista **numerada a partir de 1**, exibindo unidade + quantidade
    de porção de cada `FoodMeasure` (Req 7.1, 7.3).
  - Escolha por número ou por texto cujo `Normalized_Key` casa a unidade de exatamente uma
    medida → adota, obtendo carboidrato/porção/unidade **exclusivamente dessa FoodMeasure**
    (Req 7.4).
  - Escolha inválida/ambígua → re-solicita a **mesma** lista (Req 7.6).
  - Itens já resolvidos preservados (Req 7.7).

- **Confirmação (Req 8)**: enquanto houver **qualquer** item aguardando desambiguação de
  alimento ou de medida, o orquestrador **não** apresenta para confirmação (Req 8.7). Ao
  apresentar, mostra por item: nome informado, quantidade, unidade, descrição da FoodMeasure
  adotada e o carboidrato calculado **exclusivamente** a partir do `Food_Database` (Req 8.1).
  A `Confirmation` afirmativa explícita continua obrigatória antes de calcular/persistir
  (Req 8.2–8.6), reutilizando a lógica de `classifyConfirmation` já existente.

### Repository (estendido) — Req 3, 10.1

Novo método de leitura em lote para o `Candidate_Provider`, mantendo o determinismo:

```typescript
// src/domain/ports/repository.ts (adição)

// Projeção de um alimento ativo com seus aliases e medidas ativas, para
// matching por token no domínio (Req 3.2, 3.3). Determinística: ordenação
// estável por id.
export interface FoodEntry {
  food: Food;
  aliases: string[];        // textos originais dos aliases (normalizados no domínio)
  measures: FoodMeasure[];  // apenas medidas ativas (Req 3.3, 3.7)
}

export interface Repository {
  // ...métodos existentes preservados...

  // Lista todos os alimentos ATIVOS com aliases e medidas ativas (Req 3, 10.1).
  // NÃO usa lower() do SQLite para semântica de matching — apenas active = 1.
  // A normalização/ordenação de matching é responsabilidade do domínio.
  listActiveFoodEntries(): Promise<FoodEntry[]>;
}
```

Implementação no `SqliteRepository`: uma leitura com joins (`food` + `food_alias` +
`food_measure` filtrando `active = 1`), agregada por `food.id` em memória, com ordenação
estável por id. Como a base é semeada no boot e é somente-leitura em runtime, o adapter
**pode** memoizar o resultado imutável para desempenho, sem afetar o determinismo (Req 10.1).
Os métodos exatos atuais (`findFoodByNameExact`, etc.) permanecem para compatibilidade.

### wiring (estendido) — Req 9

O `buildApp` passa a compor o `Candidate_Provider` e a injetar **opcionalmente** um
`Food_Selector` no `Food_Resolver`:

```typescript
export interface BuildAppOptions {
  // ...existentes...
  foodSelector?: FoodSelector; // opcional; default offline = nenhum (Req 9.2)
}
```

Regra de seleção do selector (análoga ao `resolveInterpreter`):
1. Se `options.foodSelector` for injetado (ex.: selector determinístico de teste), usa-o.
2. Senão, se `GLICIA_FOOD_SELECTOR === "openai"`, compõe o `LlmFoodSelector`
   (lê `OPENAI_API_KEY`/modelo do ambiente — segredos server-side).
3. Caso contrário, **nenhum** selector: o resolver opera 100% determinístico e offline
   (Req 9.1, 9.2, 9.7). O `MockInterpreter` permanece o padrão.

O timeout de 5 s e o limite de 1 tentativa são propriedades do `Food_Resolver`, não do
adapter, garantindo o fallback determinístico independentemente do selector concreto
(Req 9.3, 9.4, 9.5).

## Data Models

### Tipos de domínio (novos)

- `MatchLevel = "EXACT" | "PREFIX" | "SUBSTRING"` — nível de correspondência de nome (Req 3.4a).
- `FoodCandidate` — `{ candidateId, food, measure, matchLevel }`. `candidateId = food.id:measure.id`
  é a **referência fechada** que o Food_Selector pode devolver (Req 4.2, 4.7).
- `CandidateSet` — `{ term, normalizedKey, candidates[], distinctFoodCount }`, ordenado e
  limitado a `MAX_CANDIDATES = 25` candidatos (Req 3.4, 3.5).
- `SelectorCandidate` / `SelectionRequest` / `SelectionResult` — contrato fechado da porta
  Food_Selector; **sem** campos nutricionais (Req 4.2, 4.4).
- `SelectionOutcome` — união fechada de 4 variantes (Req 10.4).
- `FoodEntry` — projeção de leitura em lote `{ food, aliases[], measures[] }` (Req 3).

### Tipos reaproveitados (inalterados)

- `InterpretedItem { foodName, quantity, unit }` — termos de busca + quantidade informada;
  **nunca** fonte nutricional (Req 1.4, 5.2).
- `Food { id, name, active }` — identidade, sem valores nutricionais.
- `FoodMeasure { id, foodId, servingUnit, servingQuantity, carbohydrates, active }` — **única
  fonte** de carboidrato/porção/unidade (Req 5.1).
- `ResolvedItem { foodName, quantity, unit, carbsPerServing, servingQuantity, foodId }` — o
  contrato para `calculateMealCarbs`; `unit`/`carbsPerServing`/`servingQuantity` vêm da
  `FoodMeasure` adotada; `foodName`/`quantity` preservados do item (Req 5.1, 5.2).

### Persistência

Sem novas tabelas nem migrations. O schema existente (`food`, `food_measure`, `food_alias`)
já suporta a leitura em lote. A tabela `meal_item` continua congelando o `carbohydrates`
calculado pelo código a partir da `FoodMeasure` adotada (Req 5.6, 9.8 do spec base).

## Correctness Properties

*Uma propriedade é uma característica ou comportamento que deve valer para todas as
execuções válidas do sistema — uma afirmação formal sobre o que o software deve fazer.
As propriedades são a ponte entre a especificação legível por humanos e garantias de
corretude verificáveis por máquina.*

As propriedades abaixo derivam do prework dos critérios de aceitação e foram consolidadas
para eliminar redundância (ex.: os vários critérios de fronteira de segurança dos Req 1, 4,
5 e 7 colapsam em uma única invariante). Cada propriedade é universalmente quantificada e
será implementada por um único teste baseado em propriedades (fast-check).

### Property 1: Forma, idempotência e determinismo do Normalizer

*Para todo* texto de entrada, `normalizeKey` produz uma chave que: não tem espaços em
branco nas extremidades, não contém marcas diacríticas (`\u0300-\u036f` após NFD), é igual
ao seu próprio `toLowerCase`; e aplicá-la novamente à própria saída retorna valor idêntico
(idempotência), assim como invocações repetidas sobre a mesma entrada retornam sempre a
mesma chave (determinismo).

**Validates: Requirements 2.1, 2.5, 2.7, 2.6, 9.7**

### Property 2: Equivalência sob caixa, acentos e espaços

*Para todo* texto base e *para toda* variação obtida alterando apenas caixa, presença ou
ausência de acentos, ou espaços em branco nas extremidades, `normalizeKey(variação)` é
igual a `normalizeKey(base)`.

**Validates: Requirements 2.2**

### Property 3: Conteúdo válido do Candidate_Set

*Para todo* estado do Food_Database e *todo* termo, cada `Food_Candidate` do `Candidate_Set`
corresponde a um `Food` ativo e a uma `FoodMeasure` ativa existentes na base fornecida;
todo `Food` incluído contribui com exatamente um `Food_Candidate` por `FoodMeasure` ativa
sua; e nenhum `Food` sem `FoodMeasure` ativa aparece no conjunto.

**Validates: Requirements 3.1, 3.3, 3.7**

### Property 4: Matching por token com alcançabilidade Unicode

*Para todo* estado do Food_Database e *todo* termo com `Normalized_Key` não vazio, um `Food`
(com ao menos uma medida ativa) pertence ao `Candidate_Set` se e somente se **cada** token
do `Normalized_Key` do termo é subcadeia do `Normalized_Key` do nome do `Food` ou do
`Normalized_Key` de ao menos um de seus aliases; em particular, um `Food` com maiúscula
acentuada no nome/alias é alcançável por qualquer variação sem acento e em caixa arbitrária
do termo correspondente.

**Validates: Requirements 3.2, 2.3, 2.4**

### Property 5: Ordem total determinística e limite do Candidate_Set

*Para todo* `Candidate_Set`, a sequência de `Food_Candidate` é exatamente o prefixo, de
tamanho no máximo `Max_Candidates = 25`, da ordenação de referência dos mesmos elementos
pela ordem de 5 níveis (nível de correspondência do nome; menor comprimento do nome; nome
crescente; id do Food crescente; id da FoodMeasure crescente), e essa ordenação é uma ordem
total (sem empates, pois `(foodId, measureId)` é único).

**Validates: Requirements 3.4, 3.5**

### Property 6: Determinismo de repetição da geração de candidatos

*Para todo* termo e *todo* estado do Food_Database, invocar `candidatesFor` qualquer número
de vezes produz `Candidate_Set` idênticos em quantidade, conteúdo (mesmo Food, mesma
FoodMeasure, mesma unidade e mesmos valores nutricionais) e ordem.

**Validates: Requirements 10.1**

### Property 7: Exaustividade e exclusividade mútua do Selection_Outcome

*Para todo* `InterpretedItem` e *todo* estado do Food_Database, a resolução produz
exatamente um `Selection_Outcome` cujo `kind` pertence ao conjunto fechado
`{ RESOLVED, NEEDS_FOOD_DISAMBIGUATION, NEEDS_MEASURE_DISAMBIGUATION, UNRESOLVED }`, nunca
outro valor e nunca mais de um resultado para o mesmo item.

**Validates: Requirements 10.4**

### Property 8: Pertencimento do candidato RESOLVED ao Candidate_Set

*Para todo* item cuja resolução seja `RESOLVED`, o `Food_Candidate` adotado pertence ao
`Candidate_Set` gerado para o termo desse item (seu `candidateId` está presente no
conjunto).

**Validates: Requirements 10.5, 5.4**

### Property 9: Invariante de segurança dos valores nutricionais

*Para todo* item resolvido como `RESOLVED` — inclusive quando o `Interpreter` ou o
`Food_Selector` fornecem valores "isca" de carboidrato, quantidade de porção ou unidade — o
`ResolvedItem` adotado tem `carbsPerServing`, `servingQuantity` e `unit` **exatamente
iguais** aos da `FoodMeasure` adotada, e preserva `foodName` e `quantity` exatamente como no
`InterpretedItem`, nunca derivando esses valores do Interpreter, do Food_Selector ou de
qualquer valor gerado pela LLM.

**Validates: Requirements 5.1, 5.2, 5.3, 5.6, 1.3, 1.4, 4.4, 7.4**

### Property 10: Abstenção segura ante retorno inválido do Food_Selector

*Para todo* `Candidate_Set` com mais de um `Food` distinto e *todo* retorno do
`Food_Selector` que seja abstenção, identificador ausente do conjunto, múltiplos
identificadores, retorno não parseável, erro lançado, indisponibilidade ou expiração do
tempo limite de 5 s, a resolução **não** produz `RESOLVED` a partir desse retorno inválido:
encaminha o item a `NEEDS_FOOD_DISAMBIGUATION` preservando o texto original e a quantidade
informada.

**Validates: Requirements 4.2, 4.3, 4.6, 9.3**

### Property 11: Resolução sem depender do Food_Selector

*Para todo* `Candidate_Set`, quando ele contém exatamente um `Food_Candidate` a resolução da
medida ocorre sem acionar o `Food_Selector`; e quando ele contém mais de um `Food` distinto
e **nenhum** `Food_Selector` está configurado, a resolução é sempre
`NEEDS_FOOD_DISAMBIGUATION`.

**Validates: Requirements 9.2, 9.6**

### Property 12: Seleção assistida válida adota o candidato escolhido

*Para todo* `Candidate_Set` com mais de um `Food` distinto e *todo* `Food_Selector`
determinístico que retorna um identificador válido presente no conjunto, a resolução fixa o
`Food` correspondente a esse identificador (e, quando a medida é única ou compatível, adota
o `Food_Candidate` daquele identificador).

**Validates: Requirements 4.5, 4.1**

### Property 13: Resolução direta e desambiguação de medida

*Para todo* `Food` com uma única `FoodMeasure` ativa e sem ambiguidade de alimento, a
resolução é `RESOLVED` sem perguntar; *para todo* `Food` com mais de uma `FoodMeasure` ativa,
quando a unidade informada casa exatamente uma medida a resolução é `RESOLVED` com essa
medida, e quando a unidade está ausente ou casa zero ou mais de uma medida a resolução é
`NEEDS_MEASURE_DISAMBIGUATION` com a lista das medidas ativas.

**Validates: Requirements 7.1, 7.2, 7.3, 7.5**

### Property 14: Medida sem valores numéricos não é adotada

*Para todo* `Food_Candidate` cuja `FoodMeasure` não possui valor numérico de carboidrato ou
de quantidade de porção, a resolução nunca produz `RESOLVED` com essa medida — encaminha a
`NEEDS_MEASURE_DISAMBIGUATION` (ou `UNRESOLVED` quando não há alternativa), sem calcular dose.

**Validates: Requirements 5.5**

### Property 15: Determinismo e independência posicional do Food_Resolver

*Para toda* lista de `InterpretedItem`, com um `Food_Selector` determinístico e o mesmo
estado do Food_Database, o `Selection_Outcome` de cada item produzido por `resolveAll` é
idêntico ao produzido isoladamente por `resolveItem` para esse item — independentemente de
sua posição na lista — e execuções repetidas produzem os mesmos resultados (incluindo o
mesmo `Food_Candidate` adotado quando `RESOLVED`).

**Validates: Requirements 10.3, 10.7, 1.6, 9.5**

### Property 16: Numeração e re-solicitação nas perguntas de desambiguação

*Para todo* `Candidate_Set` apresentado como desambiguação de alimento, as opções são
numeradas sequencialmente a partir de 1, com exatamente uma entrada por `Food` distinto na
ordem determinística do conjunto; uma escolha por número válido ou por texto cujo
`Normalized_Key` casa exatamente uma opção (por nome do alimento ou por unidade) adota o
`Food_Candidate` correspondente, enquanto uma escolha que não casa nenhuma opção ou casa
mais de uma preserva a lista de desambiguação inalterada e a reapresenta.

**Validates: Requirements 6.2, 6.3, 6.4, 7.6**

### Property 17: Preservação de itens resolvidos e guarda de confirmação

*Para todo* estado de conversa que contenha itens já resolvidos e ao menos um item
aguardando desambiguação de alimento ou de medida, os itens resolvidos permanecem inalterados
(sem recálculo nem descarte) ao longo dos turnos de desambiguação, e o orquestrador não
apresenta a refeição para confirmação nem calcula/persiste enquanto qualquer desambiguação
permanecer pendente.

**Validates: Requirements 6.6, 7.7, 8.7, 8.5**

## Error Handling

Estratégia de tratamento de erros e fallback, com o princípio "falha do assistente nunca
compromete a fronteira de segurança nem interrompe o lote":

- **Food_Selector indisponível/erro/timeout/malformado (Req 4.3, 9.3, 9.4)**: o
  `Food_Resolver` embrulha `selector.select()` em uma corrida contra um timer de 5 s
  (`Promise.race` + relógio injetável). Qualquer rejeição, expiração de tempo, retorno não
  parseável, id ausente do `Candidate_Set` ou múltiplos ids é normalizado para `ABSTAIN`.
  O resultado é `NEEDS_FOOD_DISAMBIGUATION`, preservando texto e quantidade. Uma indicação
  observável da falha é registrada pelo logger de domínio (sem vazar segredos).
- **Máximo de 1 tentativa por item (Req 9.4)**: o resolver nunca reintenta o selector; após
  a primeira resposta (ou timeout) segue determinístico.
- **FoodMeasure sem carboidrato/porção numéricos (Req 5.5)**: nunca é adotada; o item é
  encaminhado a `NEEDS_MEASURE_DISAMBIGUATION` (ou `UNRESOLVED` se não houver alternativa),
  sem calcular dose.
- **Normalized_Key vazio / termo sem correspondência (Req 3.6, 3.8)**: `Candidate_Set` vazio
  → `UNRESOLVED`; o orquestrador solicita esclarecimento do alimento (fluxo FOOD existente).
- **Candidate_Set saturado (distinctFoodCount == Max_Candidates — Req 6.5)**: o orquestrador
  pede que a paciente detalhe o alimento antes de listar opções.
- **Segredos (Req 15.1)**: o `LlmFoodSelector` jamais registra a `OPENAI_API_KEY` nem a
  inclui em mensagens de erro; erros são tipados e carregam apenas status/código.
- **Interpretador contaminado (Req 1.3, 1.2)**: `sanitizeInterpretation` continua a descartar
  qualquer campo de dose/carboidrato/porção antes da resolução; o resolver nunca lê campos
  fora de `{ foodName, quantity, unit }`.
- **Falha de persistência (Req 8.5)**: inalterada — a transação atômica do repositório faz
  rollback; nenhuma refeição parcial é gravada e os itens resolvidos são preservados em
  memória.

## Testing Strategy

Abordagem dual, alinhada ao ecossistema existente (Vitest + fast-check), mantendo o núcleo
determinístico testável 100% offline (Req 9.7, 10.6).

### Testes de propriedades (property-based)

- **Biblioteca**: fast-check (já em uso no projeto). Não implementar PBT do zero.
- **Iterações**: mínimo de 100 por teste de propriedade (`{ numRuns: 100 }`), como nos
  testes existentes.
- **Rastreabilidade**: cada teste referencia sua propriedade de design com a tag no `describe`:
  `Feature: llm-food-resolution, Property {N}: {texto}`.
- **Mapeamento 1:1**: cada uma das 17 Correctness Properties é implementada por um único
  teste de propriedade. Sugestão de arquivos em `tests/property/`:
  - `normalizer-form-idempotent.property.test.ts` (Property 1)
  - `normalizer-equivalence.property.test.ts` (Property 2)
  - `candidate-set-content.property.test.ts` (Property 3)
  - `candidate-token-match.property.test.ts` (Property 4 — model-based com predicado de referência)
  - `candidate-total-order.property.test.ts` (Property 5)
  - `candidate-determinism.property.test.ts` (Property 6)
  - `outcome-exhaustive.property.test.ts` (Property 7)
  - `resolved-membership.property.test.ts` (Property 8)
  - `nutrition-safety-invariant.property.test.ts` (Property 9 — a mais crítica)
  - `selector-safe-abstain.property.test.ts` (Property 10 — inclui erro/timeout/malformado)
  - `resolve-without-selector.property.test.ts` (Property 11)
  - `selector-valid-selection.property.test.ts` (Property 12)
  - `measure-resolution.property.test.ts` (Property 13)
  - `measure-missing-values.property.test.ts` (Property 14)
  - `resolver-determinism-position.property.test.ts` (Property 15)
  - `disambiguation-numbering.property.test.ts` (Property 16)
  - `resolved-preservation-guard.property.test.ts` (Property 17)
- **Geradores**: um gerador de "Food_Database sintético" produz `FoodEntry[]` com nomes
  (incluindo variantes acentuadas e maiúsculas), aliases, medidas ativas/inativas e valores
  nutricionais válidos/inválidos; um gerador de termos deriva variações de caixa/acento/espaço
  a partir de nomes existentes e de ruído. Um `RepositoryFake` sobre `listActiveFoodEntries`
  torna o núcleo puro e offline. Um `FoodSelector` determinístico de teste (e um "adversário"
  que devolve ids inválidos/lança/atrasa) cobre as properties de seleção/abstenção.

### Testes de exemplo e integração

- **Exemplos (unit)**: comportamento do `MockInterpreter` (Req 1.1, 1.5), formatação do resumo
  de confirmação (Req 8.1), tokens de confirmação (Req 8.2 — reuso do spec base), payload
  enviado ao selector (Req 4.1, 4.7 — spy), contagem de 1 tentativa e demora > 5 s com relógio
  fake (Req 9.4), mensagem de saturação (Req 6.5).
- **Integração**: `SqliteRepository.listActiveFoodEntries` sobre banco `:memory:` semeado,
  validando que registros com maiúsculas acentuadas são carregados e alcançáveis (fecha o bug
  do `lower()` ASCII-only — Req 2.4) e que o resultado é determinístico entre chamadas
  (Req 10.1).
- **E2E**: fluxo de desambiguação por alimento e por medida até a confirmação
  (`tests/e2e/questions-flow`), reutilizando o `MockInterpreter` roteirizado e `seedFoods: false`
  com fixtures controladas.
- **Smoke**: `buildApp` padrão usa `MockInterpreter` e nenhum `Food_Selector` (Req 9.1, 9.2);
  núcleo (`Normalizer`, `Candidate_Provider`) sem chamadas de rede (Req 9.7, 10.6).

### Reuso do spec base

As garantias já cobertas pelo spec `glicia` (confirmação obrigatória antes de
cálculo/persistência, atomicidade, imutabilidade histórica, determinismo do cálculo de
insulina) permanecem válidas e **não** são recriadas; a Property 17 apenas reforça a guarda
de confirmação sob as novas pendências de desambiguação por alimento e por medida.
