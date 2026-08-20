// src/adapters/persistence/in-memory-repository.ts
//
// InMemoryRepository — fixture de teste opcional (Req 18.6).
//
// O padrão da Fase 1 é o `SqliteRepository` (transações reais, schema idêntico
// ao Postgres). Este repositório em memória existe apenas como FIXTURE de teste
// para exercitar o domínio 100% offline, sem subir SQLite (design.md:
// "um `InMemoryRepository` fica disponível como fixture de teste opcional").
//
// Implementa integralmente a porta `Repository`, replicando as semânticas
// relevantes do schema relacional (Data Models em design.md):
//  - paciente única com parâmetros default (Req 8.3, 8.4, 14).
//  - leitura exclusiva dos parâmetros de cálculo (Req 8.6).
//  - resolução de alimentos por alias/nome exatos e candidatos (Req 4).
//  - idempotência por `external_message_id` único da refeição (Req 13.1, 13.2).
//  - persistência "atômica" de refeição + cálculo + itens (Req 9.3, 9.4).
//  - validação de faixa (0, 999] dos parâmetros de cálculo (Req 8.8, 8.9).
//
// Este arquivo também expõe `InMemoryChannel`, uma implementação de teste da
// porta `ChannelAdapter`, usada pela propriedade de "equivalência entre canais"
// (Property 28 / Req 2.4).

import { randomUUID } from "node:crypto";
import type { ConversationStatus, MealType } from "../../domain/types.js";
import type {
  ChannelAdapter,
  InboundMessage,
} from "../../domain/ports/channel-adapter.js";
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

// --- Registros internos (projeções do schema; ver Data Models em design.md) ---

/** Refeição persistida (tabela `meal`), com `appliedDose` mutável (Req 10). */
export interface StoredMeal {
  id: string;
  conversationId: string;
  patientId: string;
  externalMessageId: string;
  mealType: MealType;
  glucose: number;
  totalCarbohydrates: number;
  appliedDose: number | null;
}

/** Item de refeição persistido (tabela `meal_item`), CHO congelado (Req 9.8). */
export interface StoredMealItem {
  id: string;
  mealId: string;
  foodId: string;
  foodNameSnapshot: string;
  quantity: number;
  unit: string | null;
  carbohydrates: number;
}

/** Cálculo persistido (tabela `insulin_calculation`) com Parameter_Snapshot. */
export interface StoredCalculation {
  id: string;
  mealId: string;
  correctionDose: number;
  carbohydrateDose: number;
  totalDose: number;
  roundedDose: number;
  snapshotTargetGlucose: number;
  snapshotCorrectionFactor: number;
  snapshotCarbohydrateRatio: number;
  formulaVersion: string;
}

/** Mensagem de conversa persistida (tabela `conversation_message`). */
export interface StoredConversationMessage extends NewConversationMessage {
  id: string;
}

/**
 * Normaliza um nome para correspondência exata: insensível a caixa e a espaços
 * nas extremidades (Req 4.2). Espelha `normalizeName` do FoodResolver e o
 * índice `lower(btrim(...))` do schema.
 */
function normalizeName(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Valida um valor de parâmetro de cálculo contra a faixa `(0, 999]`
 * (Req 8.8, 8.9). Rejeita não numéricos, `NaN`, `Infinity`, `<= 0` e `> 999`.
 */
function isValidParameter(value: number): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= 999
  );
}

const DEFAULT_MEAL_RATIOS: ReadonlyArray<readonly [MealType, number]> = [
  ["BREAKFAST", 8],
  ["LUNCH", 6],
  ["SNACK", 8],
  ["DINNER", 10],
];

export class InMemoryRepository implements Repository {
  private readonly patient: Patient;

  // insulin_settings (Req 8.1) — parâmetros globais de correção.
  private targetGlucose = 120; // default (Req 8.3)
  private correctionFactor = 40; // default (Req 8.3)

  // insulin_meal_settings (Req 8.2) — razão CHO por tipo de refeição.
  private readonly mealRatios = new Map<MealType, number>();

  // food + food_alias (Req 12). Índices normalizados para lookup exato (Req 4.2).
  // Identidade do alimento (sem dados nutricionais — Req 4.9, 12.2).
  private readonly foods = new Map<string, Food>();
  private readonly foodByName = new Map<string, string>(); // normalizedName -> foodId
  private readonly foodByAlias = new Map<string, string>(); // normalizedAlias -> foodId

  // food_measure (Req 12.2): cada alimento tem uma ou mais medidas, cada uma
  // com seu próprio carboidrato. Valores nutricionais vêm daqui (Req 4.9).
  private readonly measuresByFoodId = new Map<string, FoodMeasure[]>();
  private readonly foodMemories = new Map<string, FoodMemory>();

  // Idempotência (Req 13): ids externos já persistidos em refeições.
  private readonly processedExternalIds = new Set<string>();
  private readonly mealIdByExternalId = new Map<string, string>();

  // Conversas e mensagens (Req 16).
  private readonly conversations = new Map<string, Conversation>();
  private readonly conversationMessages: StoredConversationMessage[] = [];

  // Refeições, itens e cálculos (Req 9, 10).
  private readonly meals: StoredMeal[] = [];
  private readonly mealItems: StoredMealItem[] = [];
  private readonly calculations: StoredCalculation[] = [];

  constructor() {
    // Paciente única semeada no bootstrap (Req 14.1, 14.5).
    this.patient = { id: randomUUID(), name: "Paciente", whatsappPhone: null };
    // Razões default por refeição (Req 8.4).
    for (const [mealType, ratio] of DEFAULT_MEAL_RATIOS) {
      this.mealRatios.set(mealType, ratio);
    }
  }

  // --- Paciente (Req 14) ---

  async getPatient(): Promise<Patient> {
    return { ...this.patient };
  }

  // --- Parâmetros de cálculo — leitura exclusiva daqui (Req 8.6) ---

  async getInsulinParameters(
    mealType: MealType,
  ): Promise<InsulinParameters | null> {
    const carbohydrateRatio = this.mealRatios.get(mealType);
    if (carbohydrateRatio === undefined) {
      // Sem razão para a refeição → parâmetros indisponíveis (Req 8.5).
      return null;
    }
    return {
      targetGlucose: this.targetGlucose,
      correctionFactor: this.correctionFactor,
      carbohydrateRatio,
    };
  }

  async updateInsulinSetting(
    field: "target_glucose" | "correction_factor",
    value: number,
  ): Promise<void> {
    // Validação de faixa; rejeição preserva o valor anterior (Req 8.8, 8.9).
    if (!isValidParameter(value)) {
      throw new Error(
        `Valor inválido para ${field}: deve ser numérico e estar em (0, 999].`,
      );
    }
    if (field === "target_glucose") {
      this.targetGlucose = value;
    } else {
      this.correctionFactor = value;
    }
  }

  async updateCarbohydrateRatio(
    mealType: MealType,
    value: number,
  ): Promise<void> {
    if (!isValidParameter(value)) {
      throw new Error(
        `Razão de carboidrato inválida para ${mealType}: deve ser numérica e estar em (0, 999].`,
      );
    }
    this.mealRatios.set(mealType, value);
  }

  // --- Alimentos (Req 4, 12) ---

  async findFoodByAliasExact(normalizedName: string): Promise<Food | null> {
    const foodId = this.foodByAlias.get(normalizeName(normalizedName));
    return this.activeFoodOrNull(foodId);
  }

  async findFoodByNameExact(normalizedName: string): Promise<Food | null> {
    const foodId = this.foodByName.get(normalizeName(normalizedName));
    return this.activeFoodOrNull(foodId);
  }

  async findFoodCandidates(normalizedName: string): Promise<Food[]> {
    const key = normalizeName(normalizedName);
    if (key.length === 0) return [];
    // Candidatos conhecidos (Req 4.5): alimentos ativos cujo nome ou algum alias
    // contenha (substring) a chave normalizada. Heurística determinística e
    // suficiente para a fixture; o SqliteRepository é a fonte de verdade.
    const matched = new Map<string, Food>();
    for (const [name, foodId] of this.foodByName) {
      if (name.includes(key)) {
        const food = this.foods.get(foodId);
        if (food?.active) matched.set(food.id, food);
      }
    }
    for (const [alias, foodId] of this.foodByAlias) {
      if (alias.includes(key)) {
        const food = this.foods.get(foodId);
        if (food?.active) matched.set(food.id, food);
      }
    }
    // Ordem determinística por nome (Req 4.5); cópias defensivas.
    return [...matched.values()]
      .map((food) => ({ ...food }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findMeasuresByFoodId(foodId: string): Promise<FoodMeasure[]> {
    const measures = this.measuresByFoodId.get(foodId) ?? [];
    // Medidas ativas (Req 12.3), cópias defensivas, ordem determinística por
    // unidade de medida (Req 12.2).
    return measures
      .filter((measure) => measure.active)
      .map((measure) => ({ ...measure }))
      .sort((a, b) => a.servingUnit.localeCompare(b.servingUnit));
  }

  async listActiveFoodEntries(): Promise<FoodEntry[]> {
    return [...this.foods.values()]
      .filter((food) => food.active)
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((food) => ({
        food: { ...food },
        aliases: [...this.foodByAlias.entries()].filter(([, id]) => id === food.id).map(([alias]) => alias).sort(),
        measures: (this.measuresByFoodId.get(food.id) ?? []).filter((measure) => measure.active).map((measure) => ({ ...measure })).sort((a, b) => a.id.localeCompare(b.id)),
      }));
  }

  async listFoodMemories(): Promise<FoodMemory[]> {
    return [...this.foodMemories.values()]
      .map((memory) => ({ ...memory }))
      .sort((a, b) => a.normalizedPhrase.localeCompare(b.normalizedPhrase));
  }

  async findFoodMemory(normalizedPhrase: string): Promise<FoodMemory | null> {
    const memory = this.foodMemories.get(normalizedPhrase);
    return memory === undefined ? null : { ...memory };
  }

  async upsertFoodMemory(input: {
    phrase: string;
    normalizedPhrase: string;
    foodId: string;
    measureId: string;
  }): Promise<FoodMemory> {
    const food = this.foods.get(input.foodId);
    const measure = (this.measuresByFoodId.get(input.foodId) ?? []).find(
      (candidate) => candidate.id === input.measureId && candidate.active,
    );
    if (food === undefined || !food.active || measure === undefined) {
      throw new Error("Memória alimentar inválida: alimento ou medida não encontrado.");
    }
    const previous = this.foodMemories.get(input.normalizedPhrase);
    const memory: FoodMemory = {
      id: previous?.id ?? randomUUID(),
      patientId: this.patient.id,
      phrase: input.phrase,
      normalizedPhrase: input.normalizedPhrase,
      foodId: input.foodId,
      measureId: input.measureId,
      updatedAt: new Date().toISOString(),
    };
    this.foodMemories.set(input.normalizedPhrase, memory);
    return { ...memory };
  }

  private activeFoodOrNull(foodId: string | undefined): Food | null {
    if (foodId === undefined) return null;
    const food = this.foods.get(foodId);
    // Inativos não são resolvíveis (Req 12.3).
    return food && food.active ? { ...food } : null;
  }

  // --- Idempotência (Req 13) ---

  async isMessageProcessed(externalMessageId: string): Promise<boolean> {
    return this.processedExternalIds.has(externalMessageId);
  }

  // --- Conversa (Req 16) ---

  async createConversation(): Promise<Conversation> {
    const conversation: Conversation = {
      id: randomUUID(),
      patientId: this.patient.id,
      status: "ACTIVE",
    };
    this.conversations.set(conversation.id, conversation);
    return { ...conversation };
  }

  async updateConversationStatus(
    id: string,
    status: ConversationStatus,
  ): Promise<void> {
    const conversation = this.conversations.get(id);
    if (!conversation) {
      throw new Error(`Conversa não encontrada: ${id}`);
    }
    conversation.status = status;
  }

  async appendConversationMessage(msg: NewConversationMessage): Promise<void> {
    if (!this.conversations.has(msg.conversationId)) {
      throw new Error(`Conversa não encontrada: ${msg.conversationId}`);
    }
    this.conversationMessages.push({ id: randomUUID(), ...msg });
  }

  // --- Persistência atômica de refeição + cálculo + itens (Req 9.3, 9.4) ---

  async saveMealWithCalculation(
    input: SaveMealInput,
  ): Promise<{ mealId: string }> {
    // Idempotência (Req 13.1, 13.2): external_message_id é único. Se já existe,
    // não cria nova refeição — retorna a existente.
    const existingId = this.mealIdByExternalId.get(input.externalMessageId);
    if (existingId !== undefined) {
      return { mealId: existingId };
    }

    const mealId = randomUUID();
    const meal: StoredMeal = {
      id: mealId,
      conversationId: input.conversationId,
      patientId: input.patientId,
      externalMessageId: input.externalMessageId,
      mealType: input.mealType,
      glucose: input.glucose,
      totalCarbohydrates: input.totalCarbohydrates,
      appliedDose: null,
    };

    // "Transação": só publica os registros após montar tudo (Req 9.3, 9.4).
    const items: StoredMealItem[] = input.items.map((item) => ({
      id: randomUUID(),
      mealId,
      foodId: item.foodId,
      foodNameSnapshot: item.foodNameSnapshot,
      quantity: item.quantity,
      unit: item.unit,
      carbohydrates: item.carbohydrates,
    }));

    const calculation: StoredCalculation = {
      id: randomUUID(),
      mealId,
      correctionDose: input.calculation.correctionDose,
      carbohydrateDose: input.calculation.carbohydrateDose,
      totalDose: input.calculation.totalDose,
      roundedDose: input.calculation.roundedDose,
      snapshotTargetGlucose: input.calculation.snapshotTargetGlucose,
      snapshotCorrectionFactor: input.calculation.snapshotCorrectionFactor,
      snapshotCarbohydrateRatio: input.calculation.snapshotCarbohydrateRatio,
      formulaVersion: input.calculation.formulaVersion,
    };

    this.meals.push(meal);
    this.mealItems.push(...items);
    this.calculations.push(calculation);
    this.mealIdByExternalId.set(input.externalMessageId, mealId);
    this.processedExternalIds.add(input.externalMessageId);

    return { mealId };
  }

  async saveAppliedDose(mealId: string, appliedDose: number): Promise<void> {
    const meal = this.meals.find((m) => m.id === mealId);
    if (!meal) {
      throw new Error(`Refeição não encontrada: ${mealId}`);
    }
    // Dose aplicada é independente da calculada (Req 10).
    meal.appliedDose = appliedDose;
  }

  // --- Semeadura e acessores para testes (fixture) ---

  /**
   * addFood — semeia a IDENTIDADE de um alimento e seus aliases opcionais
   * (Req 12). A identidade não carrega dados nutricionais (Req 4.9, 12.2);
   * medidas são adicionadas por `addMeasure`/`addFoodWithMeasure`.
   * Indexa por nome e alias normalizados (lower+trim) para lookup exato (Req 4.2).
   * `active` default `true`. Retorna o `Food` armazenado (id gerado quando ausente).
   */
  addFood(
    input: { id?: string; name: string; active?: boolean },
    aliases: string[] = [],
  ): Food {
    const stored: Food = {
      id: input.id ?? randomUUID(),
      name: input.name,
      active: input.active ?? true,
    };
    this.foods.set(stored.id, stored);
    this.foodByName.set(normalizeName(stored.name), stored.id);
    for (const alias of aliases) {
      this.foodByAlias.set(normalizeName(alias), stored.id);
    }
    return { ...stored };
  }

  /**
   * addMeasure — adiciona uma medida (food_measure) a um alimento existente,
   * com seu próprio carboidrato (Req 12.2). `active` default `true`.
   * Retorna a `FoodMeasure` armazenada (id gerado quando ausente).
   */
  addMeasure(input: {
    id?: string;
    foodId: string;
    servingUnit: string;
    servingQuantity: number;
    carbohydrates: number;
    active?: boolean;
  }): FoodMeasure {
    const stored: FoodMeasure = {
      id: input.id ?? randomUUID(),
      foodId: input.foodId,
      servingUnit: input.servingUnit,
      servingQuantity: input.servingQuantity,
      carbohydrates: input.carbohydrates,
      active: input.active ?? true,
    };
    const existing = this.measuresByFoodId.get(stored.foodId);
    if (existing) {
      existing.push(stored);
    } else {
      this.measuresByFoodId.set(stored.foodId, [stored]);
    }
    return { ...stored };
  }

  /**
   * addFoodWithMeasure — conveniência que cria a identidade do alimento + uma
   * única medida em uma só chamada, facilitando o port dos testes existentes.
   * `active` (compartilhado por identidade e medida) default `true`.
   */
  addFoodWithMeasure(
    input: {
      name: string;
      servingUnit: string;
      servingQuantity: number;
      carbohydrates: number;
      active?: boolean;
    },
    aliases: string[] = [],
  ): { food: Food; measure: FoodMeasure } {
    const active = input.active ?? true;
    const food = this.addFood({ name: input.name, active }, aliases);
    const measure = this.addMeasure({
      foodId: food.id,
      servingUnit: input.servingUnit,
      servingQuantity: input.servingQuantity,
      carbohydrates: input.carbohydrates,
      active,
    });
    return { food, measure };
  }

  /** Acessor de teste: refeições persistidas. */
  getMeals(): StoredMeal[] {
    return this.meals.map((m) => ({ ...m }));
  }

  /** Acessor de teste: itens de uma refeição. */
  getMealItems(mealId: string): StoredMealItem[] {
    return this.mealItems
      .filter((i) => i.mealId === mealId)
      .map((i) => ({ ...i }));
  }

  /** Acessor de teste: cálculo de uma refeição. */
  getCalculation(mealId: string): StoredCalculation | null {
    const found = this.calculations.find((c) => c.mealId === mealId);
    return found ? { ...found } : null;
  }

  /** Acessor de teste: mensagens de uma conversa, em ordem de inserção. */
  getConversationMessages(conversationId: string): StoredConversationMessage[] {
    return this.conversationMessages
      .filter((m) => m.conversationId === conversationId)
      .map((m) => ({ ...m }));
  }

  /** Acessor de teste: conversa por id. */
  getConversation(id: string): Conversation | null {
    const found = this.conversations.get(id);
    return found ? { ...found } : null;
  }
}

// --- Canal de teste (ChannelAdapter) ---

type DomainHandler = (msg: InboundMessage) => Promise<void>;

/**
 * InMemoryChannel — implementação de teste da porta `ChannelAdapter` (Req 1.6,
 * 2.2). Captura as respostas de saída em um array e permite injetar mensagens
 * inbound chamando o handler de domínio registrado. `start`/`stop` são no-ops.
 *
 * Suporta a propriedade "equivalência entre canais" (Property 28 / Req 2.4):
 * dois canais distintos que cumprem o contrato devem produzir a mesma resposta
 * de domínio para o mesmo texto.
 */
export class InMemoryChannel implements ChannelAdapter {
  private handler: DomainHandler | undefined;
  private readonly sent: string[] = [];
  private counter = 0;

  onMessage(handler: DomainHandler): void {
    this.handler = handler;
  }

  async send(text: string): Promise<void> {
    this.sent.push(text);
  }

  async start(): Promise<void> {
    // no-op — canal em memória não possui loop de leitura.
  }

  async stop(): Promise<void> {
    // no-op.
  }

  /** Acessor de teste: respostas textuais enviadas ao usuário (Req 1.5). */
  getSent(): string[] {
    return [...this.sent];
  }

  /**
   * receive — injeta uma mensagem inbound encaminhando-a ao handler registrado
   * (Req 1.4). Quando `externalMessageId` é omitido, gera um id determinístico
   * por sessão para distinguir submissões (Req 13.3).
   */
  async receive(text: string, externalMessageId?: string): Promise<void> {
    if (!this.handler) {
      throw new Error("Nenhum handler registrado via onMessage.");
    }
    const id = externalMessageId ?? `memory:${this.counter}:${text}`;
    this.counter += 1;
    await this.handler({ externalMessageId: id, text });
  }
}
