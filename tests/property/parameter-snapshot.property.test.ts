// tests/property/parameter-snapshot.property.test.ts
//
// Teste de propriedade — fidelidade do Parameter_Snapshot (task 12.4).
//
// Feature: glicia, Property 16: Fidelidade do Parameter_Snapshot
//
// Para valores arbitrários de parâmetros de snapshot (snapshotTargetGlucose,
// snapshotCorrectionFactor, snapshotCarbohydrateRatio), doses calculadas e uma
// formulaVersion arbitrária, ao persistir uma refeição via
// `saveMealWithCalculation`, a leitura da linha `insulin_calculation` de volta
// deve produzir EXATAMENTE os mesmos valores snapshot_* e formula_version que
// foram fornecidos — sem mutação e sem ler dos parâmetros correntes
// (insulin_settings / insulin_meal_settings) (Req 9.5, 9.6).
//
// Estratégia (rápida a 100 execuções): faz-se bootstrap de UM único banco em
// arquivo temporário compartilhado no beforeAll (para que uma conexão bruta
// consiga ler os dados de volta), semeando UM alimento (raw insert) para
// satisfazer a FK meal_item.food_id → food(id), e uma única conversa reutilizada
// entre execuções. Dentro da propriedade, cada execução usa um
// externalMessageId único (randomUUID) para não colidir com a UNIQUE de
// meal.external_message_id, e a linha do cálculo é lida de volta pelo mealId
// retornado, via conexão better-sqlite3 bruta.
//
// Validates: Requirements 9.5, 9.6

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SqliteRepository } from "../../src/adapters/persistence/sqlite-repository.js";
import type { MealType } from "../../src/domain/types.js";

// Recursos compartilhados, criados uma única vez no beforeAll e liberados no
// afterAll (fecha conexões e remove o diretório temporário).
let tempDir: string;
let dbPath: string;
let repo: SqliteRepository;
let rawDb: Database.Database; // conexão bruta para semear e ler de volta
let patientId: string;
let conversationId: string;
let foodId: string;

// Normaliza -0 para +0: `expect(...).toBe(...)` usa Object.is, e o SQLite
// devolve 0 para valores gravados como -0, o que causaria falso negativo.
function normZero(n: number): number {
  return n === 0 ? 0 : n;
}

// Número finito arbitrário em um intervalo fechado, sem NaN/Infinity e sem -0.
function finite(min: number, max: number): fc.Arbitrary<number> {
  return fc
    .double({ min, max, noNaN: true, noDefaultInfinity: true })
    .map(normZero);
}

const mealType: fc.Arbitrary<MealType> = fc.constantFrom(
  "BREAKFAST",
  "LUNCH",
  "SNACK",
  "DINNER",
);

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "glicia-snapshot-"));
  dbPath = join(tempDir, `${randomUUID()}.db`);

  // Bootstrap: aplica migrations + seed da paciente única.
  repo = new SqliteRepository({ dbPath });

  // Conexão bruta ao mesmo arquivo, usada para semear o alimento e para ler de
  // volta a linha de insulin_calculation.
  rawDb = new Database(dbPath);
  rawDb.pragma("foreign_keys = ON");

  // Semeia UM alimento (raw insert) para satisfazer a FK meal_item.food_id.
  foodId = randomUUID();
  rawDb
    .prepare("INSERT INTO food (id, name, active) VALUES (?, ?, 1)")
    .run(foodId, "arroz cozido");

  // Uma conversa reutilizada entre execuções (conversation_id não é único por
  // refeição). Fornece patientId e conversationId válidos.
  const conversation = await repo.createConversation();
  patientId = conversation.patientId;
  conversationId = conversation.id;
});

afterAll(() => {
  try {
    rawDb?.close();
  } catch {
    // ignora dupla tentativa de fechamento
  }
  try {
    repo?.close();
  } catch {
    // ignora dupla tentativa de fechamento
  }
  if (tempDir !== undefined) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

interface SnapshotRow {
  snapshot_target_glucose: number;
  snapshot_correction_factor: number;
  snapshot_carbohydrate_ratio: number;
  formula_version: string;
}

describe("Feature: glicia, Property 16: Fidelidade do Parameter_Snapshot", () => {
  it("persiste e relê snapshot_* e formula_version EXATAMENTE como fornecidos (Req 9.5, 9.6)", async () => {
    const readCalculation = rawDb.prepare(
      "SELECT snapshot_target_glucose, snapshot_correction_factor, " +
        "snapshot_carbohydrate_ratio, formula_version " +
        "FROM insulin_calculation WHERE meal_id = ?",
    );

    await fc.assert(
      fc.asyncProperty(
        fc.record({
          // Parameter_Snapshot — valores arbitrários finitos (Req 9.5).
          snapshotTargetGlucose: finite(0.01, 999),
          snapshotCorrectionFactor: finite(0.01, 999),
          snapshotCarbohydrateRatio: finite(0.01, 999),
          // Formula_Version — string arbitrária (inclui o valor atual "1.0").
          formulaVersion: fc.oneof(
            fc.constant("1.0"),
            fc.string({ minLength: 1, maxLength: 16 }),
          ),
          // Doses calculadas — finitas, independentes do snapshot.
          correctionDose: finite(-100, 100),
          carbohydrateDose: finite(-100, 100),
          totalDose: finite(-100, 100),
          roundedDose: finite(-100, 100),
          // Campos NOT NULL da refeição (não afetam a asserção de fidelidade).
          glucose: finite(1, 600),
          totalCarbohydrates: finite(0, 500),
          mealType,
        }),
        async (params) => {
          // externalMessageId único por execução → evita a UNIQUE de meal.
          const externalMessageId = randomUUID();

          const { mealId } = await repo.saveMealWithCalculation({
            conversationId,
            patientId,
            externalMessageId,
            mealType: params.mealType,
            glucose: params.glucose,
            totalCarbohydrates: params.totalCarbohydrates,
            items: [
              {
                foodId,
                foodNameSnapshot: "arroz cozido",
                quantity: 3,
                unit: "colher de sopa",
                carbohydrates: 19.5,
              },
            ],
            calculation: {
              correctionDose: params.correctionDose,
              carbohydrateDose: params.carbohydrateDose,
              totalDose: params.totalDose,
              roundedDose: params.roundedDose,
              snapshotTargetGlucose: params.snapshotTargetGlucose,
              snapshotCorrectionFactor: params.snapshotCorrectionFactor,
              snapshotCarbohydrateRatio: params.snapshotCarbohydrateRatio,
              formulaVersion: params.formulaVersion,
            },
          });

          // Lê de volta a linha específica pelo mealId retornado.
          const row = readCalculation.get(mealId) as SnapshotRow | undefined;

          expect(row).toBeDefined();
          if (row === undefined) return;

          // Fidelidade: os valores lidos são EXATAMENTE os fornecidos —
          // sem mutação e sem leitura dos parâmetros correntes.
          expect(row.snapshot_target_glucose).toBe(params.snapshotTargetGlucose);
          expect(row.snapshot_correction_factor).toBe(
            params.snapshotCorrectionFactor,
          );
          expect(row.snapshot_carbohydrate_ratio).toBe(
            params.snapshotCarbohydrateRatio,
          );
          expect(row.formula_version).toBe(params.formulaVersion);
        },
      ),
      { numRuns: 100 },
    );
  });
});
