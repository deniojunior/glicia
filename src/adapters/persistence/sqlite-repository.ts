// src/adapters/persistence/sqlite-repository.ts
//
// SqliteRepository — implementação da porta `Repository` (Req 8, 9, 10, 13, 16)
// para a Fase 1 (MVP Local). Persistência local em SQLite via better-sqlite3,
// 100% offline (Req 1.7, 18.6).
//
// Princípio arquitetural central:
//   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
//
// Este adaptador é a ÚNICA fonte dos dados de leitura usados pelo domínio:
//   - parâmetros de cálculo lidos exclusivamente daqui (Req 8.6);
//   - valores nutricionais dos alimentos vêm exclusivamente do Food_Database
//     (Req 4.9), nunca do Interpreter.
//
// Escopo desta implementação (task 6.2): bootstrap (conexão + migrations) e os
// métodos de LEITURA (`getPatient`, `getInsulinParameters`, resolução de
// alimentos). Os métodos de ESCRITA (conversa, idempotência, persistência
// atômica de refeição, atualização de parâmetros/dose) são preenchidos na
// task 12.x — aqui ficam como stubs explícitos que lançam erro.
//
// better-sqlite3 é SÍNCRONO; os métodos assíncronos da porta apenas embrulham
// os resultados síncronos em Promises.

import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import type {
  Conversation,
  Food,
  FoodEntry,
  FoodMeasure,
  FoodMemory,
  InsulinParameters,
  NewConversationMessage,
  Patient,
  Repository,
  SaveMealInput,
} from "../../domain/ports/repository.js";
import type { ConversationStatus, MealType } from "../../domain/types.js";

// Diretório padrão das migrations (fonte única de schema). Resolvido em relação
// a este módulo: tanto em `src/adapters/persistence` quanto no build
// `dist/adapters/persistence`, subir três níveis chega à raiz do projeto.
const DEFAULT_MIGRATIONS_DIR = fileURLToPath(
  new URL("../../../migrations", import.meta.url),
);

// Caminho padrão do banco: variável de ambiente ou arquivo local (Req 1.7).
const DEFAULT_DB_PATH = process.env.GLICIA_DB_PATH ?? "glicia.db";

// Opções de construção do repositório.
export interface SqliteRepositoryOptions {
  // Caminho do arquivo SQLite, ou ":memory:" para banco em memória (testes).
  dbPath?: string;
  // Diretório de onde ler as migrations `*.sql` (padrão: `migrations/`).
  migrationsDir?: string;
  // Se `false`, não aplica as migrations no construtor (chame `migrate()`).
  runMigrations?: boolean;
}

// --- Linhas cruas retornadas pelo SQLite (colunas em snake_case) ---

interface PatientRow {
  id: string;
  name: string;
  whatsapp_phone: string | null;
}

interface InsulinParametersRow {
  target_glucose: number;
  correction_factor: number;
  carbohydrate_ratio: number;
}

interface FoodRow {
  id: string;
  name: string;
  active: number; // INTEGER 0/1 (SQLite não possui BOOLEAN nativo)
}

// Mapeia uma linha `food` (snake_case, active 0/1) para a entidade Food
// (identidade apenas — os valores nutricionais vivem em food_measure, Req 12.2).
function mapFood(row: FoodRow): Food {
  return {
    id: row.id,
    name: row.name,
    active: row.active === 1,
  };
}

// Linha crua de `food_measure` (colunas em snake_case).
interface FoodMeasureRow {
  id: string;
  food_id: string;
  serving_unit: string;
  serving_quantity: number;
  carbohydrates: number;
  active: number; // INTEGER 0/1 (SQLite não possui BOOLEAN nativo)
}

interface FoodMemoryRow {
  id: string;
  patient_id: string;
  phrase: string;
  normalized_phrase: string;
  food_id: string;
  measure_id: string;
  updated_at: string;
}

// Mapeia uma linha `food_measure` (snake_case, active 0/1) para FoodMeasure.
function mapFoodMeasure(row: FoodMeasureRow): FoodMeasure {
  return {
    id: row.id,
    foodId: row.food_id,
    servingUnit: row.serving_unit,
    servingQuantity: row.serving_quantity,
    carbohydrates: row.carbohydrates,
    active: row.active === 1,
  };
}

function mapFoodMemory(row: FoodMemoryRow): FoodMemory {
  return {
    id: row.id,
    patientId: row.patient_id,
    phrase: row.phrase,
    normalizedPhrase: row.normalized_phrase,
    foodId: row.food_id,
    measureId: row.measure_id,
    updatedAt: row.updated_at,
  };
}

// Colunas de `food` (identidade) reutilizadas nas consultas de resolução.
const FOOD_COLUMNS = "f.id, f.name, f.active";

export class SqliteRepository implements Repository {
  private readonly db: Database.Database;
  private readonly migrationsDir: string;
  private activeFoodEntriesCache: FoodEntry[] | null = null;

  constructor(options: SqliteRepositoryOptions = {}) {
    const dbPath = options.dbPath ?? DEFAULT_DB_PATH;
    this.migrationsDir = options.migrationsDir ?? DEFAULT_MIGRATIONS_DIR;

    this.db = new Database(dbPath);
    // A checagem de FOREIGN KEY exige este pragma por conexão (ver 0001_init.sql).
    this.db.pragma("foreign_keys = ON");

    if (options.runMigrations !== false) {
      this.migrate();
    }
  }

  // Aplica as migrations `*.sql` em ordem lexicográfica. Idempotente: um registro
  // de bookkeeping (`schema_migrations`) evita reaplicar arquivos já executados,
  // e o seed usa `INSERT OR IGNORE`, tornando o bootstrap seguro contra reexecução.
  migrate(): void {
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS schema_migrations (" +
        "name TEXT PRIMARY KEY, " +
        "applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );

    const applied = new Set(
      this.db
        .prepare("SELECT name FROM schema_migrations")
        .all()
        .map((row) => (row as { name: string }).name),
    );

    const files = readdirSync(this.migrationsDir)
      .filter((name) => name.endsWith(".sql"))
      .sort();

    const record = this.db.prepare(
      "INSERT INTO schema_migrations (name) VALUES (?)",
    );

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = readFileSync(join(this.migrationsDir, file), "utf8");
      // Cada migration é aplicada atomicamente com seu registro de bookkeeping.
      const apply = this.db.transaction(() => {
        this.db.exec(sql);
        record.run(file);
      });
      apply();
    }
  }

  // Fecha a conexão subjacente (útil para limpeza em testes/CLI).
  close(): void {
    this.db.close();
  }

  // Expõe a conexão subjacente para tarefas de bootstrap (ex.: seed de
  // alimentos). É a MESMA conexão usada pelo repositório, o que garante que o
  // seed alcance inclusive bancos ":memory:" (uma nova conexão ":memory:" seria
  // um banco distinto e vazio). Uso restrito a composição/bootstrap.
  getDatabase(): Database.Database {
    return this.db;
  }

  // Nota: os inserts futuros (task 12.x) gerarão UUIDs na aplicação via
  // `node:crypto` randomUUID; nenhuma escrita é feita nesta task.

  // --- Leituras ---

  // Paciente única (Req 14.1, 14.3). Assume a identidade da paciente cadastrada.
  async getPatient(): Promise<Patient> {
    const row = this.db
      .prepare(
        "SELECT id, name, whatsapp_phone FROM patient ORDER BY created_at, id LIMIT 1",
      )
      .get() as PatientRow | undefined;

    if (row === undefined) {
      throw new Error(
        "Nenhuma paciente cadastrada — execute as migrations/seed (0002_seed_patient_defaults.sql).",
      );
    }

    return {
      id: row.id,
      name: row.name,
      whatsappPhone: row.whatsapp_phone,
    };
  }

  // Parâmetros de cálculo lidos EXCLUSIVAMENTE daqui (Req 8.6). Junta
  // insulin_settings (globais) com insulin_meal_settings (ratio por refeição).
  // Retorna null quando o ratio da refeição estiver ausente (Req 8.7).
  async getInsulinParameters(
    mealType: MealType,
  ): Promise<InsulinParameters | null> {
    const row = this.db
      .prepare(
        "SELECT s.target_glucose, s.correction_factor, ms.carbohydrate_ratio " +
          "FROM insulin_settings s " +
          "JOIN insulin_meal_settings ms " +
          "  ON ms.patient_id = s.patient_id AND ms.meal_type = ? " +
          "LIMIT 1",
      )
      .get(mealType) as InsulinParametersRow | undefined;

    if (row === undefined) {
      return null;
    }

    return {
      targetGlucose: row.target_glucose,
      correctionFactor: row.correction_factor,
      carbohydrateRatio: row.carbohydrate_ratio,
    };
  }

  // Correspondência exata por alias, insensível a caixa e a espaços nas
  // extremidades (Req 4.2, 4.3). Considera apenas alimentos ativos.
  // `normalizedName` já vem normalizado (lower/trim) pelo FoodResolver.
  async findFoodByAliasExact(normalizedName: string): Promise<Food | null> {
    const row = this.db
      .prepare(
        `SELECT ${FOOD_COLUMNS} FROM food_alias a ` +
          "JOIN food f ON f.id = a.food_id " +
          "WHERE lower(trim(a.alias)) = ? AND f.active = 1 " +
          "ORDER BY f.name, f.id LIMIT 1",
      )
      .get(normalizedName) as FoodRow | undefined;

    return row === undefined ? null : mapFood(row);
  }

  // Correspondência exata por nome de Food, insensível a caixa e a espaços
  // (Req 4.2, 4.4). Considera apenas alimentos ativos.
  async findFoodByNameExact(normalizedName: string): Promise<Food | null> {
    const row = this.db
      .prepare(
        `SELECT ${FOOD_COLUMNS} FROM food f ` +
          "WHERE lower(trim(f.name)) = ? AND f.active = 1 " +
          "ORDER BY f.name, f.id LIMIT 1",
      )
      .get(normalizedName) as FoodRow | undefined;

    return row === undefined ? null : mapFood(row);
  }

  // Conjunto de candidatos conhecidos para o nome informado (Req 4.5): alimentos
  // ativos cujo nome OU algum alias corresponda exatamente (case/trim) ao termo.
  // Distintos e com ordenação determinística por nome (Req 4.2).
  async findFoodCandidates(normalizedName: string): Promise<Food[]> {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT ${FOOD_COLUMNS} FROM food f ` +
          "LEFT JOIN food_alias a ON a.food_id = f.id " +
          "WHERE f.active = 1 " +
          "  AND (lower(trim(f.name)) = ? OR lower(trim(a.alias)) = ?) " +
          "ORDER BY f.name, f.id",
      )
      .all(normalizedName, normalizedName) as FoodRow[];

    return rows.map(mapFood);
  }

  // Medidas ativas de um alimento (Req 12.2). Cada par (alimento + medida) é um
  // registro próprio, com seu próprio carboidrato — os valores nutricionais vêm
  // exclusivamente daqui (Req 4.9). Ordenação determinística por medida.
  async findMeasuresByFoodId(foodId: string): Promise<FoodMeasure[]> {
    const rows = this.db
      .prepare(
        "SELECT id, food_id, serving_unit, serving_quantity, carbohydrates, active " +
          "FROM food_measure " +
          "WHERE food_id = ? AND active = 1 " +
          "ORDER BY serving_unit, id",
      )
      .all(foodId) as FoodMeasureRow[];

    return rows.map(mapFoodMeasure);
  }

  async listActiveFoodEntries(): Promise<FoodEntry[]> {
    if (this.activeFoodEntriesCache !== null) return this.activeFoodEntriesCache;
    const foods = this.db.prepare("SELECT id, name, active FROM food WHERE active = 1 ORDER BY id").all() as FoodRow[];
    const aliases = this.db.prepare("SELECT food_id, alias FROM food_alias ORDER BY food_id, id").all() as Array<{ food_id: string; alias: string }>;
    const measures = this.db.prepare("SELECT id, food_id, serving_unit, serving_quantity, carbohydrates, active FROM food_measure WHERE active = 1 ORDER BY food_id, id").all() as FoodMeasureRow[];
    const aliasesByFood = new Map<string, string[]>();
    for (const row of aliases) (aliasesByFood.get(row.food_id) ?? (aliasesByFood.set(row.food_id, []), aliasesByFood.get(row.food_id)!)).push(row.alias);
    const measuresByFood = new Map<string, FoodMeasure[]>();
    for (const row of measures) (measuresByFood.get(row.food_id) ?? (measuresByFood.set(row.food_id, []), measuresByFood.get(row.food_id)!)).push(mapFoodMeasure(row));
    this.activeFoodEntriesCache = foods.map((row) => ({ food: mapFood(row), aliases: aliasesByFood.get(row.id) ?? [], measures: measuresByFood.get(row.id) ?? [] }));
    return this.activeFoodEntriesCache;
  }

  async listFoodMemories(): Promise<FoodMemory[]> {
    const patient = await this.getPatient();
    const rows = this.db
      .prepare(
        "SELECT id, patient_id, phrase, normalized_phrase, food_id, measure_id, updated_at " +
          "FROM food_memory WHERE patient_id = ? ORDER BY normalized_phrase, id",
      )
      .all(patient.id) as FoodMemoryRow[];
    return rows.map(mapFoodMemory);
  }

  async findFoodMemory(normalizedPhrase: string): Promise<FoodMemory | null> {
    const patient = await this.getPatient();
    const row = this.db
      .prepare(
        "SELECT id, patient_id, phrase, normalized_phrase, food_id, measure_id, updated_at " +
          "FROM food_memory WHERE patient_id = ? AND normalized_phrase = ? LIMIT 1",
      )
      .get(patient.id, normalizedPhrase) as FoodMemoryRow | undefined;
    return row === undefined ? null : mapFoodMemory(row);
  }

  async upsertFoodMemory(input: {
    phrase: string;
    normalizedPhrase: string;
    foodId: string;
    measureId: string;
  }): Promise<FoodMemory> {
    const patient = await this.getPatient();
    const validMeasure = this.db
      .prepare(
        "SELECT 1 FROM food_measure WHERE id = ? AND food_id = ? AND active = 1 " +
          "AND EXISTS (SELECT 1 FROM food WHERE id = ? AND active = 1) LIMIT 1",
      )
      .get(input.measureId, input.foodId, input.foodId);
    if (validMeasure === undefined) {
      throw new Error("Memória alimentar inválida: alimento ou medida não encontrado.");
    }

    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO food_memory " +
          "(id, patient_id, phrase, normalized_phrase, food_id, measure_id) " +
          "VALUES (?, ?, ?, ?, ?, ?) " +
          "ON CONFLICT(patient_id, normalized_phrase) DO UPDATE SET " +
          "phrase = excluded.phrase, food_id = excluded.food_id, " +
          "measure_id = excluded.measure_id, updated_at = CURRENT_TIMESTAMP",
      )
      .run(id, patient.id, input.phrase, input.normalizedPhrase, input.foodId, input.measureId);

    const saved = await this.findFoodMemory(input.normalizedPhrase);
    if (saved === null) throw new Error("Não foi possível salvar a memória alimentar.");
    return saved;
  }

  // --- Escritas (implementadas na task 12.x) ---
  //
  // Os métodos abaixo fazem parte do contrato `Repository` mas são preenchidos
  // na task 12.x (conversa/idempotência e persistência atômica de refeição +
  // cálculo, atualização de parâmetros e dose aplicada). Ficam como stubs
  // explícitos para manter o arquivo compilando e sinalizar claramente o que
  // ainda não está implementado.

  // Atualiza um parâmetro global de cálculo em insulin_settings (Req 8.8, 8.9).
  // Valida que o valor é numérico finito em (0, 999]; caso contrário lança erro
  // e o valor anterior é preservado (nenhum UPDATE é emitido) (Req 8.9).
  // A coluna alvo é resolvida por um mapa whitelist — NUNCA por interpolação de
  // string de entrada arbitrária — mesmo o tipo sendo uma união fechada.
  async updateInsulinSetting(
    field: "target_glucose" | "correction_factor",
    value: number,
  ): Promise<void> {
    assertParameterInRange(value);

    // Whitelist explícita de colunas atualizáveis: a chave é validada contra
    // este mapa antes de compor o SQL, evitando qualquer injeção via `field`.
    const columnByField: Record<
      "target_glucose" | "correction_factor",
      string
    > = {
      target_glucose: "target_glucose",
      correction_factor: "correction_factor",
    };
    const column = columnByField[field];
    if (column === undefined) {
      throw new Error(`Campo de parâmetro inválido: ${String(field)}`);
    }

    const patient = await this.getPatient();
    this.db
      .prepare(
        `UPDATE insulin_settings SET ${column} = ?, updated_at = CURRENT_TIMESTAMP ` +
          "WHERE patient_id = ?",
      )
      .run(value, patient.id);
  }

  // Atualiza a relação insulina/carboidrato de um tipo de refeição em
  // insulin_meal_settings (Req 8.8, 8.9). Valida (0, 999]; caso inválido lança
  // erro e preserva o valor anterior (Req 8.9).
  async updateCarbohydrateRatio(
    mealType: MealType,
    value: number,
  ): Promise<void> {
    assertParameterInRange(value);

    const patient = await this.getPatient();
    this.db
      .prepare(
        "UPDATE insulin_meal_settings " +
          "SET carbohydrate_ratio = ?, updated_at = CURRENT_TIMESTAMP " +
          "WHERE patient_id = ? AND meal_type = ?",
      )
      .run(value, patient.id, mealType);
  }

  // Idempotência/deduplicação (Req 13.1, 13.2). A dedupe baseia-se na unicidade
  // de `external_message_id` das refeições persistidas: se já existe uma refeição
  // com esse identificador, a mensagem já foi processada e nenhum novo registro
  // de refeição deve ser criado (Req 13.2).
  async isMessageProcessed(externalMessageId: string): Promise<boolean> {
    const row = this.db
      .prepare(
        "SELECT 1 FROM meal WHERE external_message_id = ? LIMIT 1",
      )
      .get(externalMessageId);

    return row !== undefined;
  }

  // Cria uma nova conversa com status ACTIVE (Req 16.1), associada à paciente
  // única cadastrada (Req 14.1, 14.3). O id é gerado na aplicação (UUID).
  async createConversation(): Promise<Conversation> {
    const patient = await this.getPatient();
    const id = randomUUID();
    const status: ConversationStatus = "ACTIVE";

    this.db
      .prepare(
        "INSERT INTO conversation (id, patient_id, status) VALUES (?, ?, ?)",
      )
      .run(id, patient.id, status);

    return { id, patientId: patient.id, status };
  }

  // Atualiza o status da conversa (Req 16.2, 16.3, 16.4) e o carimbo de
  // atualização, refletindo o estado canônico da máquina de estados.
  async updateConversationStatus(
    id: string,
    status: ConversationStatus,
  ): Promise<void> {
    this.db
      .prepare(
        "UPDATE conversation SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      )
      .run(status, id);
  }

  // Registra uma mensagem da conversa (Req 16.5, 16.6). Mapeia os campos
  // camelCase do contrato para as colunas snake_case da tabela.
  async appendConversationMessage(
    msg: NewConversationMessage,
  ): Promise<void> {
    this.db
      .prepare(
        "INSERT INTO conversation_message " +
          "(id, conversation_id, direction, message_type, content, external_message_id) " +
          "VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(
        randomUUID(),
        msg.conversationId,
        msg.direction,
        msg.messageType,
        msg.content,
        msg.externalMessageId,
      );
  }

  // Persiste refeição + cálculo + itens de forma ATÔMICA (Req 9.3, 9.4).
  // Usa uma transação nativa do better-sqlite3 (`db.transaction`): ou grava tudo
  // (meal, insulin_calculation e todos os meal_item), ou nada — qualquer erro
  // durante os inserts dispara ROLLBACK, sem deixar linhas parciais.
  //
  // A unicidade de meal.external_message_id garante idempotência no nível do
  // banco (Req 13.1): um insert duplicado lança, o que é aceitável (o
  // orquestrador consulta isMessageProcessed antes).
  async saveMealWithCalculation(
    input: SaveMealInput,
  ): Promise<{ mealId: string }> {
    const mealId = randomUUID();

    const insertMeal = this.db.prepare(
      "INSERT INTO meal " +
        "(id, patient_id, conversation_id, external_message_id, meal_type, " +
        " glucose, total_carbohydrates, applied_dose) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertCalculation = this.db.prepare(
      "INSERT INTO insulin_calculation " +
        "(id, meal_id, glucose, total_carbohydrates, correction_dose, " +
        " carbohydrate_dose, total_dose, rounded_dose, snapshot_target_glucose, " +
        " snapshot_correction_factor, snapshot_carbohydrate_ratio, formula_version) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertItem = this.db.prepare(
      "INSERT INTO meal_item " +
        "(id, meal_id, food_id, food_name_snapshot, quantity, unit, carbohydrates) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    const calc = input.calculation;

    // A transação envolve todos os inserts; better-sqlite3 faz ROLLBACK
    // automaticamente se o callback lançar (ex.: violação de UNIQUE/FK).
    const persist = this.db.transaction(() => {
      insertMeal.run(
        mealId,
        input.patientId,
        input.conversationId,
        input.externalMessageId,
        input.mealType,
        input.glucose,
        input.totalCarbohydrates,
        null, // applied_dose informada separadamente (Req 10)
      );

      insertCalculation.run(
        randomUUID(),
        mealId,
        input.glucose,
        input.totalCarbohydrates,
        calc.correctionDose,
        calc.carbohydrateDose,
        calc.totalDose,
        calc.roundedDose,
        calc.snapshotTargetGlucose,
        calc.snapshotCorrectionFactor,
        calc.snapshotCarbohydrateRatio,
        calc.formulaVersion,
      );

      for (const item of input.items) {
        insertItem.run(
          randomUUID(),
          mealId,
          item.foodId,
          item.foodNameSnapshot,
          item.quantity,
          item.unit,
          item.carbohydrates,
        );
      }
    });

    persist();

    return { mealId };
  }

  // Registra a dose efetivamente aplicada pela paciente (Req 10.1, 10.2). É
  // independente da dose calculada: apenas atualiza meal.applied_dose, sem tocar
  // nos valores do insulin_calculation.
  async saveAppliedDose(mealId: string, appliedDose: number): Promise<void> {
    this.db
      .prepare("UPDATE meal SET applied_dose = ? WHERE id = ?")
      .run(appliedDose, mealId);
  }
}

// Valida um parâmetro de cálculo: número finito em (0, 999] (Req 8.8, 8.9).
// Lança Error quando inválido, de modo que nenhum UPDATE seja emitido e o valor
// anterior permaneça preservado (Req 8.9).
function assertParameterInRange(value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(
      `Valor de parâmetro inválido: esperado número finito, recebido ${String(value)}`,
    );
  }
  if (value <= 0 || value > 999) {
    throw new Error(
      `Valor de parâmetro fora do intervalo permitido (0, 999]: ${value}`,
    );
  }
}
