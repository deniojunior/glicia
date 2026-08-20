// tests/integration/meal-persistence.test.ts
//
// Testes de integração da persistência de refeição + cálculo + itens (task 12.3).
//
// Cobrem o comportamento transacional e o round-trip do SqliteRepository:
//   - Req 9.3: persistência atômica de meal + insulin_calculation + meal_item[]
//   - Req 9.4: rollback sem gravar registros parciais em caso de falha
//   - Req 9.7: colunas de meal e insulin_calculation persistidas fielmente
//   - Req 9.8: colunas de meal_item (snapshot) persistidas no próprio item
//
// Também exercita saveAppliedDose (Req 10), que registra a dose aplicada de
// forma independente da dose calculada.
//
// Para satisfazer a FK meal_item.food_id → food(id), a base de alimentos é
// semeada via importSbdFoods. Como o SQLite `:memory:` é por-conexão, usa-se um
// arquivo temporário para poder inspecionar o banco por uma conexão bruta.
//
// Todos os testes são determinísticos e 100% offline (Req 1.7, 18.6).

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { SqliteRepository } from "../../src/adapters/persistence/sqlite-repository.js";
import { importSbdFoods } from "../../seeds/import-sbd-foods.js";
import type { SaveMealInput } from "../../src/domain/ports/repository.js";

// --- Linhas cruas lidas pela conexão de inspeção ---

interface FoodRow {
  id: string;
  name: string;
  serving_quantity: number;
  carbohydrates: number;
}

interface MealRow {
  id: string;
  glucose: number;
  total_carbohydrates: number;
  applied_dose: number | null;
}

interface CalculationRow {
  correction_dose: number;
  carbohydrate_dose: number;
  total_dose: number;
  rounded_dose: number;
  snapshot_target_glucose: number;
  snapshot_correction_factor: number;
  snapshot_carbohydrate_ratio: number;
  formula_version: string;
}

interface MealItemRow {
  food_id: string;
  food_name_snapshot: string;
  quantity: number;
  unit: string | null;
  carbohydrates: number;
}

describe("Persistência de refeição — atomicidade, rollback e round-trip (Req 9.3, 9.4, 9.7, 9.8)", () => {
  const openRepos: SqliteRepository[] = [];
  const openDbs: Database.Database[] = [];
  const tempDirs: string[] = [];

  let dbPath: string;
  let repo: SqliteRepository;

  // Abre uma conexão bruta ao MESMO arquivo para inspecionar/semear o banco.
  function rawDb(): Database.Database {
    const db = new Database(dbPath);
    db.pragma("foreign_keys = ON");
    openDbs.push(db);
    return db;
  }

  beforeEach(() => {
    const dir = mkdtempSync(join(tmpdir(), "glicia-meal-"));
    tempDirs.push(dir);
    dbPath = join(dir, `${randomUUID()}.db`);

    // Aplica migrations + seed da paciente única.
    repo = new SqliteRepository({ dbPath });
    openRepos.push(repo);

    // Semeia a base de alimentos para satisfazer a FK meal_item.food_id.
    const report = importSbdFoods(dbPath);
    expect(report.foodsInserted).toBeGreaterThan(0);
  });

  afterEach(() => {
    while (openDbs.length > 0) {
      try {
        openDbs.pop()?.close();
      } catch {
        // ignora fechamento duplo
      }
    }
    while (openRepos.length > 0) {
      try {
        openRepos.pop()?.close();
      } catch {
        // ignora fechamento duplo
      }
    }
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir !== undefined && existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  // Lê `count` alimentos ativos do banco (via conexão bruta) para referenciar.
  function readFoods(count: number): FoodRow[] {
    const db = rawDb();
    const rows = db
      .prepare(
        "SELECT f.id, f.name, m.serving_quantity, m.carbohydrates " +
          "FROM food f JOIN food_measure m ON m.food_id = f.id " +
          "WHERE f.active = 1 GROUP BY f.id ORDER BY f.name, f.id LIMIT ?",
      )
      .all(count) as FoodRow[];
    expect(rows.length).toBe(count);
    return rows;
  }

  // Monta um SaveMealInput válido com 1-2 itens referenciando foods semeados.
  async function buildValidInput(
    foods: FoodRow[],
    externalMessageId: string,
  ): Promise<SaveMealInput> {
    const patient = await repo.getPatient();
    const conversation = await repo.createConversation();

    const items = foods.map((f) => ({
      foodId: f.id,
      foodNameSnapshot: f.name,
      quantity: 3,
      unit: "colher de sopa",
      carbohydrates: Number((3 * f.carbohydrates).toFixed(2)),
    }));

    const totalCarbohydrates = Number(
      items.reduce((sum, i) => sum + i.carbohydrates, 0).toFixed(2),
    );

    return {
      conversationId: conversation.id,
      patientId: patient.id,
      externalMessageId,
      mealType: "LUNCH",
      glucose: 165,
      totalCarbohydrates,
      items,
      calculation: {
        correctionDose: 1.125,
        carbohydrateDose: 6.7,
        totalDose: 7.825,
        roundedDose: 8,
        snapshotTargetGlucose: 120,
        snapshotCorrectionFactor: 40,
        snapshotCarbohydrateRatio: 6,
        formulaVersion: "1.0",
      },
    };
  }

  it("round-trip: grava meal, insulin_calculation e meal_item[] e lê os mesmos valores (Req 9.7, 9.8)", async () => {
    const foods = readFoods(2);
    const externalMessageId = randomUUID();
    const input = await buildValidInput(foods, externalMessageId);

    const { mealId } = await repo.saveMealWithCalculation(input);
    expect(mealId.length).toBeGreaterThan(0);

    // Inspeção via conexão bruta ao mesmo arquivo.
    const db = rawDb();

    // meal (Req 9.7)
    const meal = db
      .prepare(
        "SELECT id, glucose, total_carbohydrates, applied_dose FROM meal WHERE id = ?",
      )
      .get(mealId) as MealRow | undefined;
    expect(meal).toBeDefined();
    expect(meal?.glucose).toBe(input.glucose);
    expect(meal?.total_carbohydrates).toBe(input.totalCarbohydrates);
    // applied_dose permanece independente/não preenchida no salvamento (Req 10.2)
    expect(meal?.applied_dose).toBeNull();

    // insulin_calculation (Req 9.7)
    const calc = db
      .prepare(
        "SELECT correction_dose, carbohydrate_dose, total_dose, rounded_dose, " +
          "snapshot_target_glucose, snapshot_correction_factor, " +
          "snapshot_carbohydrate_ratio, formula_version " +
          "FROM insulin_calculation WHERE meal_id = ?",
      )
      .get(mealId) as CalculationRow | undefined;
    expect(calc).toBeDefined();
    expect(calc?.correction_dose).toBe(input.calculation.correctionDose);
    expect(calc?.carbohydrate_dose).toBe(input.calculation.carbohydrateDose);
    expect(calc?.total_dose).toBe(input.calculation.totalDose);
    expect(calc?.rounded_dose).toBe(input.calculation.roundedDose);
    expect(calc?.snapshot_target_glucose).toBe(
      input.calculation.snapshotTargetGlucose,
    );
    expect(calc?.snapshot_correction_factor).toBe(
      input.calculation.snapshotCorrectionFactor,
    );
    expect(calc?.snapshot_carbohydrate_ratio).toBe(
      input.calculation.snapshotCarbohydrateRatio,
    );
    expect(calc?.formula_version).toBe("1.0");

    // meal_item[] (Req 9.8) — snapshot congelado no próprio item
    const items = db
      .prepare(
        "SELECT food_id, food_name_snapshot, quantity, unit, carbohydrates " +
          "FROM meal_item WHERE meal_id = ? ORDER BY food_name_snapshot",
      )
      .all(mealId) as MealItemRow[];
    expect(items.length).toBe(input.items.length);

    const expectedByFoodId = new Map(input.items.map((i) => [i.foodId, i]));
    for (const row of items) {
      const expected = expectedByFoodId.get(row.food_id);
      expect(expected).toBeDefined();
      expect(row.food_name_snapshot).toBe(expected?.foodNameSnapshot);
      expect(row.quantity).toBe(expected?.quantity);
      expect(row.unit).toBe(expected?.unit);
      expect(row.carbohydrates).toBe(expected?.carbohydrates);
    }
  });

  it("atomicidade: item com food_id inexistente viola FK, lança e não grava nada (Req 9.3, 9.4)", async () => {
    const foods = readFoods(1);
    const externalMessageId = randomUUID();
    const input = await buildValidInput(foods, externalMessageId);

    // Injeta um item com food_id inexistente (viola a FK meal_item.food_id).
    const badFoodId = randomUUID();
    input.items = [
      ...input.items,
      {
        foodId: badFoodId,
        foodNameSnapshot: "Alimento fantasma",
        quantity: 1,
        unit: null,
        carbohydrates: 10,
      },
    ];

    // Contagens antes da operação que deve falhar.
    const db = rawDb();
    const countMeals = () =>
      (db.prepare("SELECT COUNT(*) AS n FROM meal").get() as { n: number }).n;
    const countCalcs = () =>
      (
        db.prepare("SELECT COUNT(*) AS n FROM insulin_calculation").get() as {
          n: number;
        }
      ).n;
    const countItems = () =>
      (
        db.prepare("SELECT COUNT(*) AS n FROM meal_item").get() as { n: number }
      ).n;

    const mealsBefore = countMeals();
    const calcsBefore = countCalcs();
    const itemsBefore = countItems();

    // A persistência deve lançar (violação de FOREIGN KEY).
    await expect(repo.saveMealWithCalculation(input)).rejects.toThrow();

    // Nenhuma linha parcial gravada — rollback total (Req 9.4).
    expect(countMeals()).toBe(mealsBefore);
    expect(countCalcs()).toBe(calcsBefore);
    expect(countItems()).toBe(itemsBefore);

    // Especificamente, não existe meal com o external_message_id da tentativa.
    const orphan = db
      .prepare("SELECT 1 FROM meal WHERE external_message_id = ? LIMIT 1")
      .get(externalMessageId);
    expect(orphan).toBeUndefined();

    // E nenhum meal_item órfão referenciando o food fantasma.
    const orphanItem = db
      .prepare("SELECT 1 FROM meal_item WHERE food_id = ? LIMIT 1")
      .get(badFoodId);
    expect(orphanItem).toBeUndefined();
  });

  it("saveAppliedDose: registra a dose aplicada e a lê de volta (Req 10)", async () => {
    const foods = readFoods(1);
    const externalMessageId = randomUUID();
    const input = await buildValidInput(foods, externalMessageId);

    const { mealId } = await repo.saveMealWithCalculation(input);

    const appliedDose = 6;
    await repo.saveAppliedDose(mealId, appliedDose);

    const db = rawDb();
    const meal = db
      .prepare("SELECT applied_dose FROM meal WHERE id = ?")
      .get(mealId) as { applied_dose: number | null } | undefined;
    expect(meal).toBeDefined();
    expect(meal?.applied_dose).toBe(appliedDose);
  });
});
