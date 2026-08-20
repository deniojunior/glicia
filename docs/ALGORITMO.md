# Como o Glicia calcula (documentação do algoritmo)

Este documento explica, em detalhe, **como o Glicia transforma uma mensagem em
linguagem natural em uma dose de insulina calculada**. Ele complementa o
[README](../README.md).

> ⚠️ **Aviso clínico.** A fórmula aqui descrita reproduz o protocolo configurado
> na planilha da usuária. **Não é uma recomendação médica universal.** Veja o
> [aviso completo no README](../README.md#-aviso-importante).

---

## Princípio central

> **"IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."**

Cada etapa tem uma responsabilidade única e isolada:

| Etapa | Componente | O que faz | O que **nunca** faz |
|-------|-----------|-----------|---------------------|
| Interpretar | `Interpreter` (Mock/OpenAI) | Extrai dados explícitos da mensagem | Calcular, recomendar ou inventar dados |
| Fornecer dados | `Repository` + `Food_Database` | Devolve valores nutricionais e parâmetros | Calcular a dose |
| Calcular | `calculateInsulin` (função pura) | Calcula a dose de forma determinística | IO, rede, env |
| Confirmar | `ConversationOrchestrator` | Só persiste após confirmação explícita | Persistir sem confirmação |

A dose de insulina é calculada em **um único lugar do código**
(`src/domain/insulin/calculate-insulin.ts`), sem qualquer dependência externa.

---

## Visão geral do fluxo

```
mensagem de texto
      │
      ▼
1. Interpretação        → glicemia, tipo de refeição, itens, o que falta
      │                    (nunca contém dose; qualquer campo de dose é descartado)
      ▼
2. Resolução de alimentos → cada item é associado a um Food da base local
      │
      ▼
3. Cálculo de carboidratos → soma determinística dos CHO por item
      │
      ▼
4. Confirmação explícita → a usuária revisa e responde "sim"
      │
      ▼
5. Cálculo de insulina   → dose de correção + dose de carboidrato → arredondamento
      │
      ▼
6. Persistência atômica  → refeição + cálculo + itens, com snapshot dos parâmetros
```

---

## 1. Interpretação (extrair, nunca inventar)

O `Interpreter` converte a mensagem em uma estrutura `MealInterpretation`:

```ts
interface MealInterpretation {
  glucose: number | null;             // glicemia, se presente
  meal: "BREAKFAST" | "LUNCH" | "SNACK" | "DINNER" | null;
  items: { foodName: string; quantity: number | null; unit: string | null }[];
  missingInformation: ("GLUCOSE" | "MEAL" | "FOOD_QUANTITY" | "FOOD")[];
}
```

Regras:

- Extrai **apenas** o que está explícito na mensagem. Se a glicemia não foi dita,
  `glucose` é `null` e `GLUCOSE` entra em `missingInformation`.
- **Nunca** produz um campo de dose. Se um interpretador futuro (por exemplo,
  baseado em OpenAI) devolver algo parecido com dose, a função
  `sanitizeInterpretation` **remove** esse campo antes de qualquer uso.
- Na Fase 1, o `MockInterpreter` faz isso localmente e de forma determinística,
  sem chamadas de rede.

---

## 2. Resolução de alimentos (a base é a fonte da verdade)

A base local é **normalizada** em dois registros:

- **`food`** — a **identidade** do alimento (ex.: "Arroz branco cozido").
- **`food_measure`** — cada par **alimento + medida** é um registro próprio, com
  sua própria quantidade e seu próprio carboidrato. Um mesmo alimento pode ter
  várias medidas (ex.: arroz em "colher de sopa" de 25 g e em "escumadeira" de
  90 g). Apelidos (`food_alias`) apontam para a identidade.

Cada item interpretado é resolvido pelo `FoodResolver` em **dois passos**:

**Passo 1 — identidade do alimento** (cadeia de precedência, parando no primeiro
nível que casar):

1. **Alias exato** (ex.: "arroz" → "Arroz branco cozido")
2. **Nome exato** do alimento
3. **Candidato único** conhecido

**Passo 2 — medida do alimento** (dado um alimento resolvido):

- se a **unidade informada** casa exatamente com uma medida → resolve com ela;
- se a unidade não foi informada e o alimento tem **uma única** medida → resolve
  com ela;
- caso contrário (várias medidas, ou unidade que não casa) → **ambiguidade de
  medida**: o orquestrador lista as medidas e pede para escolher uma.

A comparação (de nome, alias e unidade) é **insensível a maiúsculas/minúsculas e
a espaços** nas extremidades (`normalizeName` aplica `trim().toLowerCase()`).

Possíveis desfechos:

- `RESOLVED` — o item foi associado a um **alimento + medida**.
- `AMBIGUOUS` — há mais de uma opção (vários alimentos e/ou várias medidas); o
  orquestrador apresenta a lista no formato "alimento (medida)" e pede para a
  usuária escolher exatamente uma.
- `UNRESOLVED` — nenhum alimento/medida corresponde; o orquestrador pede
  esclarecimento e **preserva os itens já resolvidos**.

Os valores nutricionais (carboidrato por medida, quantidade da medida) vêm
**exclusivamente** de `food_measure` — nunca do interpretador.

---

## 3. Cálculo de carboidratos (determinístico)

Para cada item resolvido, o carboidrato usa os valores da **medida escolhida**
(`food_measure`):

```
choItem = round2( quantidade × (carboidratoDaMedida / quantidadeDaMedida) )
```

E o total da refeição:

```
totalCHO = round2( Σ choItem )   // soma apenas dos itens válidos
```

- `round2` arredonda para **2 casas decimais** (em gramas).
- Itens com quantidade inválida (`≤ 0`, ausente, `NaN`, `Infinity`) ou medida
  padrão inválida são **excluídos do total** e marcados como não resolvidos —
  sem interromper o cálculo dos demais.

**Exemplo.** 3 colheres de "Arroz branco cozido" (6,2 g de CHO por medida de
25 g):

```
choItem = round2( 3 × (6.2 / 25) ) = round2(0.744) = 0.74 g
```

---

## 4. Confirmação explícita

Antes de calcular qualquer dose, o `ConversationOrchestrator`:

1. Apresenta a interpretação da refeição **e o total de carboidratos** para revisão.
2. Coloca a conversa em `WAITING_CONFIRMATION`.
3. Só prossegue mediante uma **confirmação afirmativa explícita** (ex.: "sim").

Regras de segurança:

- Rejeição/correção → volta a `ACTIVE` e pergunta qual dado ajustar. **Nada é
  calculado ou persistido.**
- Resposta ambígua/não reconhecida → reapresenta o resumo e pede confirmação
  novamente.
- Sem resposta em **10 minutos** → mantém `WAITING_CONFIRMATION` e não calcula.
- A confirmação valida **os dados da refeição**, não uma dose sugerida por IA.

---

## 5. Cálculo de insulina (função pura)

Implementado em `calculateInsulin` (`src/domain/insulin/calculate-insulin.ts`),
`FORMULA_VERSION = "1.0"`.

### Entradas

| Campo | Significado | Origem |
|-------|-------------|--------|
| `glucose` | Glicemia atual (mg/dL) | mensagem da usuária |
| `carbohydrates` | Total de CHO da refeição (g) | etapa 3 |
| `targetGlucose` | Glicemia alvo (mg/dL) | `insulin_settings` (default 120) |
| `correctionFactor` | Fator de correção (mg/dL por unidade) | `insulin_settings` (default 40) |
| `carbohydrateRatio` | Relação insulina/carboidrato por refeição | `insulin_meal_settings` |

Razões de carboidrato padrão por refeição: **café da manhã 8, almoço 6,
lanche 8, jantar 10** (gramas por unidade).

### Fórmula

```
doseCorrecao      = (glucose − targetGlucose) / correctionFactor
doseCarboidrato   = carbohydrates / carbohydrateRatio
doseTotal         = doseCorrecao + doseCarboidrato        (valor bruto)
doseArredondada   = arredondaMeioParaLongeDoZero(doseTotal)
```

O resultado devolve `correctionDose`, `carbohydrateDose`, `totalDose` (bruto) e
`roundedDose` (inteiro) como **valores separados**.

### Comportamentos importantes

- **Glicemia igual à meta** → `doseCorrecao = 0`.
- **Glicemia abaixo da meta** → `doseCorrecao` **negativa**, refletida na
  `doseTotal` (o protocolo pode reduzir a dose).
- **Zero carboidrato** (com razão > 0) → `doseCarboidrato = 0`.

### Arredondamento — "meio para a maior magnitude"

```ts
function arredondaMeioParaLongeDoZero(x) {
  return Math.sign(x) * Math.round(Math.abs(x));
}
```

Isso reproduz o comportamento da planilha original no empate exato de `0,5`:

| Entrada | Resultado |
|---------|-----------|
| `2.5`   | `3`  |
| `-2.5`  | `-3` |
| `2.4`   | `2`  |
| `3.5`   | `4`  |

(`Math.round(-2.5)` sozinho daria `-2`; por isso separamos sinal e magnitude.)

### Erros (nunca "chute" de dose)

A função **lança uma exceção tipada** (`InsulinCalculationError`) em vez de
produzir uma dose inválida:

- `ZERO_DIVISOR` — se `correctionFactor === 0` ou `carbohydrateRatio === 0`.
- `MISSING_OR_INVALID_INPUT` — se qualquer entrada for ausente, `null`, não
  numérica, `NaN` ou infinita.

### Propriedades garantidas (testadas com property-based testing)

- **Determinismo**: mesma entrada → mesma saída, sempre.
- **Composição**: `totalDose ≈ correctionDose + carbohydrateDose`.
- **Monotonicidade**: com `correctionFactor > 0`, glicemia maior → dose de
  correção maior.
- **Pureza**: sem rede, IO, filesystem ou variáveis de ambiente.

---

## 6. Persistência atômica com snapshot

Quando a usuária confirma, o sistema persiste **refeição + cálculo + itens** em
uma única transação (tudo ou nada). Junto ao cálculo são gravados:

- **Parameter_Snapshot** — cópia de `target_glucose`, `correction_factor` e
  `carbohydrate_ratio` **usados naquele cálculo**;
- **Formula_Version** — `"1.0"`;
- os valores por item (`food_name_snapshot`, `quantity`, `unit`, `carbohydrates`).

Assim, **registros históricos permanecem corretos mesmo se os parâmetros ou os
alimentos mudarem depois**. Uma refeição antiga sempre é exibida a partir do que
foi gravado no momento, nunca recalculada com valores atuais.

### Dose calculada × dose aplicada

A **dose calculada** e a **dose efetivamente aplicada** pela usuária são
armazenadas em campos **independentes**. O sistema nunca preenche uma a partir da
outra; quando ambas existem, ele exibe a **diferença** entre elas.

---

## Onde está no código

| Conceito | Arquivo |
|----------|---------|
| Cálculo de insulina | `src/domain/insulin/calculate-insulin.ts` |
| Cálculo de carboidratos | `src/domain/meals/calculate-meal-carbs.ts` |
| Resolução de alimentos (alimento + medida) | `src/domain/foods/food-resolver.ts` |
| Sanitização da interpretação | `src/domain/conversation/sanitize-interpretation.ts` |
| Orquestração da conversa | `src/domain/conversation/orchestrator.ts` |
| Esquema do banco (`food`, `food_measure`, `food_alias`, ...) | `migrations/0001_init.sql`, `migrations/0002_seed_patient_defaults.sql` |
| Base de alimentos (amostra + importador) | `seeds/sbd-foods.csv`, `seeds/sbd-aliases.csv`, `seeds/import-sbd-foods.ts` |
