import { describe, it, expect } from "vitest";
import {
  calculateInsulin,
  roundHalfAwayFromZero,
  FORMULA_VERSION,
  InsulinCalculationError,
  type InsulinInput,
} from "../../src/domain/insulin/calculate-insulin.js";

// Testes unitários abrangentes do motor de cálculo de insulina (Requisito 7,
// Requisito 18.1-18.3). Todos os casos são baseados em exemplos determinísticos,
// executados offline sem dependências externas (Req 7.7, 18.6).

/**
 * Constrói uma entrada válida com os parâmetros iniciais do protocolo
 * (targetGlucose=120, correctionFactor=40) e permite sobrescrever campos.
 */
function makeInput(overrides: Partial<InsulinInput> = {}): InsulinInput {
  return {
    glucose: 120,
    carbohydrates: 0,
    targetGlucose: 120,
    correctionFactor: 40,
    carbohydrateRatio: 8,
    ...overrides,
  };
}

describe("calculateInsulin — dose de correção vs. meta (Req 7.1, 7.9, 7.10)", () => {
  it("glicemia igual à meta → correctionDose 0", () => {
    const result = calculateInsulin(makeInput({ glucose: 120, targetGlucose: 120 }));
    expect(result.correctionDose).toBe(0);
  });

  it("glicemia acima da meta → correctionDose positiva refletida na totalDose (Req 7.9 invertido)", () => {
    // (200 - 120) / 40 = 2
    const result = calculateInsulin(
      makeInput({ glucose: 200, targetGlucose: 120, correctionFactor: 40, carbohydrates: 0 }),
    );
    expect(result.correctionDose).toBeGreaterThan(0);
    expect(result.correctionDose).toBe(2);
    expect(result.totalDose).toBe(2);
  });

  it("glicemia abaixo da meta → correctionDose negativa refletida na totalDose (Req 7.9)", () => {
    // (80 - 120) / 40 = -1
    const result = calculateInsulin(
      makeInput({ glucose: 80, targetGlucose: 120, correctionFactor: 40, carbohydrates: 0 }),
    );
    expect(result.correctionDose).toBeLessThan(0);
    expect(result.correctionDose).toBe(-1);
    expect(result.totalDose).toBe(-1);
  });
});

describe("calculateInsulin — dose de carboidrato (Req 7.2, 7.11)", () => {
  it("zero de carboidratos com ratio > 0 → carbohydrateDose 0 (Req 7.11)", () => {
    const result = calculateInsulin(
      makeInput({ carbohydrates: 0, carbohydrateRatio: 8, glucose: 120, targetGlucose: 120 }),
    );
    expect(result.carbohydrateDose).toBe(0);
    expect(result.totalDose).toBe(0);
    expect(result.roundedDose).toBe(0);
  });

  it("carbohydrateDose = carbohydrates / carbohydrateRatio", () => {
    // 40 / 8 = 5
    const result = calculateInsulin(makeInput({ carbohydrates: 40, carbohydrateRatio: 8 }));
    expect(result.carbohydrateDose).toBe(5);
  });
});

describe("calculateInsulin — sanity checks dos ratios 8/6/8/10 (Req 7.2, 7.3)", () => {
  // Parâmetros iniciais: targetGlucose=120, correctionFactor=40.
  it("BREAKFAST ratio 8: glucose 200, CHO 40 → correction 2 + carb 5 = 7", () => {
    const r = calculateInsulin(
      makeInput({ glucose: 200, carbohydrates: 40, correctionFactor: 40, carbohydrateRatio: 8 }),
    );
    expect(r.correctionDose).toBe(2);
    expect(r.carbohydrateDose).toBe(5);
    expect(r.totalDose).toBe(7);
    expect(r.roundedDose).toBe(7);
  });

  it("LUNCH ratio 6: glucose 120, CHO 60 → correction 0 + carb 10 = 10", () => {
    const r = calculateInsulin(
      makeInput({ glucose: 120, carbohydrates: 60, correctionFactor: 40, carbohydrateRatio: 6 }),
    );
    expect(r.correctionDose).toBe(0);
    expect(r.carbohydrateDose).toBe(10);
    expect(r.totalDose).toBe(10);
  });

  it("SNACK ratio 8: glucose 160, CHO 24 → correction 1 + carb 3 = 4", () => {
    const r = calculateInsulin(
      makeInput({ glucose: 160, carbohydrates: 24, correctionFactor: 40, carbohydrateRatio: 8 }),
    );
    expect(r.correctionDose).toBe(1);
    expect(r.carbohydrateDose).toBe(3);
    expect(r.totalDose).toBe(4);
  });

  it("DINNER ratio 10: glucose 120, CHO 50 → correction 0 + carb 5 = 5", () => {
    const r = calculateInsulin(
      makeInput({ glucose: 120, carbohydrates: 50, correctionFactor: 40, carbohydrateRatio: 10 }),
    );
    expect(r.correctionDose).toBe(0);
    expect(r.carbohydrateDose).toBe(5);
    expect(r.totalDose).toBe(5);
  });
});

describe("calculateInsulin — entradas decimais nas doses (Req 18.2)", () => {
  it("mantém as doses fracionárias sem arredondar totalDose, mas arredonda roundedDose", () => {
    // correction: (165 - 120) / 40 = 1.125 ; carb: 30 / 8 = 3.75 ; total = 4.875
    const r = calculateInsulin(
      makeInput({ glucose: 165, carbohydrates: 30, correctionFactor: 40, carbohydrateRatio: 8 }),
    );
    expect(r.correctionDose).toBeCloseTo(1.125, 10);
    expect(r.carbohydrateDose).toBeCloseTo(3.75, 10);
    expect(r.totalDose).toBeCloseTo(4.875, 10);
    expect(r.roundedDose).toBe(5);
  });
});

describe("roundHalfAwayFromZero — arredondamento meio para longe do zero (Req 7.4)", () => {
  it("2.5 → 3", () => {
    expect(roundHalfAwayFromZero(2.5)).toBe(3);
  });

  it("-2.5 → -3", () => {
    expect(roundHalfAwayFromZero(-2.5)).toBe(-3);
  });

  it("2.4 → 2", () => {
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
  });

  it("3.5 → 4", () => {
    expect(roundHalfAwayFromZero(3.5)).toBe(4);
  });

  it("2.6 → 3 e -2.6 → -3 (casos de apoio)", () => {
    expect(roundHalfAwayFromZero(2.6)).toBe(3);
    expect(roundHalfAwayFromZero(-2.6)).toBe(-3);
  });

  it("0 → 0", () => {
    expect(roundHalfAwayFromZero(0)).toBe(0);
  });
});

describe("calculateInsulin — arredondamento de roundedDose via totalDose (Req 7.4)", () => {
  it("totalDose 2.5 → roundedDose 3", () => {
    // carb: 5 / 2 = 2.5 ; correction 0
    const r = calculateInsulin(
      makeInput({ glucose: 120, targetGlucose: 120, carbohydrates: 5, carbohydrateRatio: 2 }),
    );
    expect(r.totalDose).toBe(2.5);
    expect(r.roundedDose).toBe(3);
  });

  it("totalDose -2.5 → roundedDose -3", () => {
    // correction: (20 - 120) / 40 = -2.5 ; carb 0
    const r = calculateInsulin(
      makeInput({ glucose: 20, targetGlucose: 120, correctionFactor: 40, carbohydrates: 0 }),
    );
    expect(r.totalDose).toBe(-2.5);
    expect(r.roundedDose).toBe(-3);
  });

  it("totalDose 2.4 → roundedDose 2", () => {
    // carb: 4.8 / 2 = 2.4 ; correction 0
    const r = calculateInsulin(
      makeInput({ glucose: 120, targetGlucose: 120, carbohydrates: 4.8, carbohydrateRatio: 2 }),
    );
    expect(r.totalDose).toBeCloseTo(2.4, 10);
    expect(r.roundedDose).toBe(2);
  });

  it("totalDose 3.5 → roundedDose 4", () => {
    // carb: 7 / 2 = 3.5 ; correction 0
    const r = calculateInsulin(
      makeInput({ glucose: 120, targetGlucose: 120, carbohydrates: 7, carbohydrateRatio: 2 }),
    );
    expect(r.totalDose).toBe(3.5);
    expect(r.roundedDose).toBe(4);
  });
});

describe("calculateInsulin — divisor zero → ZERO_DIVISOR (Req 7.12)", () => {
  it("correctionFactor 0 → lança InsulinCalculationError ZERO_DIVISOR", () => {
    expect(() => calculateInsulin(makeInput({ correctionFactor: 0 }))).toThrow(
      InsulinCalculationError,
    );
    try {
      calculateInsulin(makeInput({ correctionFactor: 0 }));
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(InsulinCalculationError);
      expect((err as InsulinCalculationError).code).toBe("ZERO_DIVISOR");
    }
  });

  it("carbohydrateRatio 0 → lança InsulinCalculationError ZERO_DIVISOR", () => {
    try {
      calculateInsulin(makeInput({ carbohydrateRatio: 0 }));
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(InsulinCalculationError);
      expect((err as InsulinCalculationError).code).toBe("ZERO_DIVISOR");
    }
  });
});

describe("calculateInsulin — entradas inválidas → MISSING_OR_INVALID_INPUT (Req 7.13, 18.3)", () => {
  const invalidValues: Array<[string, unknown]> = [
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["null", null],
    ["undefined (ausente)", undefined],
    ["string", "120"],
  ];

  const fields: Array<keyof InsulinInput> = [
    "glucose",
    "carbohydrates",
    "targetGlucose",
    "correctionFactor",
    "carbohydrateRatio",
  ];

  for (const field of fields) {
    for (const [label, value] of invalidValues) {
      it(`campo ${field} = ${label} → lança MISSING_OR_INVALID_INPUT`, () => {
        const input = makeInput({ [field]: value } as unknown as Partial<InsulinInput>);
        try {
          calculateInsulin(input);
          expect.unreachable("deveria ter lançado");
        } catch (err) {
          expect(err).toBeInstanceOf(InsulinCalculationError);
          expect((err as InsulinCalculationError).code).toBe("MISSING_OR_INVALID_INPUT");
        }
      });
    }
  }

  it("input null → lança MISSING_OR_INVALID_INPUT", () => {
    try {
      calculateInsulin(null as unknown as InsulinInput);
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(InsulinCalculationError);
      expect((err as InsulinCalculationError).code).toBe("MISSING_OR_INVALID_INPUT");
    }
  });

  it("objeto vazio (todos os campos ausentes) → lança MISSING_OR_INVALID_INPUT", () => {
    try {
      calculateInsulin({} as unknown as InsulinInput);
      expect.unreachable("deveria ter lançado");
    } catch (err) {
      expect(err).toBeInstanceOf(InsulinCalculationError);
      expect((err as InsulinCalculationError).code).toBe("MISSING_OR_INVALID_INPUT");
    }
  });
});

describe("FORMULA_VERSION (Req 9.6)", () => {
  it('é igual a "1.0"', () => {
    expect(FORMULA_VERSION).toBe("1.0");
  });
});
