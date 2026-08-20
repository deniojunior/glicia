// tests/property/parameter-range.property.test.ts
//
// Teste de propriedade — validação de faixa dos parâmetros de cálculo (task 12.8).
//
// Feature: glicia, Property 21: Validação de faixa dos parâmetros de cálculo
//
// Para todo valor de parâmetro (target_glucose, correction_factor,
// carbohydrate_ratio):
//   - uma atualização com número finito em (0, 999] é ACEITA e persistida, de
//     modo que getInsulinParameters reflita o novo valor (Req 8.8);
//   - uma atualização com valor não numérico (NaN, ±Infinity), <= 0 ou > 999 é
//     REJEITADA (lança erro) e o valor anteriormente armazenado é PRESERVADO
//     (relido inalterado) (Req 8.9).
//
// Estratégia (rápida a 100 execuções): cada execução da propriedade usa um
// SqliteRepository em ":memory:" recém-criado (migrations + seed default da
// paciente aplicados no construtor). Como getInsulinParameters lê através do
// próprio repositório, não é necessária conexão bruta. Antes de cada tentativa
// inválida, o valor corrente é registrado via getInsulinParameters; após a
// rejeição, ele é relido e comparado para confirmar a preservação.
//
// Validates: Requirements 8.8, 8.9

import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import { SqliteRepository } from "../../src/adapters/persistence/sqlite-repository.js";
import type { MealType } from "../../src/domain/types.js";

// Parâmetro alvo: os dois globais (via updateInsulinSetting) e o por-refeição
// (via updateCarbohydrateRatio).
type Param = "target_glucose" | "correction_factor" | "carbohydrate_ratio";

const paramArb: fc.Arbitrary<Param> = fc.constantFrom(
  "target_glucose",
  "correction_factor",
  "carbohydrate_ratio",
);

const mealTypeArb: fc.Arbitrary<MealType> = fc.constantFrom(
  "BREAKFAST",
  "LUNCH",
  "SNACK",
  "DINNER",
);

// Valores VÁLIDOS: número finito em (0, 999]. Mistura de doubles no intervalo
// aberto-fechado com inteiros de fronteira (1 e 999) e defaults do seed.
const validValueArb: fc.Arbitrary<number> = fc.oneof(
  fc.double({
    min: Number.MIN_VALUE,
    max: 999,
    noNaN: true,
    noDefaultInfinity: true,
  }),
  fc.constantFrom(1, 999, 0.1, 8, 40, 120, 500, 998.5),
);

// Valores INVÁLIDOS: <= 0, > 999, NaN, +Infinity, -Infinity.
const invalidValueArb: fc.Arbitrary<number> = fc.oneof(
  // <= 0 (inclui 0 e negativos finitos)
  fc.double({ max: 0, noNaN: true, noDefaultInfinity: true }),
  // > 999 (finitos acima do limite superior)
  fc.double({ min: 1000, max: 1e9, noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(999.0001, 1000, 1e6),
  // não numéricos / não finitos
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY),
);

// Aplica a atualização do parâmetro escolhido, roteando para o método correto.
async function applyUpdate(
  repo: SqliteRepository,
  param: Param,
  value: number,
  mealType: MealType,
): Promise<void> {
  if (param === "carbohydrate_ratio") {
    await repo.updateCarbohydrateRatio(mealType, value);
    return;
  }
  await repo.updateInsulinSetting(param, value);
}

// Lê o valor corrente do parâmetro escolhido via getInsulinParameters.
async function readValue(
  repo: SqliteRepository,
  param: Param,
  mealType: MealType,
): Promise<number> {
  const params = await repo.getInsulinParameters(mealType);
  expect(params).not.toBeNull();
  if (params === null) {
    throw new Error("parâmetros ausentes — seed não aplicado");
  }
  switch (param) {
    case "target_glucose":
      return params.targetGlucose;
    case "correction_factor":
      return params.correctionFactor;
    case "carbohydrate_ratio":
      return params.carbohydrateRatio;
  }
}

// Repositórios abertos durante cada execução; fechados no afterEach para não
// vazar conexões (cada execução usa um ":memory:" independente).
const openRepos: SqliteRepository[] = [];

function freshRepo(): SqliteRepository {
  const repo = new SqliteRepository({ dbPath: ":memory:" });
  openRepos.push(repo);
  return repo;
}

afterEach(() => {
  while (openRepos.length > 0) {
    const repo = openRepos.pop();
    try {
      repo?.close();
    } catch {
      // ignora falha de fechamento
    }
  }
});

describe("Feature: glicia, Property 21: Validação de faixa dos parâmetros de cálculo", () => {
  it("ACEITA e persiste valores finitos em (0, 999] (Req 8.8)", async () => {
    await fc.assert(
      fc.asyncProperty(
        paramArb,
        mealTypeArb,
        validValueArb,
        async (param, mealType, value) => {
          const repo = freshRepo();

          await applyUpdate(repo, param, value, mealType);

          const stored = await readValue(repo, param, mealType);
          expect(stored).toBe(value);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("REJEITA valores não numéricos, <= 0 ou > 999 e PRESERVA o valor anterior (Req 8.9)", async () => {
    await fc.assert(
      fc.asyncProperty(
        paramArb,
        mealTypeArb,
        invalidValueArb,
        async (param, mealType, value) => {
          const repo = freshRepo();

          // Valor corrente antes da tentativa inválida (default do seed).
          const before = await readValue(repo, param, mealType);

          // A atualização inválida deve lançar (rejeição).
          await expect(applyUpdate(repo, param, value, mealType)).rejects.toThrow();

          // O valor anterior permanece inalterado após a rejeição.
          const after = await readValue(repo, param, mealType);
          expect(after).toBe(before);
        },
      ),
      { numRuns: 100 },
    );
  });
});
