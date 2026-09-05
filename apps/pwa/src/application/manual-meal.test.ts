import { describe, expect, it } from "vitest";

import { createManualMealTurn } from "./manual-meal";

describe("createManualMealTurn", () => {
  it("estrutura os dados informados sem depender de IA", () => {
    expect(createManualMealTurn({
      carbohydrates: "42,5",
      glucose: "135",
      glucoseTrend: "ESTAVEL",
      mealType: "ALMOCO"
    })).toMatchObject({
      total_carbohydrates: 42.5,
      glucose: 135,
      glucose_trend: "ESTAVEL",
      meal_type: "ALMOCO",
      food_memory_updates: []
    });
  });

  it("rejeita valores ausentes ou fora dos limites", () => {
    expect(() => createManualMealTurn({ carbohydrates: "", glucose: "120", glucoseTrend: "ESTAVEL", mealType: "ALMOCO" })).toThrow("carboidratos");
    expect(() => createManualMealTurn({ carbohydrates: "20", glucose: "0", glucoseTrend: "ESTAVEL", mealType: "ALMOCO" })).toThrow("glicemia");
  });
});
