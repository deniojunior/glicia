// tests/integration/sqlite-repository.test.ts
//
// Testes de integração do SqliteRepository (task 6.3).
//
// Cobrem o bootstrap (aplicação de migrations + seed da paciente única) e a
// leitura de parâmetros de cálculo lidos EXCLUSIVAMENTE do repositório (Req 8.6):
//   - Req 8.3: defaults target_glucose=120, correction_factor=40
//   - Req 8.4: ratios por refeição BREAKFAST=8, LUNCH=6, SNACK=8, DINNER=10
//   - Req 8.6: parâmetros obtidos exclusivamente das tabelas insulin_settings
//              e insulin_meal_settings
//   - Req 8.7: getInsulinParameters retorna null quando o ratio da refeição
//              estiver ausente (parâmetro necessário ausente)
//
// Todos os testes são determinísticos e 100% offline (Req 1.7, 18.6).

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { SqliteRepository } from "../../src/adapters/persistence/sqlite-repository.js";
import type { MealType } from "../../src/domain/types.js";

describe("SqliteRepository — bootstrap e leitura de parâmetros (Req 8.3, 8.4, 8.6, 8.7)", () => {
  // Recursos abertos por teste, fechados/limpos em afterEach.
  const openRepos: SqliteRepository[] = [];
  const tempDirs: string[] = [];

  function newRepo(dbPath: string): SqliteRepository {
    const repo = new SqliteRepository({ dbPath });
    openRepos.push(repo);
    return repo;
  }

  // Cria um diretório temporário único e devolve o caminho de um arquivo .db nele.
  function tempDbPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "glicia-sqlite-"));
    tempDirs.push(dir);
    return join(dir, `${randomUUID()}.db`);
  }

  afterEach(() => {
    // Fecha todas as conexões abertas no teste (Req: liberar recursos).
    while (openRepos.length > 0) {
      const repo = openRepos.pop();
      try {
        repo?.close();
      } catch {
        // Ignora dupla tentativa de fechamento.
      }
    }
    // Remove diretórios temporários (inclui arquivos -journal/-wal do SQLite).
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir !== undefined && existsSync(dir)) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  describe("bootstrap em :memory: (Req 8.6)", () => {
    it("aplica migrations e semeia uma única paciente recuperável", async () => {
      const repo = newRepo(":memory:");

      const patient = await repo.getPatient();

      expect(patient.name.trim().length).toBeGreaterThan(0);
      expect(patient.id.length).toBeGreaterThan(0);
    });

    it("é idempotente: reabrir aplica migrations sem duplicar a paciente", async () => {
      // Usa arquivo persistente para simular reabertura sobre o mesmo schema/seed.
      const dbPath = tempDbPath();

      const repo1 = newRepo(dbPath);
      const first = await repo1.getPatient();

      // Segunda conexão reaplica migrations (idempotentes) e deve ver a mesma paciente.
      const repo2 = newRepo(dbPath);
      const second = await repo2.getPatient();

      expect(second.id).toBe(first.id);
      expect(second.name).toBe(first.name);
    });
  });

  describe("getInsulinParameters retorna os defaults semeados (Req 8.3, 8.4)", () => {
    // Tabela de ratios default por tipo de refeição (Req 8.4).
    const expectedRatios: ReadonlyArray<readonly [MealType, number]> = [
      ["BREAKFAST", 8],
      ["LUNCH", 6],
      ["SNACK", 8],
      ["DINNER", 10],
    ];

    it("LUNCH → { targetGlucose: 120, correctionFactor: 40, carbohydrateRatio: 6 }", async () => {
      const repo = newRepo(":memory:");

      const params = await repo.getInsulinParameters("LUNCH");

      expect(params).toEqual({
        targetGlucose: 120,
        correctionFactor: 40,
        carbohydrateRatio: 6,
      });
    });

    it.each(expectedRatios)(
      "%s → defaults 120/40 e ratio %d",
      async (mealType, ratio) => {
        const repo = newRepo(":memory:");

        const params = await repo.getInsulinParameters(mealType);

        expect(params).not.toBeNull();
        expect(params).toEqual({
          targetGlucose: 120,
          correctionFactor: 40,
          carbohydrateRatio: ratio,
        });
      },
    );
  });

  describe("getInsulinParameters retorna null quando o ratio está ausente (Req 8.7)", () => {
    it("DINNER → null após remover o ratio de DINNER no banco", async () => {
      // Usa um arquivo temporário para poder manipular o banco por fora do repo.
      const dbPath = tempDbPath();

      const repo = newRepo(dbPath);

      // Sanidade: com o seed intacto, DINNER resolve normalmente.
      const before = await repo.getInsulinParameters("DINNER");
      expect(before).not.toBeNull();

      // Conexão bruta ao MESMO arquivo remove o ratio de DINNER (parâmetro ausente).
      const raw = new Database(dbPath);
      try {
        raw.pragma("foreign_keys = ON");
        const result = raw
          .prepare("DELETE FROM insulin_meal_settings WHERE meal_type = ?")
          .run("DINNER");
        expect(result.changes).toBe(1);
      } finally {
        raw.close();
      }

      // Agora o parâmetro necessário está ausente → null (Req 8.7).
      const after = await repo.getInsulinParameters("DINNER");
      expect(after).toBeNull();

      // Os demais tipos de refeição permanecem íntegros.
      const lunch = await repo.getInsulinParameters("LUNCH");
      expect(lunch).toEqual({
        targetGlucose: 120,
        correctionFactor: 40,
        carbohydrateRatio: 6,
      });
    });
  });
});
