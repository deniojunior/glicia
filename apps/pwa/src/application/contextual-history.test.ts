import { describe, expect, it, vi } from "vitest";

import type { MealHistoryRepository, MealRecord } from "./meal-history";
import { createReusedMealTurn, findHistoricalMealCandidates, resolveHistoricalMealReference } from "./contextual-history";

const record: MealRecord = {
  id: "meal-1", created_at: "2026-09-04T15:00:00Z", meal_input: "almoço", assistant_summary: "Arroz e feijão", interaction_mode: "preciso",
  meal_type: "ALMOCO", meal_items: [{ name: "Arroz", portion: "100 g", carbohydrates: 28 }], carbohydrates: 52, glucose: 120, glucose_trend: "ESTAVEL",
  target_glucose: 100, correction_factor: 30, carbohydrate_ratio: 6, basal_morning_units: 10, correction_dose: 0.67, carbohydrate_dose: 8.67,
  trend_adjustment: 0, calculated_dose: 9.34, suggested_dose: 9.5, applied_dose: 9, provider: "openai", model: "gpt-4o-mini"
};

describe("histórico contextual", () => {
  it("resolve ontem e o tipo de refeição sem delegar datas à IA", () => {
    const reference = resolveHistoricalMealReference("Vou almoçar a mesma coisa que ontem", new Date(2026, 8, 5, 12));
    expect(reference?.mealType).toBe("ALMOCO");
    expect(new Date(reference!.from).getDate()).toBe(4);
    expect(new Date(reference!.to).getDate()).toBe(5);
  });

  it("consulta somente quando a mensagem contém uma referência suportada", async () => {
    const findBetween = vi.fn().mockResolvedValue([record]);
    const repository = { findBetween } as unknown as MealHistoryRepository;
    await expect(findHistoricalMealCandidates(repository, "arroz hoje")).resolves.toBeNull();
    await expect(findHistoricalMealCandidates(repository, "mesmo almoço de ontem", new Date(2026, 8, 5, 12))).resolves.toEqual([record]);
    expect(findBetween).toHaveBeenCalledOnce();
  });

  it("reutiliza somente a refeição e exige glicemia e tendência atuais", () => {
    expect(() => createReusedMealTurn(record, "", "ESTAVEL")).toThrow("glicemia atual");
    const turn = createReusedMealTurn(record, "118", "CAINDO");
    expect(turn).toMatchObject({ total_carbohydrates: 52, glucose: 118, glucose_trend: "CAINDO", meal_type: "ALMOCO", meal_items: record.meal_items });
  });
});
