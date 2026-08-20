import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { roundHalfAwayFromZero } from "../../src/domain/insulin/calculate-insulin.js";

// Feature: glicia, Property 4: Arredondamento da dose (meio para maior magnitude)
//
// Validates: Requirements 7.4
//
// roundHalfAwayFromZero arredonda para o inteiro mais próximo e, no empate
// exato de 0,5, arredonda para o inteiro de MAIOR magnitude:
//   2,5 → 3 ; -2,5 → -3 ; 2,4 → 2 ; 2,6 → 3.
// Todos os testes rodam offline, sem dependências externas.

describe("Feature: glicia, Property 4: Arredondamento da dose (meio para maior magnitude)", () => {
  // Floats finitos em uma faixa realista de doses, evitando NaN/Infinity.
  const finiteDose = fc.double({
    min: -1000,
    max: 1000,
    noNaN: true,
    noDefaultInfinity: true,
  });

  it("o resultado é sempre um inteiro", () => {
    fc.assert(
      fc.property(finiteDose, (x) => {
        expect(Number.isInteger(roundHalfAwayFromZero(x))).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it("o resultado difere da entrada em no máximo 0,5", () => {
    fc.assert(
      fc.property(finiteDose, (x) => {
        expect(Math.abs(roundHalfAwayFromZero(x) - x)).toBeLessThanOrEqual(0.5);
      }),
      { numRuns: 100 },
    );
  });

  it("no empate exato de 0,5 arredonda para o inteiro de maior magnitude", () => {
    // Gera n inteiro >= 0 e testa os meios exatos n+0,5 e -(n+0,5).
    const nonNegativeInt = fc.integer({ min: 0, max: 1000 });
    fc.assert(
      fc.property(nonNegativeInt, (n) => {
        // Meio positivo: n + 0,5 → n + 1
        expect(roundHalfAwayFromZero(n + 0.5)).toBe(n + 1);
        // Meio negativo: -(n + 0,5) → -(n + 1)
        expect(roundHalfAwayFromZero(-(n + 0.5))).toBe(-(n + 1));
      }),
      { numRuns: 100 },
    );
  });

  it("para valores não-meio, equivale ao arredondamento ao mais próximo (sensível ao sinal)", () => {
    fc.assert(
      fc.property(finiteDose, (x) => {
        // Exclui os meios exatos, onde o comportamento é específico (maior magnitude).
        fc.pre(Math.abs(Math.abs(x) - (Math.floor(Math.abs(x)) + 0.5)) > 1e-9);
        const result = roundHalfAwayFromZero(x);
        // A magnitude do resultado equivale ao arredondamento ao mais próximo da magnitude.
        expect(Math.abs(result)).toBe(Math.round(Math.abs(x)));
      }),
      { numRuns: 100 },
    );
  });
});
