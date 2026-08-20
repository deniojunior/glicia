// tests/property/historical-immutability.property.test.ts
//
// Teste de propriedade — imutabilidade histórica frente a mudanças no Food.
//
// Feature: glicia, Property 18: Imutabilidade histórica frente a mudanças no Food
//
// Req 9.9: quando uma refeição histórica é exibida ou recuperada, o sistema
// SHALL usar os valores armazenados no `meal_item` (food_name_snapshot,
// carbohydrates), e NÃO o valor atual do `food`.
//
// A propriedade valida que, após persistir um `meal_item` com um dado
// food_name_snapshot e um valor de carbohydrates congelados no momento do
// registro, MUTAR a linha correspondente em `food` (nome e carboidratos, via
// UPDATE bruto com better-sqlite3) NÃO altera os valores previamente
// persistidos no `meal_item`.
//
// Estratégia por execução (mantida leve): semeia um `food` (insert bruto com
// nome/carbs iniciais), cria uma conversa, persiste uma refeição referenciando
// esse `food` com nome/carbs de snapshot próprios (independentes do `food`),
// relê o `meal_item` e registra seus valores, muta a linha `food` para
// nome/carbs novos e aleatórios, e relê o `meal_item` afirmando que permanece
// inalterado e igual aos valores de snapshot informados na entrada.
//
// Bootstrap: um banco SQLite em arquivo temporário compartilhado é criado em
// beforeAll, permitindo uma conexão bruta paralela para UPDATE em `food` e
// leitura de `meal_item`. Ids e externalMessageId são únicos por execução.
//
// Validates: Requirements 9.9

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fc from "fast-check";
import Database from "better-sqlite3";

import { SqliteRepository } from "../../src/adapters/persistence/sqlite-repository.js";
import type { SaveMealInput } from "../../src/domain/ports/repository.js";

describe("Feature: glicia, Property 18: Imutabilidade histórica frente a mudanças no Food", () => {
  let tempDir: string;
  let dbPath: string;
  let repo: SqliteRepository;
  // Conexão bruta ao MESMO arquivo, para mutar `food` e reler `meal_item`.
  let raw: Database.Database;
  let patientId: string;

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "glicia-hist-immutability-"));
    dbPath = join(tempDir, `${randomUUID()}.db`);

    // Aplica migrations + seed da paciente única.
    repo = new SqliteRepository({ dbPath });

    // Conexão bruta paralela ao mesmo arquivo (FK ligada, como no repo).
    raw = new Database(dbPath);
    raw.pragma("foreign_keys = ON");

    const patient = await repo.getPatient();
    patientId = patient.id;
  });

  afterAll(() => {
    try {
      raw.close();
    } catch {
      // Ignora fechamento duplo.
    }
    try {
      repo.close();
    } catch {
      // Ignora fechamento duplo.
    }
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // Insere um `food` (identidade) bruto e uma `food_measure` associada, e
  // retorna o id do food. Nome prefixado com um token único para não colidir
  // com o índice único ux_food_name_norm entre execuções.
  //
  // No modelo normalizado, a tabela `food` é apenas identidade (id, name,
  // active); as colunas de porção/carboidratos migraram para `food_measure`.
  function insertFood(name: string, carbohydrates: number): string {
    const id = randomUUID();
    raw
      .prepare("INSERT INTO food (id, name, active) VALUES (?, ?, 1)")
      .run(id, `${id} ${name}`);
    // Medida associada — permite exercitar mutação nutricional posteriormente.
    raw
      .prepare(
        "INSERT INTO food_measure " +
          "(id, food_id, serving_unit, serving_quantity, carbohydrates, active) " +
          "VALUES (?, ?, ?, ?, ?, 1)",
      )
      .run(randomUUID(), id, "unidade", 100, carbohydrates);
    return id;
  }

  interface MealItemRow {
    food_name_snapshot: string;
    carbohydrates: number;
  }

  function readMealItem(mealId: string): MealItemRow {
    return raw
      .prepare(
        "SELECT food_name_snapshot, carbohydrates FROM meal_item WHERE meal_id = ? LIMIT 1",
      )
      .get(mealId) as MealItemRow;
  }

  it("mutar o Food subjacente não altera o snapshot persistido no meal_item (Req 9.9)", async () => {
    // Valores numéricos finitos e não-NaN; faixas moderadas mantêm cada execução leve.
    const carbsArb = fc.double({ min: 0, max: 10000, noNaN: true });
    const quantityArb = fc.double({ min: 0.01, max: 100, noNaN: true });

    await fc.assert(
      fc.asyncProperty(
        fc.string(), // initialFoodName (nome inicial do food)
        carbsArb, // initialFoodCarbs
        fc.string(), // snapshotName (nome congelado no meal_item)
        carbsArb, // snapshotCarbs (carbs congelados no meal_item)
        quantityArb, // quantity do item
        fc.option(fc.string(), { nil: null }), // unit
        fc.string(), // newFoodName (após mutação)
        carbsArb, // newFoodCarbs (após mutação)
        async (
          initialFoodName,
          initialFoodCarbs,
          snapshotName,
          snapshotCarbs,
          quantity,
          unit,
          newFoodName,
          newFoodCarbs,
        ) => {
          // 1) Semeia um food com nome/carbs iniciais.
          const foodId = insertFood(initialFoodName, initialFoodCarbs);

          // 2) Cria uma conversa (paciente única cadastrada).
          const conversation = await repo.createConversation();

          // 3) Persiste a refeição referenciando o food, com snapshot próprio.
          //    Os valores de snapshot (nome/carbs) são independentes do food.
          const externalMessageId = randomUUID();
          const input: SaveMealInput = {
            conversationId: conversation.id,
            patientId,
            externalMessageId,
            mealType: "LUNCH",
            glucose: 120,
            totalCarbohydrates: snapshotCarbs,
            items: [
              {
                foodId,
                foodNameSnapshot: snapshotName,
                quantity,
                unit,
                carbohydrates: snapshotCarbs,
              },
            ],
            calculation: {
              correctionDose: 0,
              carbohydrateDose: 0,
              totalDose: 0,
              roundedDose: 0,
              snapshotTargetGlucose: 120,
              snapshotCorrectionFactor: 40,
              snapshotCarbohydrateRatio: 6,
              formulaVersion: "1.0",
            },
          };
          const { mealId } = await repo.saveMealWithCalculation(input);

          // 4) Lê de volta o meal_item e registra os valores congelados.
          const before = readMealItem(mealId);
          expect(before.food_name_snapshot).toBe(snapshotName);
          expect(before.carbohydrates).toBe(snapshotCarbs);

          // 5) Muta o food subjacente (UPDATE bruto): renomeia a identidade em
          //    `food` e altera os carboidratos da `food_measure` associada.
          //    No modelo normalizado, os carboidratos vivem em `food_measure`.
          const renamed = raw
            .prepare("UPDATE food SET name = ? WHERE id = ?")
            .run(`${foodId} ${newFoodName}`, foodId);
          expect(renamed.changes).toBe(1);
          const recarbed = raw
            .prepare("UPDATE food_measure SET carbohydrates = ? WHERE food_id = ?")
            .run(newFoodCarbs, foodId);
          expect(recarbed.changes).toBe(1);

          // 6) Relê o meal_item: deve permanecer inalterado (Req 9.9).
          const after = readMealItem(mealId);
          expect(after.food_name_snapshot).toBe(before.food_name_snapshot);
          expect(after.carbohydrates).toBe(before.carbohydrates);
          // E igual aos valores de snapshot originalmente informados na entrada.
          expect(after.food_name_snapshot).toBe(snapshotName);
          expect(after.carbohydrates).toBe(snapshotCarbs);
        },
      ),
      { numRuns: 100 },
    );
  });
});
