import { describe, expect, it } from "vitest";

import { InMemoryRepository } from "../../src/adapters/persistence/in-memory-repository.js";
import { CandidateProvider } from "../../src/domain/foods/candidate-provider.js";
import { FoodResolver } from "../../src/domain/foods/food-resolver.js";

describe("memória de preferências alimentares", () => {
  it("reaplica alimento e medida aprendidos sem substituir a quantidade atual", async () => {
    const repo = new InMemoryRepository();
    const saved = repo.addFoodWithMeasure({
      name: "Café coado sem açúcar",
      servingUnit: "xícara de café",
      servingQuantity: 50,
      carbohydrates: 0,
    });

    await repo.upsertFoodMemory({
      phrase: "café",
      normalizedPhrase: "cafe",
      foodId: saved.food.id,
      measureId: saved.measure.id,
    });

    const resolver = new FoodResolver({
      candidateProvider: new CandidateProvider(repo),
      memory: repo,
    });
    const result = await resolver.resolveItem({
      foodName: "Café",
      quantity: 2,
      unit: "xícaras",
    });

    expect(result.kind).toBe("RESOLVED");
    if (result.kind !== "RESOLVED") return;
    expect(result.item.foodId).toBe(saved.food.id);
    expect(result.item.quantity).toBe(2);
    expect(result.item.servingQuantity).toBe(50);
  });

  it("atualiza a preferência quando o usuário corrige a associação", async () => {
    const repo = new InMemoryRepository();
    const first = repo.addFoodWithMeasure({
      name: "Café coado",
      servingUnit: "xícara",
      servingQuantity: 50,
      carbohydrates: 0,
    });
    const second = repo.addFoodWithMeasure({
      name: "Café com leite",
      servingUnit: "xícara",
      servingQuantity: 50,
      carbohydrates: 5,
    });

    await repo.upsertFoodMemory({
      phrase: "café",
      normalizedPhrase: "cafe",
      foodId: first.food.id,
      measureId: first.measure.id,
    });
    await repo.upsertFoodMemory({
      phrase: "café",
      normalizedPhrase: "cafe",
      foodId: second.food.id,
      measureId: second.measure.id,
    });

    const memory = await repo.findFoodMemory("cafe");
    expect(memory?.foodId).toBe(second.food.id);
    expect((await repo.listFoodMemories())).toHaveLength(1);
  });
});
