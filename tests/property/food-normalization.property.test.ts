import { describe, it, expect } from "vitest";
import fc from "fast-check";

import {
  FoodResolver,
  normalizeName,
} from "../../src/domain/foods/food-resolver.js";
import type {
  Food,
  FoodMeasure,
  Repository,
} from "../../src/domain/ports/repository.js";
import type { InterpretedItem } from "../../src/domain/types.js";

/**
 * Teste de propriedade — resolução insensível a caixa/espaços e normalização
 * idempotente.
 *
 * Feature: glicia, Property 9: Resolução insensível a caixa e espaços, e
 * normalização idempotente
 *
 * `normalizeName` (Req 4.2) considera correspondências exatas desconsiderando
 * diferenças entre maiúsculas/minúsculas e espaços em branco nas extremidades.
 * As propriedades abaixo verificam:
 *   - idempotência: normalizeName(normalizeName(s)) === normalizeName(s)
 *   - insensibilidade a caixa (ASCII): flips de caixa em letras ASCII não mudam
 *     o resultado normalizado
 *   - insensibilidade a espaços nas extremidades: preencher com espaços em
 *     branco no início/fim não muda o resultado
 *   - comportamental: um FoodResolver sobre um repositório que só casa quando
 *     recebe a chave normalizada exata resolve o MESMO Food para qualquer
 *     variação de caixa/espaços do mesmo nome; o fake garante que sempre recebe
 *     a chave normalizada idêntica.
 *
 * Geradores são focados em ASCII para evitar surpresas de casing dependente de
 * locale no Unicode (ex.: 'İ'/'ı' turco, 'ß' alemão).
 *
 * Validates: Requirements 4.2
 */
describe("Feature: glicia, Property 9: Resolução insensível a caixa e espaços, e normalização idempotente", () => {
  // --- Geradores focados em ASCII ---

  const ASCII_LETTERS =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  // Uma "célula" de letra ASCII acompanhada de uma decisão de flip de caixa.
  // Permite construir, a partir da mesma base, uma variante com caixa alterada
  // preservando exatamente os mesmos caracteres subjacentes.
  const letterCell = fc.record({
    ch: fc.constantFrom(...ASCII_LETTERS),
    upper: fc.boolean(),
  });

  // Nome base com pelo menos uma letra (garante que o normalizado não seja
  // vazio, necessário para a propriedade comportamental de resolução).
  const nameCells = fc.array(letterCell, { minLength: 1, maxLength: 24 });

  // Espaços em branco arbitrários para as extremidades (todos aparados por trim).
  const whitespacePad = fc
    .array(fc.constantFrom(" ", "\t", "\n", "\r", "\f", "\v"), {
      maxLength: 6,
    })
    .map((parts) => parts.join(""));

  function baseFrom(cells: { ch: string; upper: boolean }[]): string {
    return cells.map((c) => c.ch).join("");
  }

  function caseFlipped(cells: { ch: string; upper: boolean }[]): string {
    return cells
      .map((c) => (c.upper ? c.ch.toUpperCase() : c.ch.toLowerCase()))
      .join("");
  }

  it("é idempotente: normalizeName(normalizeName(s)) === normalizeName(s) para strings arbitrárias", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = normalizeName(s);
        expect(normalizeName(once)).toBe(once);
      }),
      { numRuns: 100 },
    );
  });

  it("é insensível a caixa (ASCII): flips de caixa em letras não mudam o resultado", () => {
    fc.assert(
      fc.property(nameCells, (cells) => {
        const base = baseFrom(cells);
        const flipped = caseFlipped(cells);
        expect(normalizeName(flipped)).toBe(normalizeName(base));
      }),
      { numRuns: 100 },
    );
  });

  it("é insensível a espaços nas extremidades: padding não altera o resultado", () => {
    fc.assert(
      fc.property(nameCells, whitespacePad, whitespacePad, (cells, left, right) => {
        const base = baseFrom(cells);
        expect(normalizeName(left + base + right)).toBe(normalizeName(base));
      }),
      { numRuns: 100 },
    );
  });

  it("resolve o mesmo Food para qualquer variação de caixa/espaços do mesmo nome (Req 4.2)", async () => {
    await fc.assert(
      fc.asyncProperty(
        nameCells,
        whitespacePad,
        whitespacePad,
        async (cells, left, right) => {
          const base = baseFrom(cells);
          const expectedKey = normalizeName(base);

          // Food alvo (identidade); o fake só casa por nome quando recebe a
          // chave normalizada exata. Todas as variações do mesmo nome devem
          // produzir essa chave.
          const food: Food = {
            id: "food-target",
            name: base,
            active: true,
          };

          // Medida única do alimento — os valores nutricionais vêm daqui
          // (Req 4.9). Com uma única medida e item.unit=null, a resolução é
          // RESOLVED.
          const measure: FoodMeasure = {
            id: "measure-target",
            foodId: "food-target",
            servingUnit: "colher",
            servingQuantity: 25,
            carbohydrates: 6,
            active: true,
          };

          // Captura toda chave recebida pelos finders de nome para provar que a
          // normalização entrega sempre a MESMA chave (Req 4.2).
          const receivedKeys: string[] = [];
          const repo: Pick<
            Repository,
            | "findFoodByAliasExact"
            | "findFoodByNameExact"
            | "findFoodCandidates"
            | "findMeasuresByFoodId"
          > = {
            async findFoodByAliasExact(key: string): Promise<Food | null> {
              receivedKeys.push(key);
              return null;
            },
            async findFoodByNameExact(key: string): Promise<Food | null> {
              receivedKeys.push(key);
              return key === expectedKey ? food : null;
            },
            async findFoodCandidates(key: string): Promise<Food[]> {
              receivedKeys.push(key);
              return [];
            },
            async findMeasuresByFoodId(foodId: string): Promise<FoodMeasure[]> {
              return foodId === "food-target" ? [measure] : [];
            },
          };

          const resolver = new FoodResolver(repo);

          // Variação: flip de caixa (ASCII) + espaços nas extremidades.
          const variantName = left + caseFlipped(cells) + right;
          // unit=null: a medida única do alimento produz resolução RESOLVED.
          const item: InterpretedItem = {
            foodName: variantName,
            quantity: 3,
            unit: null,
          };

          const outcome = await resolver.resolveItem(item);

          expect(outcome.kind).toBe("RESOLVED");
          if (outcome.kind !== "RESOLVED") return;
          expect(outcome.item.foodId).toBe("food-target");
          // O fake sempre recebe a chave normalizada idêntica.
          expect(receivedKeys.length).toBeGreaterThan(0);
          for (const key of receivedKeys) {
            expect(key).toBe(expectedKey);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
