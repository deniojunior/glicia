import { expect, test } from "vitest";
import { createClinicalSettings } from "../domain";
import { createConversationTurn } from "./session";
import { createMealRecord } from "./meal-history";
import { historyPage } from "./history-search";

const record = createMealRecord({ id: "meal-1", createdAt: "2026-09-06T12:00:00Z", mealInput: "Arroz e feijão", mode: "preciso", settings: createClinicalSettings(), carbohydrateRatio: 6, calculation: { correction: 0, carbohydrate_coverage: 10, trend_adjustment: 0, total: 10, suggested: 10 }, provider: "openai", model: "test", turn: createConversationTurn("Resumo", { total_carbohydrates: 60, glucose: 120, glucose_trend: "ESTAVEL", meal_type: "ALMOCO" }) });

test("busca sem acentos por alimento, refeição e data", () => {
  expect(historyPage([record], "FEIJAO almoco", 1).total).toBe(1);
  expect(historyPage([record], "06/09/2026", 1).total).toBe(1);
  expect(historyPage([record], "jantar", 1).total).toBe(0);
});
test("pesquisa também itens estruturados e resumos legados", () => {
  expect(historyPage([{ ...record, meal_items: [{ name: "Maçã", portion: "1", carbohydrates: 10 }] }], "maca", 1).total).toBe(1);
  expect(historyPage([{ ...record, assistant_summary: "Pão integral" }], "pao", 1).total).toBe(1);
});
test("divide em oito registros e ajusta página após exclusão ou busca", () => {
  const records = Array.from({ length: 9 }, (_, index) => ({ ...record, id: String(index) }));
  expect(historyPage(records, "", 1).records).toHaveLength(8);
  expect(historyPage(records, "", 2).records).toHaveLength(1);
  expect(historyPage([record], "", 2).page).toBe(1);
  expect(historyPage([], "", 2)).toMatchObject({ records: [], page: 1, pages: 1, total: 0 });
});
test("mostra os mais recentes primeiro sem alterar a lista original", () => {
  const records = [{ ...record, created_at: "2026-09-05T12:00:00Z" }, record];
  expect(historyPage(records, "", 1).records[0]).toBe(record);
  expect(records[0].created_at).toBe("2026-09-05T12:00:00Z");
});
