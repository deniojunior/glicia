import { describe, it, expect } from "vitest";
import fc from "fast-check";

// Smoke test da fundação (Task 1): garante que o toolchain
// (Vitest + fast-check) roda offline. Será substituído/expandido
// pelas suites reais nas próximas tasks.
describe("foundation toolchain", () => {
  it("runs vitest", () => {
    expect(1 + 1).toBe(2);
  });

  it("runs fast-check property tests", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        return a + b === b + a;
      }),
      { numRuns: 100 },
    );
  });
});
