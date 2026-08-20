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
 * Teste de propriedade — precedência da resolução de alimentos.
 *
 * Feature: glicia, Property 8: Precedência da resolução de alimentos
 *
 * A cadeia de precedência do FoodResolver (Req 4.1) resolve em DOIS PASSOS:
 * primeiro a identidade do alimento (Food), depois a medida (FoodMeasure).
 * O passo de identidade deve parar no primeiro nível que produzir
 * correspondência:
 *   1) alias exato                → Food do alias   (Req 4.3)
 *   2) nome exato                 → Food do nome     (Req 4.4)
 *   3) exatamente 1 candidato     → esse candidato    (Req 4.5)
 *      0 candidatos               → UNRESOLVED        (Req 4.8)
 *      > 1 candidatos             → AMBIGUOUS com os pares alimento+medida
 *
 * Como cada alimento tem EXATAMENTE UMA medida e o item não informa unidade
 * (unit=null), o passo de medida resolve direto (RESOLVED) quando um único
 * alimento é selecionado.
 *
 * A propriedade varre o espaço de configurações do repositório usando três
 * booleanos/contagem gerados por fast-check (hasAlias, hasName, candidateCount)
 * e verifica que o resultado corresponde EXATAMENTE ao primeiro nível que casa,
 * independentemente do que os níveis inferiores retornariam.
 *
 * Validates: Requirements 4.1, 4.3, 4.4, 4.5
 */
describe("Feature: glicia, Property 8: Precedência da resolução de alimentos", () => {
  // Métodos de leitura de alimentos exigidos pelo FoodResolver: identidade
  // (alias/nome/candidatos) e medidas por alimento (resolução em dois passos).
  type FoodRepo = Pick<
    Repository,
    | "findFoodByAliasExact"
    | "findFoodByNameExact"
    | "findFoodCandidates"
    | "findMeasuresByFoodId"
  >;

  // Ids distintos por nível, para provar QUAL Food foi escolhido.
  const ALIAS_FOOD_ID = "alias-food";
  const NAME_FOOD_ID = "name-food";
  const candidateId = (i: number): string => `candidate-${i}`;

  function makeFood(id: string): Food {
    return {
      id,
      name: id,
      active: true,
    };
  }

  // Cada alimento tem EXATAMENTE UMA medida, para que a seleção de um único
  // alimento resolva a medida sem ambiguidade (RESOLVED, não measure-ambiguity).
  function makeMeasure(foodId: string): FoodMeasure {
    return {
      id: `${foodId}-measure`,
      foodId,
      servingUnit: "colher",
      servingQuantity: 25,
      carbohydrates: 6,
      active: true,
    };
  }

  // Fake configurável: cada método retorna valores derivados dos booleanos/contagem.
  function makeFakeRepo(config: {
    hasAlias: boolean;
    hasName: boolean;
    candidateCount: number;
  }): FoodRepo {
    const aliasFood = config.hasAlias ? makeFood(ALIAS_FOOD_ID) : null;
    const nameFood = config.hasName ? makeFood(NAME_FOOD_ID) : null;
    const candidates: Food[] = Array.from(
      { length: config.candidateCount },
      (_unused, i) => makeFood(candidateId(i)),
    );

    // Mapa foodId → [medida única]. Cobre todos os alimentos possíveis.
    const measuresByFoodId = new Map<string, FoodMeasure[]>();
    for (const food of [
      ...(aliasFood ? [aliasFood] : []),
      ...(nameFood ? [nameFood] : []),
      ...candidates,
    ]) {
      measuresByFoodId.set(food.id, [makeMeasure(food.id)]);
    }

    return {
      async findFoodByAliasExact(): Promise<Food | null> {
        return aliasFood;
      },
      async findFoodByNameExact(): Promise<Food | null> {
        return nameFood;
      },
      async findFoodCandidates(): Promise<Food[]> {
        return candidates;
      },
      async findMeasuresByFoodId(foodId: string): Promise<FoodMeasure[]> {
        return measuresByFoodId.get(foodId) ?? [];
      },
    };
  }

  // unit=null → alimento com medida única resolve direto (RESOLVED).
  const item: InterpretedItem = {
    foodName: "arroz",
    quantity: 3,
    unit: null,
  };

  it("obedece à cadeia de precedência, parando no primeiro nível que casa", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.boolean(), // hasAlias
        fc.boolean(), // hasName
        fc.integer({ min: 0, max: 5 }), // candidateCount (0, 1 ou >1)
        async (hasAlias, hasName, candidateCount) => {
          const repo = makeFakeRepo({ hasAlias, hasName, candidateCount });
          const resolver = new FoodResolver(repo);

          const outcome = await resolver.resolveItem(item);

          if (hasAlias) {
            // Nível 1: alias vence, independentemente de nome/candidatos.
            expect(outcome.kind).toBe("RESOLVED");
            if (outcome.kind !== "RESOLVED") return;
            expect(outcome.item.foodId).toBe(ALIAS_FOOD_ID);
          } else if (hasName) {
            // Nível 2: nome exato vence sobre candidatos.
            expect(outcome.kind).toBe("RESOLVED");
            if (outcome.kind !== "RESOLVED") return;
            expect(outcome.item.foodId).toBe(NAME_FOOD_ID);
          } else if (candidateCount === 1) {
            // Nível 3: exatamente 1 candidato → RESOLVED com esse candidato.
            expect(outcome.kind).toBe("RESOLVED");
            if (outcome.kind !== "RESOLVED") return;
            expect(outcome.item.foodId).toBe(candidateId(0));
          } else if (candidateCount === 0) {
            // Nenhuma correspondência → UNRESOLVED.
            expect(outcome.kind).toBe("UNRESOLVED");
            if (outcome.kind !== "UNRESOLVED") return;
            expect(outcome.foodName).toBe(item.foodName);
          } else {
            // > 1 candidatos → AMBIGUOUS com os pares alimento+medida.
            // Cada alimento contribui com exatamente uma medida, logo há um
            // par por alimento, na ordem dos candidatos.
            expect(outcome.kind).toBe("AMBIGUOUS");
            if (outcome.kind !== "AMBIGUOUS") return;
            expect(outcome.foodName).toBe(item.foodName);
            expect(outcome.candidates.map((c) => c.food.id)).toEqual(
              Array.from({ length: candidateCount }, (_u, i) => candidateId(i)),
            );
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
