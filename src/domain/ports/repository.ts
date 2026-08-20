// src/domain/ports/repository.ts
//
// Porta: Repository (persistência) (Req 8, 9, 10, 13, 16).
//
// Um único repositório coeso (sem repositórios genéricos nem factories —
// Req 20.6). A Fase 1 usa `SqliteRepository`; a fase futura, `SupabaseRepository`.
// Ambos implementam esta mesma interface.
//
// As entidades abaixo derivam do schema relacional (Data Models / migrations
// em design.md), mantido único entre SQLite (Fase 1) e Postgres/Supabase.

import type {
  ConversationStatus,
  MealType,
} from "../types.js";

// --- Entidades de domínio (projeções do schema relacional) ---

// Paciente única (Req 14). `whatsappPhone` só é usado na fase futura (Req 14.4).
export interface Patient {
  id: string;
  name: string;
  whatsappPhone: string | null;
}

// Alimento da base local (identidade) (Req 12). Valores nutricionais vêm das
// medidas (food_measure), não da identidade (Req 4.9, 12.2).
export interface Food {
  id: string;
  name: string;
  active: boolean; // (Req 12.3)
}

// Medida de um alimento — cada par (alimento + medida) é um registro próprio,
// com seu próprio carboidrato (Req 12.2). Valores nutricionais vêm daqui (Req 4.9).
export interface FoodMeasure {
  id: string;
  foodId: string;
  servingUnit: string; // medida usual (Req 12.2)
  servingQuantity: number; // em g/ml (Req 12.2)
  carbohydrates: number; // em g por medida (Req 12.2)
  active: boolean; // (Req 12.3)
}

// Conveniência: identidade do alimento resolvido junto da medida escolhida.
export interface ResolvedFoodMeasure {
  food: Food;
  measure: FoodMeasure;
}

/** Active food identity together with its aliases and active measures. */
export interface FoodEntry {
  food: Food;
  aliases: string[];
  measures: FoodMeasure[];
}

/** Preferência aprendida da paciente para reconhecer um alimento e sua medida. */
export interface FoodMemory {
  id: string;
  patientId: string;
  phrase: string;
  normalizedPhrase: string;
  foodId: string;
  measureId: string;
  updatedAt: string;
}

// Conversa (Req 16). O status reflete o estado canônico da máquina de estados.
export interface Conversation {
  id: string;
  patientId: string;
  status: ConversationStatus;
}

// Mensagem a ser registrada em conversation_message (Req 16.5, 16.6).
export interface NewConversationMessage {
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  messageType: "TEXT" | "AUDIO"; // AUDIO suportado sem alterar fluxo de texto (Req 16.6)
  content: string;
  externalMessageId: string | null;
}

// Parâmetros de cálculo lidos exclusivamente do repositório (Req 8.6).
export interface InsulinParameters {
  targetGlucose: number; // insulin_settings
  correctionFactor: number; // insulin_settings
  carbohydrateRatio: number; // insulin_meal_settings pelo MealType
}

// --- Persistência atômica de refeição + cálculo + itens (Req 9) ---

// Item de refeição a persistir em meal_item, com snapshot próprio (Req 9.8, 9.9).
export interface SaveMealItemInput {
  foodId: string;
  foodNameSnapshot: string; // nome no momento do registro (Req 9.8)
  quantity: number;
  unit: string | null;
  carbohydrates: number; // CHO do item, calculado pelo código (Req 5.1, 9.8)
}

// Cálculo de insulina a persistir em insulin_calculation, com Parameter_Snapshot
// e Formula_Version (Req 9.5, 9.6, 9.7).
export interface SaveMealCalculationInput {
  correctionDose: number;
  carbohydrateDose: number;
  totalDose: number; // bruto (Req 7.5, 9.7)
  roundedDose: number; // inteiro (Req 7.4, 9.7)
  // Parameter_Snapshot — parâmetros usados no cálculo (Req 9.5)
  snapshotTargetGlucose: number;
  snapshotCorrectionFactor: number;
  snapshotCarbohydrateRatio: number;
  formulaVersion: string; // "1.0" (Req 9.6)
}

// Entrada para persistir meal + insulin_calculation + meal_item[] atomicamente
// (Req 9.3, 9.4). Carrega tudo necessário para a transação em um único lugar.
export interface SaveMealInput {
  conversationId: string;
  patientId: string;
  externalMessageId: string; // unicidade/idempotência (Req 13)
  mealType: MealType;
  glucose: number;
  totalCarbohydrates: number; // total, 2 casas (Req 5.2, 9.7)
  items: SaveMealItemInput[];
  calculation: SaveMealCalculationInput;
}

// --- Contrato do repositório ---

export interface Repository {
  // Paciente única (Req 14)
  getPatient(): Promise<Patient>;

  // Parâmetros de cálculo — leitura exclusiva daqui (Req 8.6)
  getInsulinParameters(mealType: MealType): Promise<InsulinParameters | null>;
  updateInsulinSetting(
    field: "target_glucose" | "correction_factor",
    value: number,
  ): Promise<void>;
  updateCarbohydrateRatio(mealType: MealType, value: number): Promise<void>;

  // Alimentos (usado pelo FoodResolver)
  // Resolução em dois passos: primeiro a identidade do alimento, depois a medida.
  findFoodByAliasExact(normalizedName: string): Promise<Food | null>;
  findFoodByNameExact(normalizedName: string): Promise<Food | null>;
  findFoodCandidates(normalizedName: string): Promise<Food[]>;
  // Medidas de um alimento (para escolher/validar a medida informada).
  findMeasuresByFoodId(foodId: string): Promise<FoodMeasure[]>;
  listActiveFoodEntries(): Promise<FoodEntry[]>;

  // Memória de vocabulário/preferências alimentares da paciente.
  listFoodMemories(): Promise<FoodMemory[]>;
  findFoodMemory(normalizedPhrase: string): Promise<FoodMemory | null>;
  upsertFoodMemory(input: {
    phrase: string;
    normalizedPhrase: string;
    foodId: string;
    measureId: string;
  }): Promise<FoodMemory>;

  // Idempotência (Req 13)
  isMessageProcessed(externalMessageId: string): Promise<boolean>;

  // Conversa (Req 16)
  createConversation(): Promise<Conversation>;
  updateConversationStatus(id: string, status: ConversationStatus): Promise<void>;
  appendConversationMessage(msg: NewConversationMessage): Promise<void>;

  // Persistência atômica de refeição + cálculo + itens (Req 9.3, 9.4)
  saveMealWithCalculation(input: SaveMealInput): Promise<{ mealId: string }>;

  // Dose aplicada, independente da calculada (Req 10)
  saveAppliedDose(mealId: string, appliedDose: number): Promise<void>;
}
