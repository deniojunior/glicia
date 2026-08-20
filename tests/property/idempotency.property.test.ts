// tests/property/idempotency.property.test.ts
//
// Teste de propriedade — idempotência por External_Message_Id.
//
// Feature: glicia, Property 19: Idempotência por External_Message_Id
//
// Req 13.2: quando uma mensagem com External_Message_Id já processado é
// recebida, o sistema SHALL abster-se de criar um novo registro de refeição
// para essa mensagem.
// Req 13.3: onde o canal é o Terminal_Channel, o sistema SHALL aplicar um
// mecanismo equivalente de deduplicação de mensagens de entrada (garantido
// pela restrição de unicidade sobre external_message_id — Req 13.1).
//
// A propriedade valida que, para um externalMessageId arbitrário:
//   - após salvar uma refeição com ele uma vez, isMessageProcessed(id) => true;
//   - uma SEGUNDA tentativa de salvar com o MESMO externalMessageId não cria
//     uma segunda refeição — seja lançando (violação de UNIQUE), seja
//     retornando sem inserir linha; em AMBOS os casos, a contagem de meals com
//     aquele external_message_id permanece exatamente 1;
//   - um externalMessageId DIFERENTE cria uma refeição separada (contagem 1).
//
// Estratégia: um banco SQLite em arquivo temporário compartilhado é criado em
// beforeAll. As migrations aplicam schema + seed da paciente única; um food é
// semeado por INSERT bruto para satisfazer a FK meal_item.food_id -> food(id);
// uma conversa é criada. Uma conexão bruta better-sqlite3 é usada para contar
// meals por external_message_id. Cada execução gera um id base único
// (randomUUID + discriminador do fast-check) para evitar colisões entre runs.
// Recursos são liberados em afterAll.
//
// Validates: Requirements 13.2, 13.3

import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import fc from "fast-check";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SqliteRepository } from "../../src/adapters/persistence/sqlite-repository.js";
import type { SaveMealInput } from "../../src/domain/ports/repository.js";

let tempDir: string;
let dbPath: string;
let repo: SqliteRepository;
let raw: Database.Database; // conexão bruta para semear food e contar meals
let patientId: string;
let conversationId: string;
let foodId: string;

beforeAll(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "glicia-idempotency-"));
  dbPath = join(tempDir, `${randomUUID()}.db`);

  // Bootstrap: aplica migrations (schema + seed da paciente única).
  repo = new SqliteRepository({ dbPath });

  // Conexão bruta ao MESMO arquivo, para semear o food e contar meals.
  raw = new Database(dbPath);
  raw.pragma("foreign_keys = ON");

  // Semeia um food com id conhecido para satisfazer a FK dos meal_item.
  foodId = randomUUID();
  raw
    .prepare("INSERT INTO food (id, name, active) VALUES (?, ?, 1)")
    .run(foodId, `Alimento idempotencia ${foodId}`);

  const patient = await repo.getPatient();
  patientId = patient.id;

  const conversation = await repo.createConversation();
  conversationId = conversation.id;
});

afterAll(() => {
  try {
    raw.close();
  } catch {
    // ignora
  }
  try {
    repo.close();
  } catch {
    // ignora
  }
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

// Conta quantas refeições existem para um dado external_message_id.
function countMeals(externalMessageId: string): number {
  const row = raw
    .prepare(
      "SELECT COUNT(*) AS n FROM meal WHERE external_message_id = ?",
    )
    .get(externalMessageId) as { n: number };
  return row.n;
}

// Monta um SaveMealInput válido e mínimo para um dado externalMessageId.
function buildInput(externalMessageId: string): SaveMealInput {
  return {
    conversationId,
    patientId,
    externalMessageId,
    mealType: "LUNCH",
    glucose: 120,
    totalCarbohydrates: 20,
    items: [
      {
        foodId,
        foodNameSnapshot: "Alimento idempotencia",
        quantity: 100,
        unit: "g",
        carbohydrates: 20,
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
}

describe("Feature: glicia, Property 19: Idempotência por External_Message_Id", () => {
  it("salvar duas vezes com o mesmo External_Message_Id não cria refeição duplicada (Req 13.2, 13.3)", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Discriminador do fast-check combinado a um salt randomUUID por
        // execução, garantindo ids únicos e sem colisão entre runs.
        fc.string({ maxLength: 24 }),
        async (discriminator) => {
          const salt = randomUUID();
          const id = `${salt}-${discriminator}`;
          const otherId = `${salt}-other-${discriminator}`;

          // 1) Primeiro salvamento com o id.
          await repo.saveMealWithCalculation(buildInput(id));

          // isMessageProcessed(id) torna-se true (Req 13.2).
          expect(await repo.isMessageProcessed(id)).toBe(true);
          expect(countMeals(id)).toBe(1);

          // 2) Segundo salvamento com o MESMO id: pode lançar (violação de
          //    UNIQUE) ou retornar sem inserir — em ambos os casos a contagem
          //    permanece exatamente 1 (Req 13.2, 13.3).
          try {
            await repo.saveMealWithCalculation(buildInput(id));
          } catch {
            // Violação de unicidade é um desfecho aceitável.
          }
          expect(countMeals(id)).toBe(1);
          expect(await repo.isMessageProcessed(id)).toBe(true);

          // 3) Um id DIFERENTE cria uma refeição separada.
          await repo.saveMealWithCalculation(buildInput(otherId));
          expect(await repo.isMessageProcessed(otherId)).toBe(true);
          expect(countMeals(otherId)).toBe(1);
          // O id original continua com exatamente uma refeição.
          expect(countMeals(id)).toBe(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
