import { describe, it, expect } from "vitest";
import fc from "fast-check";

import { FoodResolver } from "../../src/domain/foods/food-resolver.js";
import type {
  Food,
  FoodMeasure,
  Repository,
} from "../../src/domain/ports/repository.js";
import type { InterpretedItem } from "../../src/domain/types.js";

/**
 * Teste de propriedade — múltiplos candidatos produzem ambiguidade.
 *
 * Feature: glicia, Property 10: Múltiplos candidatos produzem ambiguidade
 *
 * Modelo NORMALIZADO — resolução em dois passos (Req 4.1, 12.2):
 *   1) Identidade do alimento (Food): alias exato (Req 4.3) → nome exato
 *      (Req 4.4) → candidatos conhecidos (Req 4.5).
 *   2) Medida do alimento (FoodMeasure): cada par (alimento + medida) carrega
 *      seu próprio carboidrato; a medida define os valores nutricionais.
 *
 * Uma resolução se torna AMBÍGUA de duas formas (Req 4.6):
 *   (a) múltiplos ALIMENTOS casam com o nome (alias/nome exatos nulos e
 *       findFoodCandidates devolve N >= 2) → os candidatos são cada alimento
 *       expandido em suas medidas (ResolvedFoodMeasure[]).
 *   (b) um único alimento tem múltiplas MEDIDAS e nenhuma unidade informada
 *       (ou a unidade não casa) → os candidatos são as medidas desse alimento.
 *
 * O foco principal é o caso (a) com N alimentos DISTINTOS, cada um com
 * EXATAMENTE UMA medida: `resolveItem` deve retornar
 * `{ kind: "AMBIGUOUS", foodName, candidates }`, onde `candidates` tem N pares
 * (um por alimento) e `foodName` preserva o nome original informado.
 *
 * Os casos N = 0 e N = 1 são verificados como contraste; a ambiguidade por
 * medida (caso b) é verificada como cenário adicional.
 *
 * Validates: Requirements 4.6
 */
describe("Feature: glicia, Property 10: Múltiplos candidatos produzem ambiguidade", () => {
  // Métodos de leitura de alimentos exigidos pelo FoodResolver (modelo em dois
  // passos): identidade do alimento + medidas do alimento.
  type FoodRepo = Pick<
    Repository,
    | "findFoodByAliasExact"
    | "findFoodByNameExact"
    | "findFoodCandidates"
    | "findMeasuresByFoodId"
  >;

  // Repositório fake: SEM alias exato e SEM nome exato, forçando a resolução a
  // recair sobre a lista de candidatos fornecida. As medidas de cada alimento
  // vêm de um mapa foodId → FoodMeasure[].
  function makeRepo(
    candidates: Food[],
    measuresByFoodId: Map<string, FoodMeasure[]>,
  ): FoodRepo {
    return {
      async findFoodByAliasExact(): Promise<Food | null> {
        return null;
      },
      async findFoodByNameExact(): Promise<Food | null> {
        return null;
      },
      async findFoodCandidates(): Promise<Food[]> {
        return candidates;
      },
      async findMeasuresByFoodId(foodId: string): Promise<FoodMeasure[]> {
        return measuresByFoodId.get(foodId) ?? [];
      },
    };
  }

  // Gerador de uma única FoodMeasure para um dado alimento/índice.
  function measureFor(foodId: string, measureIndex: number): fc.Arbitrary<FoodMeasure> {
    return fc.record({
      id: fc.constant(`${foodId}-m${measureIndex}`),
      foodId: fc.constant(foodId),
      servingUnit: fc.string({ minLength: 1, maxLength: 10 }),
      servingQuantity: fc.double({
        min: Math.fround(0.01),
        max: 1000,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      carbohydrates: fc.double({
        min: 0,
        max: 500,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      active: fc.constant(true),
    });
  }

  // Gera N alimentos DISTINTOS (ids únicos), cada um com EXATAMENTE UMA medida.
  // Retorna a lista de candidatos e o mapa foodId → [medida].
  function foodsEachOneMeasure(
    minCount: number,
    maxCount: number,
  ): fc.Arbitrary<{
    candidates: Food[];
    measuresByFoodId: Map<string, FoodMeasure[]>;
  }> {
    return fc.integer({ min: minCount, max: maxCount }).chain((count) =>
      fc
        .tuple(
          ...Array.from({ length: count }, (_unused, index) => {
            const id = `food-${index}`;
            return fc.record({
              food: fc.record({
                id: fc.constant(id),
                name: fc.string({ minLength: 1, maxLength: 20 }),
                active: fc.constant(true),
              }),
              measure: measureFor(id, 0),
            });
          }),
        )
        .map((entries) => {
          const candidates = entries.map((entry) => entry.food);
          const measuresByFoodId = new Map<string, FoodMeasure[]>();
          for (const entry of entries) {
            measuresByFoodId.set(entry.food.id, [entry.measure]);
          }
          return { candidates, measuresByFoodId };
        }),
    );
  }

  // Gera 1 alimento com M >= 2 medidas (para a ambiguidade por medida — caso b).
  function singleFoodManyMeasures(
    minMeasures: number,
    maxMeasures: number,
  ): fc.Arbitrary<{
    candidates: Food[];
    measuresByFoodId: Map<string, FoodMeasure[]>;
  }> {
    const id = "food-single";
    return fc.integer({ min: minMeasures, max: maxMeasures }).chain((count) =>
      fc
        .tuple(
          ...Array.from({ length: count }, (_unused, index) =>
            measureFor(id, index),
          ),
        )
        .map((measures) => {
          const candidates: Food[] = [
            { id, name: "arroz", active: true },
          ];
          const measuresByFoodId = new Map<string, FoodMeasure[]>([
            [id, measures],
          ]);
          return { candidates, measuresByFoodId };
        }),
    );
  }

  // Gerador de um InterpretedItem SEM unidade — o foodName é preservado no
  // outcome e a ausência de unidade mantém o foco na ambiguidade estrutural.
  const interpretedItem: fc.Arbitrary<InterpretedItem> = fc.record({
    foodName: fc.string({ minLength: 1, maxLength: 30 }),
    quantity: fc.option(
      fc.double({
        min: Math.fround(0.01),
        max: 1000,
        noNaN: true,
        noDefaultInfinity: true,
      }),
      { nil: null },
    ),
    unit: fc.constant<string | null>(null),
  });

  it("N >= 2 alimentos (1 medida cada) → AMBIGUOUS com N pares e o foodName original", async () => {
    await fc.assert(
      fc.asyncProperty(
        interpretedItem,
        foodsEachOneMeasure(2, 10),
        async (item, { candidates, measuresByFoodId }) => {
          const resolver = new FoodResolver(
            makeRepo(candidates, measuresByFoodId),
          );

          const outcome = await resolver.resolveItem(item);

          // Múltiplos alimentos → ambiguidade (Req 4.6).
          expect(outcome.kind).toBe("AMBIGUOUS");
          if (outcome.kind !== "AMBIGUOUS") return;

          // Cada alimento contribui com exatamente uma medida → N pares.
          expect(outcome.candidates.length).toBe(candidates.length);
          expect(outcome.candidates.map((c) => c.food.id)).toEqual(
            candidates.map((food) => food.id),
          );

          // O foodName preserva o nome original informado pela paciente.
          expect(outcome.foodName).toBe(item.foodName);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("ambiguidade por medida: 1 alimento com M >= 2 medidas e sem unidade → AMBIGUOUS com M pares", async () => {
    await fc.assert(
      fc.asyncProperty(
        interpretedItem,
        singleFoodManyMeasures(2, 10),
        async (item, { candidates, measuresByFoodId }) => {
          const resolver = new FoodResolver(
            makeRepo(candidates, measuresByFoodId),
          );

          const outcome = await resolver.resolveItem(item);

          expect(outcome.kind).toBe("AMBIGUOUS");
          if (outcome.kind !== "AMBIGUOUS") return;

          const foodId = candidates[0]!.id;
          const measures = measuresByFoodId.get(foodId)!;

          // Todos os pares compartilham o mesmo alimento e listam suas medidas.
          expect(outcome.candidates.length).toBe(measures.length);
          expect(
            outcome.candidates.every((c) => c.food.id === foodId),
          ).toBe(true);
          expect(outcome.foodName).toBe(item.foodName);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("contraste: exatamente 1 alimento com 1 medida → RESOLVED (delimita a fronteira)", async () => {
    await fc.assert(
      fc.asyncProperty(
        interpretedItem,
        foodsEachOneMeasure(1, 1),
        async (item, { candidates, measuresByFoodId }) => {
          const resolver = new FoodResolver(
            makeRepo(candidates, measuresByFoodId),
          );

          const outcome = await resolver.resolveItem(item);

          expect(outcome.kind).toBe("RESOLVED");
          if (outcome.kind !== "RESOLVED") return;
          // O único candidato é o Food associado.
          expect(outcome.item.foodId).toBe(candidates[0]!.id);
        },
      ),
      { numRuns: 100 },
    );
  });

  it("contraste: 0 candidatos → UNRESOLVED (delimita a fronteira)", async () => {
    await fc.assert(
      fc.asyncProperty(interpretedItem, async (item) => {
        const resolver = new FoodResolver(
          makeRepo([], new Map<string, FoodMeasure[]>()),
        );

        const outcome = await resolver.resolveItem(item);

        expect(outcome.kind).toBe("UNRESOLVED");
        if (outcome.kind !== "UNRESOLVED") return;
        expect(outcome.foodName).toBe(item.foodName);
      }),
      { numRuns: 100 },
    );
  });
});
