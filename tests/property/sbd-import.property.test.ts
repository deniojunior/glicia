import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";

import { importSbdFoods } from "../../seeds/import-sbd-foods.js";
import type { ImportReport } from "../../seeds/import-sbd-foods.js";

/**
 * Teste de propriedade — robustez da importação da base SBD.
 *
 * Feature: glicia, Property 23: Robustez da importação da base SBD
 *
 * Para todo conjunto misto de linhas VÁLIDAS e MALFORMADAS de um CSV de
 * alimentos, `importSbdFoods`:
 *   - nunca lança (é robusta) — sempre retorna um ImportReport;
 *   - insere EXATAMENTE as linhas válidas — como cada válida tem nome único
 *     (`food_${i}`), cria uma identidade E uma medida (report.foodsInserted ===
 *     report.measuresInserted === nº de válidas), todas com `active = 1`
 *     (Req 12.3);
 *   - registra CADA linha malformada em `errors`, sem abortar as válidas
 *     (report.errors.length === nº de malformadas) (Req 12.4);
 *   - `foodsInserted + errors.length` contabiliza todas as linhas de dados.
 *
 * Estratégia: gerar um array de "specs" de linha marcados como válido/inválido.
 * Linha válida recebe um nome único (`food_${i}`), unidade não vazia,
 * quantidade > 0 e carboidratos >= 0. Famílias de linha inválida: coluna
 * faltante, nome vazio, quantidade <= 0 ou não numérica, carboidratos negativos
 * ou não numéricos. O CSV gerado é escrito em arquivo temporário (com cabeçalho)
 * junto de um CSV de aliases mínimo (só cabeçalho). Um banco em memória fresco é
 * criado por execução (schema aplicado direto da migration 0001) e consultado
 * para confirmar que os alimentos inseridos têm `active = 1`.
 *
 * Validates: Requirements 12.3, 12.4
 */

// Schema aplicado diretamente a um better-sqlite3 Database em memória (a
// migration 0001 é a fonte única do schema `food` / `food_alias`).
const MIGRATION_SQL = readFileSync(
  fileURLToPath(new URL("../../migrations/0001_init.sql", import.meta.url)),
  "utf8",
);

const FOODS_HEADER =
  "name,default_serving_unit,default_serving_quantity,carbohydrates";
const ALIASES_HEADER = "food_name,alias";

// Unidades válidas (não vazias, sem vírgula/aspas/quebra de linha).
const validUnit = fc.constantFrom(
  "colher de sopa",
  "concha",
  "fatia",
  "unidade",
  "xícara",
);

// Valores de quantidade inválidos: <= 0 ou não numéricos.
const invalidQuantity = fc.oneof(
  fc.integer({ min: -1000, max: 0 }).map((n) => String(n)), // <= 0
  fc.constantFrom("abc", "n/a", "xyz", ""), // não numérico / vazio
);

// Valores de carboidrato inválidos: negativos ou não numéricos.
const invalidCarbs = fc.oneof(
  fc.integer({ min: -1000, max: -1 }).map((n) => String(n)), // < 0
  fc.constantFrom("abc", "n/a", "xyz", ""), // não numérico / vazio
);

// Spec de uma linha do CSV, marcada como válida ou por família de erro.
type RowSpec =
  | { type: "valid"; unit: string; quantity: number; carbs: number }
  | { type: "missing_column"; unit: string }
  | { type: "empty_name"; unit: string; quantity: number; carbs: number }
  | { type: "bad_quantity"; unit: string; quantity: string; carbs: number }
  | { type: "bad_carbs"; unit: string; quantity: number; carbs: string };

const rowSpec: fc.Arbitrary<RowSpec> = fc.oneof(
  fc.record({
    type: fc.constant("valid" as const),
    unit: validUnit,
    quantity: fc.integer({ min: 1, max: 1000 }), // > 0
    carbs: fc.integer({ min: 0, max: 500 }), // >= 0
  }),
  fc.record({
    type: fc.constant("missing_column" as const),
    unit: validUnit,
  }),
  fc.record({
    type: fc.constant("empty_name" as const),
    unit: validUnit,
    quantity: fc.integer({ min: 1, max: 1000 }),
    carbs: fc.integer({ min: 0, max: 500 }),
  }),
  fc.record({
    type: fc.constant("bad_quantity" as const),
    unit: validUnit,
    quantity: invalidQuantity,
    carbs: fc.integer({ min: 0, max: 500 }),
  }),
  fc.record({
    type: fc.constant("bad_carbs" as const),
    unit: validUnit,
    quantity: fc.integer({ min: 1, max: 1000 }),
    carbs: invalidCarbs,
  }),
);

// Constrói uma linha CSV a partir da spec. Nome único (`food_${index}`) para
// as linhas válidas, garantindo unicidade dos nomes normalizados.
function buildLine(spec: RowSpec, index: number): string {
  switch (spec.type) {
    case "valid":
      return `food_${index},${spec.unit},${spec.quantity},${spec.carbs}`;
    case "missing_column":
      // Apenas 3 colunas → número de colunas inválido.
      return `food_${index},${spec.unit},10`;
    case "empty_name":
      // Nome vazio, restante válido.
      return `,${spec.unit},${spec.quantity},${spec.carbs}`;
    case "bad_quantity":
      return `food_${index},${spec.unit},${spec.quantity},${spec.carbs}`;
    case "bad_carbs":
      return `food_${index},${spec.unit},${spec.quantity},${spec.carbs}`;
  }
}

// Arquivos temporários criados por execução, removidos no afterEach como rede
// de segurança (também são removidos ao final de cada execução da propriedade).
let tempDir: string | null = null;

afterEach(() => {
  if (tempDir !== null) {
    rmSync(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe("Feature: glicia, Property 23: Robustez da importação da base SBD", () => {
  it("insere as linhas válidas (active=1) e registra as malformadas sem abortar", () => {
    fc.assert(
      fc.property(fc.array(rowSpec, { maxLength: 15 }), (specs) => {
        // --- Monta o CSV e conta válidas x malformadas ---
        const lines: string[] = [];
        let validCount = 0;
        let invalidCount = 0;

        specs.forEach((spec, index) => {
          lines.push(buildLine(spec, index));
          if (spec.type === "valid") {
            validCount += 1;
          } else {
            invalidCount += 1;
          }
        });

        const foodsCsv = [FOODS_HEADER, ...lines].join("\n");
        const aliasesCsv = ALIASES_HEADER; // só cabeçalho (sem aliases)

        // --- Arquivos temporários (tmpdir + randomUUID) ---
        tempDir = mkdtempSync(join(tmpdir(), "glicia-sbd-"));
        const foodsCsvPath = join(tempDir, `foods-${randomUUID()}.csv`);
        const aliasesCsvPath = join(tempDir, `aliases-${randomUUID()}.csv`);
        writeFileSync(foodsCsvPath, foodsCsv, "utf8");
        writeFileSync(aliasesCsvPath, aliasesCsv, "utf8");

        // --- Banco em memória fresco por execução ---
        const db = new Database(":memory:");
        db.pragma("foreign_keys = ON");
        db.exec(MIGRATION_SQL);

        try {
          // Robustez: importSbdFoods NUNCA lança para CSV malformado.
          let report: ImportReport | undefined;
          expect(() => {
            report = importSbdFoods(db, { foodsCsvPath, aliasesCsvPath });
          }).not.toThrow();

          expect(report).toBeDefined();
          if (report === undefined) return;

          // Cada linha válida usa um nome ÚNICO (`food_${i}`), logo cria uma
          // identidade de alimento E uma medida.
          expect(report.foodsInserted).toBe(validCount);
          expect(report.measuresInserted).toBe(validCount);
          // Cada linha malformada é registrada como erro.
          expect(report.errors.length).toBe(invalidCount);
          // A contagem cobre todas as linhas de dados.
          expect(report.foodsInserted + report.errors.length).toBe(
            specs.length,
          );

          // Confirma no banco: total de foods === válidas, todos com active=1.
          const total = (
            db.prepare("SELECT COUNT(*) AS c FROM food").get() as { c: number }
          ).c;
          const active = (
            db
              .prepare("SELECT COUNT(*) AS c FROM food WHERE active = 1")
              .get() as { c: number }
          ).c;

          expect(total).toBe(validCount);
          expect(active).toBe(validCount);

          // ALSO: total de medidas === válidas, todas com active=1.
          const totalMeasures = (
            db
              .prepare("SELECT COUNT(*) AS c FROM food_measure")
              .get() as { c: number }
          ).c;
          const activeMeasures = (
            db
              .prepare("SELECT COUNT(*) AS c FROM food_measure WHERE active = 1")
              .get() as { c: number }
          ).c;

          expect(totalMeasures).toBe(validCount);
          expect(activeMeasures).toBe(validCount);
        } finally {
          db.close();
          rmSync(tempDir, { recursive: true, force: true });
          tempDir = null;
        }
      }),
      { numRuns: 100 },
    );
  });
});
