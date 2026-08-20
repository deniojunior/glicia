// tests/e2e/food-fixture.ts
//
// Fixture determinístico de alimentos para os testes end-to-end.
//
// Os e2e exercitam FLUXOS de conversa (interpretação → confirmação → cálculo →
// persistência), não a base de alimentos de produção. Semear o CSV de produção
// (`seeds/sbd-foods.csv`, milhares de linhas) tornaria os testes acoplados ao
// conteúdo dessa base — qualquer alimento novo com medida parecida (ex.: várias
// medidas de "arroz") introduziria ambiguidade e quebraria asserções de fluxo.
//
// Por isso os e2e usam `seedFoods: false` e semeiam ESTE fixture mínimo e
// controlado diretamente na conexão do repositório (a MESMA conexão ":memory:").
//
// Fixture: um único alimento "Arroz branco cozido" com uma única medida
// ("colher de sopa" = 25 g, 6.2 g de CHO) e o alias "arroz". Isso garante
// resolução determinística e NÃO-ambígua para os fluxos testados.

import { randomUUID } from "node:crypto";

import type Database from "better-sqlite3";

/**
 * Semeia o alimento "Arroz branco cozido" (uma medida "colher de sopa" com
 * 25 g / 6.2 g de CHO) e o alias "arroz" na conexão fornecida. Idempotente via
 * `INSERT OR IGNORE` sobre os índices únicos normalizados.
 */
export function seedArrozFixture(db: Database.Database): void {
  const foodId = randomUUID();

  db.prepare("INSERT OR IGNORE INTO food (id, name, active) VALUES (?, ?, 1)").run(
    foodId,
    "Arroz branco cozido",
  );

  const row = db
    .prepare("SELECT id FROM food WHERE lower(trim(name)) = ? LIMIT 1")
    .get("arroz branco cozido") as { id: string } | undefined;
  const resolvedFoodId = row?.id ?? foodId;

  db.prepare(
    "INSERT OR IGNORE INTO food_measure " +
      "(id, food_id, serving_unit, serving_quantity, carbohydrates, active) " +
      "VALUES (?, ?, ?, ?, ?, 1)",
  ).run(randomUUID(), resolvedFoodId, "colher de sopa", 25, 6.2);

  db.prepare(
    "INSERT OR IGNORE INTO food_alias (id, food_id, alias) VALUES (?, ?, ?)",
  ).run(randomUUID(), resolvedFoodId, "arroz");
}
