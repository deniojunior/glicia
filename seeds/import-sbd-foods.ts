// seeds/import-sbd-foods.ts
//
// Importação da base de alimentos do SBD_Manual (páginas 48-153) para o
// Food_Database (Req 12). Seed determinístico, executável offline, que popula
// as tabelas `food`, `food_measure` e `food_alias` a partir de arquivos CSV
// versionados no repositório (`sbd-foods.csv`, `sbd-aliases.csv`).
//
// ATENÇÃO — AMOSTRA: os CSVs versionados contêm apenas uma AMOSTRA de alimentos
// (os poucos exemplos necessários para exercitar o modelo, incluindo alimentos
// com MÚLTIPLAS medidas). A base completa do Manual SBD deve ser fornecida à
// parte (substituindo/estendendo `sbd-foods.csv` e `sbd-aliases.csv`, ou via
// `ImportSbdFoodsOptions`).
//
// Modelo NORMALIZADO (design.md — schema normalizado):
//   - `food` guarda a IDENTIDADE do alimento (id, name, active). Um alimento
//     é único por nome normalizado (lower/trim) via `ux_food_name_norm`.
//   - `food_measure` guarda cada par (alimento + medida) como um registro
//     próprio, com seu próprio valor de carboidratos. Um mesmo alimento pode
//     ter VÁRIAS medidas — várias linhas do CSV podem compartilhar o mesmo
//     `name` com medidas diferentes. Único por (food_id, serving_unit
//     normalizado) via `ux_food_measure_food_unit`.
//   - `food_alias` aponta para a identidade do alimento (Req 12.5).
//
// Princípios (design.md — Estratégia de Importação da Base de Alimentos):
//   - Tolerante a falhas POR LINHA: uma linha malformada nunca interrompe a
//     importação das válidas (Req 12.4); é registrada em `errors`.
//   - Determinístico: a mesma entrada gera sempre o mesmo conjunto de dados.
//   - Idempotente: reexecutar o seed não duplica identidades (por nome
//     normalizado), medidas (por food_id + medida normalizada) nem aliases —
//     protegido pelos índices únicos via `INSERT OR IGNORE`.
//   - Alimentos e medidas são inseridos com `active = 1` (Req 12.3).
//   - Aliases (Req 12.5) são cadastrados após os foods, associados ao food por
//     nome normalizado, também de forma idempotente.
//
// better-sqlite3 é SÍNCRONO; a função de importação também é síncrona.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

// Caminhos padrão dos CSVs versionados (resolvidos em relação a este módulo).
const DEFAULT_FOODS_CSV = fileURLToPath(new URL("./sbd-foods.csv", import.meta.url));
const DEFAULT_ALIASES_CSV = fileURLToPath(
  new URL("./sbd-aliases.csv", import.meta.url),
);

// Relatório da importação (Req 12.4, 12.5). `errors` lista as linhas
// malformadas/incompletas SEM abortar as válidas.
export interface ImportError {
  line: number | string; // número da linha (foods) ou rótulo (ex.: "alias:3")
  reason: string;
}

export interface ImportReport {
  foodsInserted: number; // NOVAS identidades de alimento inseridas
  measuresInserted: number; // medidas (food_measure) inseridas
  aliasesInserted: number; // aliases efetivamente inseridos
  errors: ImportError[];
}

export interface ImportSbdFoodsOptions {
  // Caminho do CSV de alimentos (padrão: seeds/sbd-foods.csv).
  foodsCsvPath?: string;
  // Caminho do CSV de aliases (padrão: seeds/sbd-aliases.csv).
  aliasesCsvPath?: string;
}

// Entrada: uma conexão better-sqlite3 já aberta OU um caminho de arquivo .db.
type DbInput = Database.Database | string;

// --- CSV: parser mínimo e robusto -----------------------------------------

// Faz o parse de uma única linha de CSV, suportando campos entre aspas duplas
// (com vírgulas embutidas) e aspas escapadas por duplicação (""). Retorna a
// lista de campos com aspas removidas. Mantém-se simples de propósito: cobre o
// formato dos seeds e é tolerante a espaços nas extremidades dos campos crus.
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1; // pula a segunda aspa (escape "")
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}

// Divide o conteúdo em linhas não vazias, preservando o número original da
// linha (1-based) para relatório de erros. Ignora a linha de cabeçalho.
interface CsvRow {
  lineNumber: number; // 1-based, referente ao arquivo original
  fields: string[];
}

function readCsvRows(csvPath: string): CsvRow[] {
  const content = readFileSync(csvPath, "utf8");
  const rawLines = content.split(/\r?\n/);
  const rows: CsvRow[] = [];

  // Índice 0 é o cabeçalho; começa a coletar a partir da linha 2 (1-based).
  for (let i = 1; i < rawLines.length; i += 1) {
    const raw = rawLines[i];
    if (raw === undefined || raw.trim() === "") {
      continue; // ignora linhas em branco
    }
    rows.push({ lineNumber: i + 1, fields: parseCsvLine(raw) });
  }

  return rows;
}

// Normalização de nome/alias/medida: insensível a caixa e a espaços nas
// extremidades (Req 4.2). Igual à usada pelo FoodResolver / índices únicos.
function normalize(raw: string): string {
  return raw.trim().toLowerCase();
}

// Converte texto em número finito; retorna null quando inválido.
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") {
    return null;
  }
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

// --- Importação -------------------------------------------------------------

export function importSbdFoods(
  db: DbInput,
  options: ImportSbdFoodsOptions = {},
): ImportReport {
  const foodsCsvPath = options.foodsCsvPath ?? DEFAULT_FOODS_CSV;
  const aliasesCsvPath = options.aliasesCsvPath ?? DEFAULT_ALIASES_CSV;

  // Abre a conexão se recebido um caminho; nesse caso, fecha ao final.
  const ownsConnection = typeof db === "string";
  const connection: Database.Database =
    typeof db === "string" ? new Database(db) : db;
  if (ownsConnection) {
    connection.pragma("foreign_keys = ON");
  }

  const report: ImportReport = {
    foodsInserted: 0,
    measuresInserted: 0,
    aliasesInserted: 0,
    errors: [],
  };

  try {
    // INSERT OR IGNORE aproveita os índices únicos normalizados para garantir
    // idempotência:
    //   - ux_food_name_norm          → identidade única por nome normalizado
    //   - ux_food_measure_food_unit  → medida única por (food_id + medida norm.)
    //   - ux_food_alias_norm         → alias único por alias normalizado
    const insertFood = connection.prepare(
      "INSERT OR IGNORE INTO food (id, name, active) VALUES (?, ?, 1)",
    );
    const findFoodIdByName = connection.prepare(
      "SELECT id FROM food WHERE lower(trim(name)) = ? LIMIT 1",
    );
    const insertMeasure = connection.prepare(
      "INSERT OR IGNORE INTO food_measure " +
        "(id, food_id, serving_unit, serving_quantity, carbohydrates, active) " +
        "VALUES (?, ?, ?, ?, ?, 1)",
    );
    const insertAlias = connection.prepare(
      "INSERT OR IGNORE INTO food_alias (id, food_id, alias) VALUES (?, ?, ?)",
    );

    // --- 1) Alimentos + medidas ---
    // Cada linha do CSV é um par (food, measure). O food é UPSERTado por nome
    // normalizado (dedupe → uma identidade); a medida é anexada a esse food.
    for (const { lineNumber, fields } of readCsvRows(foodsCsvPath)) {
      if (fields.length < 4) {
        report.errors.push({
          line: lineNumber,
          reason: `número de colunas inválido: esperado 4, obtido ${fields.length}`,
        });
        continue;
      }

      const name = (fields[0] ?? "").trim();
      const unit = (fields[1] ?? "").trim();
      const quantity = parseNumber(fields[2] ?? "");
      const carbohydrates = parseNumber(fields[3] ?? "");

      // Validação por campo (design.md): name/unit não vazios,
      // serving_quantity > 0, carbohydrates >= 0.
      if (name === "") {
        report.errors.push({ line: lineNumber, reason: "name vazio" });
        continue;
      }
      if (unit === "") {
        report.errors.push({
          line: lineNumber,
          reason: "serving_unit vazio",
        });
        continue;
      }
      if (quantity === null || quantity <= 0) {
        report.errors.push({
          line: lineNumber,
          reason: "serving_quantity deve ser número > 0",
        });
        continue;
      }
      if (carbohydrates === null || carbohydrates < 0) {
        report.errors.push({
          line: lineNumber,
          reason: "carbohydrates deve ser número >= 0",
        });
        continue;
      }

      // UPSERT da IDENTIDADE do alimento por nome normalizado. Se já existir
      // (mesma linha ou linha anterior com o mesmo nome), reaproveita o id.
      const insertResult = insertFood.run(randomUUID(), name);
      if (insertResult.changes > 0) {
        report.foodsInserted += 1;
      }

      const foodRow = findFoodIdByName.get(normalize(name)) as
        | { id: string }
        | undefined;
      if (foodRow === undefined) {
        // Não deveria acontecer após o INSERT OR IGNORE, mas registramos para
        // não abortar as demais linhas.
        report.errors.push({
          line: lineNumber,
          reason: `falha ao resolver identidade do alimento: "${name}"`,
        });
        continue;
      }

      // Anexa a medida ao alimento; idempotente por (food_id + medida norm.).
      const measureResult = insertMeasure.run(
        randomUUID(),
        foodRow.id,
        unit,
        quantity,
        carbohydrates,
      );
      if (measureResult.changes > 0) {
        report.measuresInserted += 1;
      }
    }

    // --- 2) Aliases (após os foods) ---
    for (const { lineNumber, fields } of readCsvRows(aliasesCsvPath)) {
      const label = `alias:${lineNumber}`;

      if (fields.length < 2) {
        report.errors.push({
          line: label,
          reason: `número de colunas inválido: esperado 2, obtido ${fields.length}`,
        });
        continue;
      }

      const foodName = (fields[0] ?? "").trim();
      const alias = (fields[1] ?? "").trim();

      if (foodName === "") {
        report.errors.push({ line: label, reason: "food_name vazio" });
        continue;
      }
      if (alias === "") {
        report.errors.push({ line: label, reason: "alias vazio" });
        continue;
      }

      const foodRow = findFoodIdByName.get(normalize(foodName)) as
        | { id: string }
        | undefined;
      if (foodRow === undefined) {
        report.errors.push({
          line: label,
          reason: `food_name não encontrado no Food_Database: "${foodName}"`,
        });
        continue;
      }

      const result = insertAlias.run(randomUUID(), foodRow.id, alias);
      if (result.changes > 0) {
        report.aliasesInserted += 1;
      }
    }

    return report;
  } finally {
    if (ownsConnection) {
      connection.close();
    }
  }
}
