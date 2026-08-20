// tests/property/meal-roundtrip.property.test.ts
//
// Teste de propriedade — round-trip de persistência da refeição.
//
// Feature: glicia, Property 17: Round-trip de persistência da refeição
//
// Para toda refeição válida persistida via `SqliteRepository.saveMealWithCalculation`,
// ler a refeição de volta reproduz EXATAMENTE os valores gravados:
//   - meal.glucose, meal.total_carbohydrates, meal.meal_type conferem com a entrada;
//   - insulin_calculation: correction_dose, carbohydrate_dose, total_dose e
//     rounded_dose conferem com o bloco de cálculo;
//   - cada meal_item preserva food_name_snapshot, quantity, unit e carbohydrates
//     dos itens de entrada (Req 9.8), na mesma contagem e ordem.
//
// Estratégia:
//   - Um banco SQLite em ARQUIVO temporário é criado uma vez (beforeAll). As
//     migrations aplicam o schema + seed da paciente única; um conjunto de foods
//     é semeado por INSERT direto (numa conexão bruta) e seus ids reutilizados
//     como foodId dos itens, satisfazendo a FK meal_item.food_id -> food(id).
//   - Cada execução da propriedade usa um externalMessageId único (randomUUID)
//     para não colidir com a restrição de unicidade (Req 13.1).
//   - A leitura é feita por uma conexão bruta better-sqlite3, juntando as tabelas
//     pelo mealId retornado. Os meal_item são lidos ORDER BY rowid (ordem de
//     inserção estável em tabelas rowid do SQLite) para comparar na mesma ordem.
//   - Recursos (conexões + arquivos temporários) são liberados no afterAll.
//
// Validates: Requirements 9.7, 9.8

import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SqliteRepository } from "../../src/adapters/persistence/sqlite-repository.js";
import type {
  SaveMealInput,
  SaveMealItemInput,
} from "../../src/domain/ports/repository.js";
import type { MealType } from "../../src/domain/types.js";

// --- Estado compartilhado do banco temporário -----------------------------

let tempDir: string;
let dbPath: string;
let repo: SqliteRepository;
let readDb: Database.Database; // conexão bruta para semear foods e ler de volta
let patientId: string;
let conversationId: string;
let seededFoodIds: string[];

// Normaliza -0 para +0 para que a comparação estrita (Object.is via toBe) não
// falhe por causa de zero negativo, que o SQLite armazena/retorna como +0.
const noNegZero = (n: number): number => (Object.is(n, -0) ? 0 : n);

const MEAL_TYPES: readonly MealType[] = [
  "BREAKFAST",
  "LUNCH",
  "SNACK",
  "DINNER",
];

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "glicia-meal-roundtrip-"));
  dbPath = join(tempDir, `${randomUUID()}.db`);

  // Bootstrap: aplica migrations (schema + seed da paciente única).
  repo = new SqliteRepository({ dbPath });

  // Conexão bruta ao MESMO arquivo, usada para semear foods e ler de volta.
  readDb = new Database(dbPath);
  readDb.pragma("foreign_keys = ON");

  // Semeia um conjunto de foods com ids conhecidos (reutilizados nos itens).
  const insertFood = readDb.prepare(
    "INSERT INTO food (id, name, active) VALUES (?, ?, 1)",
  );
  seededFoodIds = [];
  const seedFoods = readDb.transaction(() => {
    for (let i = 0; i < 8; i += 1) {
      const id = randomUUID();
      seededFoodIds.push(id);
      insertFood.run(id, `Alimento de teste ${i}`);
    }
  });
  seedFoods();

  const patient = await repo.getPatient();
  patientId = patient.id;

  // Uma conversa reutilizável (FK meal.conversation_id -> conversation).
  const conversation = await repo.createConversation();
  conversationId = conversation.id;
});

afterAll(() => {
  try {
    readDb?.close();
  } catch {
    // ignora
  }
  try {
    repo?.close();
  } catch {
    // ignora
  }
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// --- Geradores -------------------------------------------------------------

// Double finito e sem NaN/Infinity, com -0 normalizado.
function finiteDouble(min: number, max: number): fc.Arbitrary<number> {
  return fc
    .double({ min, max, noNaN: true, noDefaultInfinity: true })
    .map(noNegZero);
}

// Item válido de refeição: foodId dentre os foods semeados (FK), snapshot não
// vazio, quantity > 0, unit string|null, carbohydrates finito >= 0.
function mealItemArb(): fc.Arbitrary<SaveMealItemInput> {
  return fc.record({
    foodId: fc.constantFrom(...seededFoodIds),
    foodNameSnapshot: fc.string({ minLength: 1, maxLength: 40 }),
    quantity: finiteDouble(Math.fround(0.01), 1000),
    unit: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
    carbohydrates: finiteDouble(0, 500),
  });
}

// SaveMealInput válido (sem os campos preenchidos em tempo de execução:
// conversationId, patientId, externalMessageId).
type MealDraft = Omit<
  SaveMealInput,
  "conversationId" | "patientId" | "externalMessageId"
>;

function mealDraftArb(): fc.Arbitrary<MealDraft> {
  return fc.record({
    mealType: fc.constantFrom(...MEAL_TYPES),
    glucose: finiteDouble(1, 600),
    totalCarbohydrates: finiteDouble(0, 2000),
    items: fc.array(mealItemArb(), { minLength: 1, maxLength: 5 }),
    calculation: fc.record({
      correctionDose: finiteDouble(-50, 50),
      carbohydrateDose: finiteDouble(-50, 50),
      totalDose: finiteDouble(-100, 100),
      roundedDose: fc.integer({ min: -100, max: 100 }),
      snapshotTargetGlucose: finiteDouble(1, 300),
      snapshotCorrectionFactor: finiteDouble(1, 200),
      snapshotCarbohydrateRatio: finiteDouble(1, 50),
      formulaVersion: fc.constant("1.0"),
    }),
  });
}

// --- Leitura de volta ------------------------------------------------------

interface MealRow {
  meal_type: string;
  glucose: number;
  total_carbohydrates: number;
}

interface CalcRow {
  correction_dose: number;
  carbohydrate_dose: number;
  total_dose: number;
  rounded_dose: number;
}

interface ItemRow {
  food_name_snapshot: string;
  quantity: number;
  unit: string | null;
  carbohydrates: number;
}

describe("Feature: glicia, Property 17: Round-trip de persistência da refeição", () => {
  it("ler a refeição de volta reproduz glucose, total_carbohydrates, meal_type, doses e itens", async () => {
    await fc.assert(
      fc.asyncProperty(mealDraftArb(), async (draft) => {
        const input: SaveMealInput = {
          ...draft,
          conversationId,
          patientId,
          externalMessageId: randomUUID(), // único por execução (Req 13.1)
        };

        const { mealId } = await repo.saveMealWithCalculation(input);

        // --- meal ---
        const mealRow = readDb
          .prepare(
            "SELECT meal_type, glucose, total_carbohydrates FROM meal WHERE id = ?",
          )
          .get(mealId) as MealRow | undefined;

        expect(mealRow).toBeDefined();
        if (mealRow === undefined) return;
        expect(mealRow.meal_type).toBe(input.mealType);
        expect(mealRow.glucose).toBe(input.glucose);
        expect(mealRow.total_carbohydrates).toBe(input.totalCarbohydrates);

        // --- insulin_calculation (doses) ---
        const calcRow = readDb
          .prepare(
            "SELECT correction_dose, carbohydrate_dose, total_dose, rounded_dose " +
              "FROM insulin_calculation WHERE meal_id = ?",
          )
          .get(mealId) as CalcRow | undefined;

        expect(calcRow).toBeDefined();
        if (calcRow === undefined) return;
        expect(calcRow.correction_dose).toBe(input.calculation.correctionDose);
        expect(calcRow.carbohydrate_dose).toBe(
          input.calculation.carbohydrateDose,
        );
        expect(calcRow.total_dose).toBe(input.calculation.totalDose);
        expect(calcRow.rounded_dose).toBe(input.calculation.roundedDose);

        // --- meal_item (mesma contagem e ordem, ORDER BY rowid) (Req 9.8) ---
        const itemRows = readDb
          .prepare(
            "SELECT food_name_snapshot, quantity, unit, carbohydrates " +
              "FROM meal_item WHERE meal_id = ? ORDER BY rowid",
          )
          .all(mealId) as ItemRow[];

        expect(itemRows.length).toBe(input.items.length);
        input.items.forEach((item, index) => {
          const row = itemRows[index];
          expect(row.food_name_snapshot).toBe(item.foodNameSnapshot);
          expect(row.quantity).toBe(item.quantity);
          expect(row.unit).toBe(item.unit);
          expect(row.carbohydrates).toBe(item.carbohydrates);
        });
      }),
      { numRuns: 100 },
    );
  });
});
