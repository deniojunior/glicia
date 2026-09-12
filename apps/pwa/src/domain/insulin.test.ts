import { describe, expect, it } from "vitest";

import { calculateSuggestedDose, roundHalfAwayFromZero, trendAdjustment, type DoseInput } from "./insulin";
import type { GlucoseTrend } from "./models";

const base: DoseInput = {
  glucose: 120, carbohydrates: 40, target_glucose: 120,
  correction_factor: 40, carbohydrate_ratio: 10, trend: "ESTAVEL"
};

describe("cálculo local de dose", () => {
  it("preserva as frações dos componentes e arredonda somente o total", () => {
    expect(calculateSuggestedDose({ ...base, glucose: 135, carbohydrates: 25, carbohydrate_ratio: 8 })).toEqual({
      correction: 0.375, carbohydrate_coverage: 3.125, trend_adjustment: 0, total: 3.5, suggested: 4
    });
  });

  it("desconta a correção negativa da cobertura alimentar", () => {
    expect(calculateSuggestedDose({ ...base, glucose: 100 })).toEqual({
      correction: -0.5, carbohydrate_coverage: 4, trend_adjustment: 0, total: 3.5, suggested: 4
    });
  });

  it("permite zero carboidratos com correção positiva", () => {
    expect(calculateSuggestedDose({ ...base, glucose: 200, carbohydrates: 0 })).toEqual({
      correction: 2, carbohydrate_coverage: 0, trend_adjustment: 0, total: 2, suggested: 2
    });
  });

  it("limita a sugestão a zero sem esconder os componentes negativos", () => {
    expect(calculateSuggestedDose({ ...base, glucose: 80, carbohydrates: 0, trend: "CAINDO_RAPIDO" })).toEqual({
      correction: -1, carbohydrate_coverage: 0, trend_adjustment: -2, total: -3, suggested: 0
    });
  });

  it.each([
    { glucose: 0 }, { glucose: -1 }, { carbohydrates: -1 },
    { correction_factor: 0 }, { correction_factor: -1 },
    { carbohydrate_ratio: 0 }, { carbohydrate_ratio: -1 }
  ])("rejeita entrada inválida: %j", (invalid) => {
    expect(() => calculateSuggestedDose({ ...base, ...invalid })).toThrow();
  });
});

describe("ajuste por tendência nos limites do fator de correção", () => {
  const factors = [24.99, 25, 49.99, 50, 75, 75.01];
  const cases: [GlucoseTrend, number[]][] = [
    ["SUBINDO_RAPIDO", [2, 2, 2, 1, 1, 1]],
    ["SUBINDO", [1, 1, 1, 1, 1, 0]],
    ["ESTAVEL", [0, 0, 0, 0, 0, 0]],
    ["CAINDO", [-1, -1, -1, -1, -1, 0]],
    ["CAINDO_RAPIDO", [-2, -2, -2, -1, -1, 0]],
    ["NAO_INFORMADA", [0, 0, 0, 0, 0, 0]]
  ];
  it.each(cases)("%s", (trend, expected) => {
    expect(factors.map((factor) => trendAdjustment(trend, factor))).toEqual(expected);
  });
});

describe("arredondamento de metades para longe de zero", () => {
  it.each([
    [0, 0], [0.4999, 0], [0.5, 1], [0.5001, 1],
    [2.4999, 2], [2.5, 3], [-2.4999, -2], [-2.5, -3], [-2.5001, -3]
  ])("%s resulta em %s", (value, expected) => {
    expect(roundHalfAwayFromZero(value)).toBe(expected);
  });
});
