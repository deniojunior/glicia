// src/domain/conversation/orchestrator.ts
//
// ConversationOrchestrator — máquina de estados + fluxo da conversa
// (Req 6, 11, 16, 17, 19, além de 4.6/4.7/4.8, 8.6/8.7, 10.6, 13, 14).
//
// Princípio arquitetural central:
//   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
//
// Este componente é o único lugar do domínio que COORDENA o pipeline:
//   interpretar → sanitizar (descartar dose) → resolver alimentos → calcular
//   CHO → confirmar explicitamente → calcular insulina → persistir.
//
// Regras estruturais preservadas aqui:
//   - o cálculo de insulina (`calculateInsulin`) é chamado em UM ÚNICO lugar:
//     `calculateAndPersist` (Req 7.8, 17.1);
//   - nada é calculado/persistido sem confirmação afirmativa explícita
//     (Req 6.4, 6.5, 15/guarda 17.3);
//   - os valores nutricionais vêm exclusivamente do Food_Database via resolver
//     (Req 4.9, 4.10);
//   - o domínio consome/produz apenas texto, sem IO além das portas injetadas.

import type { ChannelAdapter, InboundMessage } from "../ports/channel-adapter.js";
import type { Interpreter } from "../ports/interpreter.js";
import type {
  Repository,
  ResolvedFoodMeasure,
  SaveMealItemInput,
} from "../ports/repository.js";
import type {
  ConversationStatus,
  InterpretedItem,
  MealType,
  GlucoseTrend,
  MissingInfo,
} from "../types.js";
import type { FoodResolver } from "../foods/food-resolver.js";
import type { ResolvedItem } from "../meals/calculate-meal-carbs.js";

import { normalizeName } from "../foods/food-resolver.js";
import { calculateMealCarbs, round2 } from "../meals/calculate-meal-carbs.js";
import {
  FORMULA_VERSION,
  InsulinCalculationError,
  calculateInsulin,
} from "../insulin/calculate-insulin.js";
import { sanitizeInterpretation } from "./sanitize-interpretation.js";

// Janela de confirmação (Req 6.6): 10 minutos.
const CONFIRMATION_TIMEOUT_MS = 10 * 60 * 1000;

// Rótulos em português para o tipo de refeição (Req 11.2).
const MEAL_LABELS: Record<MealType, string> = {
  BREAKFAST: "café da manhã",
  LUNCH: "almoço",
  SNACK: "lanche",
  DINNER: "jantar",
};
const GLUCOSE_TREND_LABELS: Record<GlucoseTrend, string> = {
  RISING_RAPIDLY: "↑↑ subindo rapidamente (> 2 mg/dL por minuto)",
  RISING: "↑ subindo (1–2 mg/dL por minuto)",
  CHANGING_SLOWLY: "→ modificando lentamente (< 1 mg/dL por minuto)",
  FALLING: "↓ caindo (1–2 mg/dL por minuto)",
  FALLING_RAPIDLY: "↓↓ caindo rapidamente (> 2 mg/dL por minuto)",
};

// Tokens que caracterizam uma confirmação afirmativa EXPLÍCITA (Req 6.3).
const AFFIRMATIVE_TOKENS: ReadonlySet<string> = new Set([
  "sim",
  "s",
  "yes",
  "y",
  "confirmo",
  "confirmar",
  "confirmado",
  "confirma",
  "isso",
  "correto",
  "correta",
  "certo",
  "ok",
  "okay",
  "positivo",
  "claro",
  "exato",
  "exatamente",
  "pode",
]);

// Tokens que caracterizam rejeição/solicitação de correção (Req 6.4).
const CORRECTION_TOKENS: ReadonlySet<string> = new Set([
  "nao",
  "não",
  "n",
  "negativo",
  "errado",
  "errada",
  "erro",
  "incorreto",
  "incorreta",
  "corrigir",
  "corrige",
  "correcao",
  "correção",
  "mudar",
  "muda",
  "mude",
  "trocar",
  "troca",
  "troque",
  "ajustar",
  "ajusta",
  "ajuste",
  "alterar",
  "altera",
  "altere",
  "rejeito",
  "rejeitar",
  "refazer",
]);

// Tokens que indicam cancelamento da interação (Req 16.4).
const CANCEL_TOKENS: ReadonlySet<string> = new Set([
  "cancelar",
  "cancela",
  "cancele",
  "cancelo",
  "cancelado",
  "desistir",
  "desisto",
]);

// Entrada de ambiguidade pendente: guarda o item original interpretado para,
// após a escolha da paciente, reconstruir um ResolvedItem preservando a
// quantidade/unidade informadas (Req 4.6, 4.7).
interface AmbiguityEntry {
  kind: "FOOD" | "MEASURE";
  foodName: string;
  // Pares alimento+medida candidatos: a escolha define tanto o alimento quanto
  // a medida/unidade (Req 4.6).
  candidates: ResolvedFoodMeasure[];
  item: InterpretedItem;
  saturated?: boolean;
}

// Estado pendente de uma conversa. Mantido em memória, ligado à `conversation`
// persistida; `conversation.status` é sempre o estado canônico (Req 16). O
// `status` aqui espelha esse estado para roteamento eficiente.
export interface PendingMealState {
  conversationId: string;
  status: ConversationStatus;
  // Id externo da última mensagem inbound — usado como chave de idempotência da
  // refeição no momento da persistência (Req 13.1, 13.2).
  externalMessageId: string;
  glucose: number | null;
  glucoseTrend: GlucoseTrend | null;
  meal: MealType | null;
  // Itens acumulados já resolvidos a um Food (quantidade pode estar ausente/NaN
  // até a paciente informá-la — Req 5.6/11.4).
  resolvedItems: ResolvedItem[];
  // Ambiguidades pendentes de escolha (Req 4.6).
  ambiguous: AmbiguityEntry[];
  // Nomes de alimentos não resolvidos (Req 4.8) → FOOD em missingInformation.
  unresolvedFoods: string[];
  /** Questions supplied by the optional conversational food-discovery assistant. */
  foodClarifications: string[];
  /** Mensagens anteriores, para o interpretador manter contexto natural. */
  conversationHistory: string[];
  // Total de CHO calculado na apresentação para confirmação (Req 5.2, 6.1).
  totalCarbohydrates: number;
  // Total de CHO retornado pela LLM, quando o interpretador OpenAI está ativo.
  llmTotalCarbohydrates: number | null;
  // Momento em que a conversa entrou em WAITING_CONFIRMATION (Req 6.6).
  waitingSince: Date | null;
  // Dose calculada (arredondada e bruta), disponível após a persistência (Req 10).
  calculatedRoundedDose: number | null;
  calculatedTotalDose: number | null;
  // Id da refeição persistida, usado para registrar a dose aplicada (Req 10).
  mealId: string | null;
}

/**
 * ConversationOrchestrator coordena a máquina de estados de uma conversa e o
 * fluxo end-to-end (Req 19). É injetável por completo (portas + relógio),
 * livre de IO próprio, o que o torna testável offline.
 */
export class ConversationOrchestrator {
  // Estados pendentes por conversa (Req 16). Chave: conversationId.
  private readonly states = new Map<string, PendingMealState>();
  // Conversa "corrente" da sessão de terminal (paciente única — Req 14.3).
  private currentConversationId: string | null = null;

  constructor(
    private readonly interpreter: Interpreter,
    private readonly resolver: FoodResolver,
    private readonly repo: Repository,
    private readonly channel: ChannelAdapter,
    private readonly clock: () => Date,
    private readonly options: { naturalFoodConversation?: boolean } = {},
  ) {}

  /**
   * Ponto de entrada para toda mensagem inbound (Req 19.1).
   *
   * Sequência:
   *   0) Idempotência: se o `externalMessageId` já foi processado (existe
   *      refeição com esse id), não cria nova refeição (Req 13.2).
   *   1) Autorização: paciente única no terminal (Req 14.2, 14.3).
   *   2) Registra a mensagem inbound (Req 16.5) e roteia pelo status da conversa.
   */
  async handleInbound(msg: InboundMessage): Promise<void> {
    // 0) Idempotência (Req 13.2): mensagem já processada não gera nova refeição.
    if (await this.repo.isMessageProcessed(msg.externalMessageId)) {
      await this.channel.send(
        "Esta mensagem já foi processada anteriormente; nenhuma nova refeição foi criada.",
      );
      return;
    }

    // 1) Autorização — paciente única (Req 14.2, 14.3). Hook sobrescrevível.
    if (!this.isAuthorized(msg)) {
      // Remetente não autorizado: não consulta dados, não interpreta, não
      // calcula e não cria registros (Req 14.2).
      return;
    }

    const text = msg.text;

    // Resolve a conversa corrente. Após COMPLETED, uma mensagem com dose é
    // tratada como registro de dose aplicada; caso contrário inicia-se uma nova
    // conversa.
    let state = this.currentState();

    if (state !== null && state.status === "COMPLETED") {
      if (state.mealId !== null && parseAppliedDose(text) !== null) {
        state.externalMessageId = msg.externalMessageId;
        await this.recordInbound(state.conversationId, text, msg.externalMessageId);
        await this.handleAppliedDose(text, state);
        return;
      }
      // Não é registro de dose → encerra o vínculo e inicia nova conversa.
      state = null;
    }

    if (state !== null && state.status === "CANCELLED") {
      state = null;
    }

    // Nova interação → cria Conversation com status ACTIVE (Req 16.1).
    if (state === null) {
      const conversation = await this.repo.createConversation();
      state = {
        conversationId: conversation.id,
        status: "ACTIVE",
        externalMessageId: msg.externalMessageId,
        glucose: null,
        glucoseTrend: null,
        meal: null,
        resolvedItems: [],
        ambiguous: [],
        unresolvedFoods: [],
        foodClarifications: [],
        conversationHistory: [],
        totalCarbohydrates: 0,
        llmTotalCarbohydrates: null,
        waitingSince: null,
        calculatedRoundedDose: null,
        calculatedTotalDose: null,
        mealId: null,
      };
      this.states.set(conversation.id, state);
      this.currentConversationId = conversation.id;
    }

    // O id externo da mensagem atual será a chave de idempotência da refeição
    // caso esta interação chegue à persistência (Req 13.1).
    state.externalMessageId = msg.externalMessageId;

    // 2) Registra a mensagem inbound (Req 16.5).
    await this.recordInbound(state.conversationId, text, msg.externalMessageId);
    const previousContext = state.conversationHistory.slice();
    state.conversationHistory.push(text);

    // Cancelamento explícito a qualquer momento (Req 16.4).
    if (isCancel(text)) {
      state.status = "CANCELLED";
      await this.repo.updateConversationStatus(state.conversationId, "CANCELLED");
      await this.respond(state, "Interação cancelada. Quando quiser, é só recomeçar.");
      this.currentConversationId = null;
      return;
    }

    // Roteamento pelo status canônico da conversa.
    if (state.status === "ACTIVE") {
      await this.interpretAndResolve(text, state, previousContext);
    } else if (state.status === "WAITING_CONFIRMATION") {
      await this.handleConfirmationReply(text, state);
    }
  }

  /**
   * Hook de autorização. Na Fase 1 (terminal) assume-se a paciente única
   * cadastrada, portanto sempre autorizado (Req 14.3). Subclasses/canais
   * futuros (WhatsApp) podem sobrescrever validando o remetente (Req 14.4).
   */
  protected isAuthorized(_msg: InboundMessage): boolean {
    return true;
  }

  // --- Sub-passos privados ---

  /**
   * Interpreta a mensagem, descarta qualquer dose (sanitize — Req 3.10),
   * resolve os alimentos contra o Food_Database e mescla o resultado no estado.
   * Se houver ambiguidade pendente, trata a mensagem como escolha de candidato
   * (Req 4.6, 4.7). Ao final, decide a próxima pergunta ou a confirmação.
   */
  private async interpretAndResolve(
    text: string,
    state: PendingMealState,
    conversationContext: readonly string[] = [],
  ): Promise<void> {
    // Respostas escalares a perguntas já feitas pertencem ao orquestrador, não
    // à LLM. Sem a mensagem outbound no histórico, "160" poderia ser ligado
    // incorretamente a um alimento pendente (por exemplo, à manteiga).
    if (state.glucose === null) {
      const glucose = extractStandaloneGlucoseReply(text);
      if (glucose !== null) {
        state.glucose = glucose;
        await this.advance(state);
        return;
      }
    }
    if (this.applyStandaloneQuantityReply(text, state)) {
      await this.advance(state);
      return;
    }

    // Só uma pergunta de ambiguidade consome a mensagem como escolha. Dados
    // obrigatórios têm prioridade no fluxo; assim, "160" após a pergunta de
    // glicemia não pode ser confundido com uma opção pendente.
    if (state.ambiguous.length > 0 && computeMissing(state).length === 0) {
      const pendingPhrase = state.ambiguous[0]?.foodName ?? text;
      const selected = this.trySelectCandidate(text, state);
      if (!selected) {
        // Seleção inválida → re-solicita a escolha da mesma lista (Req 4.7).
        await this.respond(state, this.promptForAmbiguity(state.ambiguous[0]!));
        return;
      }
      await this.rememberFoodChoice(pendingPhrase, selected);
      await this.advance(state);
      return;
    }

    // Interpreta e sanitiza (o contrato nunca carrega dose — Req 3.9, 3.10).
    const interpretation = sanitizeInterpretation(
      await this.interpreter.interpret(text, conversationContext),
    );

    // Mescla os escalares informados (não sobrescreve com null — acumula turnos).
    // Mescla os escalares informados (não sobrescreve com null — acumula turnos).
    if (interpretation.glucose !== null) {
      state.glucose = interpretation.glucose;
    }
    if (interpretation.glucoseTrend !== null && interpretation.glucoseTrend !== undefined) {
      state.glucoseTrend = interpretation.glucoseTrend;
    }
    if (interpretation.meal !== null) {
      state.meal = interpretation.meal;
    }
    if (interpretation.totalCarbohydrates !== undefined) {
      state.llmTotalCarbohydrates = interpretation.totalCarbohydrates;
    }

    // Resolve os itens desta mensagem e mescla no estado acumulado.
    if (interpretation.items.length > 0) {
      const previousUnresolved = [...state.unresolvedFoods];
      // A resposta a uma pergunta de descoberta ganha o contexto do alimento
      // original, para que o assistente LLM consiga conduzir o próximo turno.
      const resolverText = state.foodClarifications.length > 0
        ? `Alimento original: ${state.unresolvedFoods.join(", ")}. Pergunta anterior: ${state.foodClarifications[0] ?? ""}. Resposta da usuária: ${text}`
        : text;
      const outcomes = await this.resolver.resolveAll(interpretation.items, resolverText);
      const ambiguous: AmbiguityEntry[] = [];
      const unresolved: string[] = [];
      const clarifications: string[] = [];

      for (let i = 0; i < outcomes.length; i += 1) {
        const outcome = outcomes[i]!;
        const source = interpretation.items[i]!;
        if (outcome.kind === "RESOLVED") {
          this.mergeResolvedItem(state, {
            ...outcome.item,
            ...(source.carbohydrates === undefined
              ? {}
              : { llmCarbohydrates: source.carbohydrates }),
          });
          const learnedPhrase = previousUnresolved[i];
          if (learnedPhrase !== undefined) {
            await this.rememberFoodChoice(learnedPhrase, outcome.candidate);
          }
        } else if (outcome.kind === "NEEDS_FOOD_DISAMBIGUATION") {
          ambiguous.push({
            kind: "FOOD",
            foodName: outcome.foodName,
            candidates: outcome.candidateSet.candidates.map((candidate) => ({ food: candidate.food, measure: candidate.measure })),
            item: source,
            saturated: outcome.saturated,
          });
        } else if (outcome.kind === "NEEDS_MEASURE_DISAMBIGUATION") {
          ambiguous.push({
            kind: "MEASURE",
            foodName: outcome.foodName,
            candidates: outcome.candidates.map((candidate) => ({ food: candidate.food, measure: candidate.measure })),
            item: source,
          });
        } else if (outcome.kind === "NEEDS_FOOD_CLARIFICATION") {
          unresolved.push(outcome.foodName);
          clarifications.push(outcome.question);
        } else {
          unresolved.push(outcome.foodName);
        }
      }

      // As ambiguidades/não-resolvidos refletem a última mensagem; os resolvidos
      // permanecem acumulados (Req 4.8: preservar itens já resolvidos).
      state.ambiguous = ambiguous;
      state.unresolvedFoods = unresolved;
      state.foodClarifications = clarifications;
    }

    await this.advance(state);
  }

  /**
   * Decide o próximo passo: se ainda falta algo, pergunta APENAS o que falta
   * (Req 11); caso contrário, apresenta para confirmação (Req 6.1).
   */
  private async advance(state: PendingMealState): Promise<void> {
    const prompt = this.nextPrompt(state);
    if (prompt !== null) {
      // Permanece ACTIVE e pergunta o próximo dado ausente/ambíguo (Req 11).
      await this.respond(state, prompt);
      return;
    }
    await this.presentForConfirmation(state);
  }

  /**
   * Retorna a ÚNICA próxima pergunta para o primeiro item ausente, na ordem
   * GLUCOSE → MEAL → FOOD → FOOD_QUANTITY → AMBIGUOUS; ou `null` quando nada
   * falta e não há ambiguidades (Req 11.1–11.6, 4.6). Nunca solicita dado já
   * fornecido e não ambíguo (Property 13).
   */
  private nextPrompt(state: PendingMealState): string | null {
    const missing = computeMissing(state);

    if (missing.includes("GLUCOSE")) {
      return "Qual é a sua glicemia agora (mg/dL)?"; // Req 11.1
    }
    if (missing.includes("MEAL")) {
      return "Qual é o tipo de refeição? (café da manhã, almoço, lanche ou jantar)"; // Req 11.2
    }
    if (missing.includes("FOOD")) {
      // Req 11.3 — alimento não identificado / ausente.
      if (state.unresolvedFoods.length > 0) {
        if (state.foodClarifications.length > 0) return state.foodClarifications[0]!;
        return `Não reconheci: ${state.unresolvedFoods.join(", ")}. Pode especificar melhor esse(s) alimento(s)?`;
      }
      return "Quais alimentos você vai consumir nesta refeição?";
    }
    if (missing.includes("FOOD_QUANTITY")) {
      // Req 11.4 — quantidade ausente.
      const names = state.resolvedItems
        .filter((item) => !isPositiveFinite(item.quantity))
        .map((item) => item.foodName);
      const label = names.length > 0 ? ` de: ${names.join(", ")}` : "";
      return `Qual a quantidade${label}?`;
    }
    if (state.ambiguous.length > 0) {
      return this.promptForAmbiguity(state.ambiguous[0]!); // Req 4.6
    }
    return null; // nada falta → seguir para confirmação (Req 11.5, 11.6)
  }

  /**
   * Apresenta a interpretação e o total de CHO em gramas e passa a conversa a
   * WAITING_CONFIRMATION (Req 6.1, 6.2). O cálculo de CHO é determinístico e
   * usa exclusivamente os valores do Food_Database (Req 5).
   */
  private async presentForConfirmation(state: PendingMealState): Promise<void> {
    const carbs = calculateMealCarbs(state.resolvedItems);
    state.totalCarbohydrates = state.llmTotalCarbohydrates ?? carbs.totalCarbohydrates;

    state.status = "WAITING_CONFIRMATION";
    state.waitingSince = this.clock();
    await this.repo.updateConversationStatus(
      state.conversationId,
      "WAITING_CONFIRMATION",
    );

    const lines: string[] = [];
    lines.push("Confirme os dados da refeição:");
    lines.push(`- Glicemia: ${state.glucose ?? "?"} mg/dL`);
    if (state.glucoseTrend !== null) lines.push(`- Tendência: ${GLUCOSE_TREND_LABELS[state.glucoseTrend]}`);
    lines.push(
      `- Refeição: ${state.meal !== null ? MEAL_LABELS[state.meal] : "?"}`,
    );
    lines.push("- Itens:");
    for (const item of state.resolvedItems) {
      const perItem = carbs.perItem.find((p) => p.foodId === item.foodId);
      const displayCarbohydrates =
        item.llmCarbohydrates ?? perItem?.carbohydrates;
      const carbLabel = displayCarbohydrates !== undefined && displayCarbohydrates !== null
        ? ` (${displayCarbohydrates} g)`
        : "";
      const unitLabel = item.unit !== null
        ? ` ${pluralizeMeasure(displayMeasureUnit(item.unit), item.quantity)}`
        : "";
      lines.push(`   ${item.foodName}: ${item.quantity}${unitLabel}${carbLabel}`);
    }
    lines.push(`- Total de carboidratos: ${state.totalCarbohydrates} g`);
    lines.push('Está correto? Responda "sim" para confirmar.');

    await this.respond(state, lines.join("\n"));
  }

  /**
   * Interpreta a resposta de confirmação (Req 6.3, 6.4, 6.6, 6.7):
   *   - janela de 10 min expirada → mantém WAITING_CONFIRMATION, não calcula;
   *   - afirmativa explícita → calcula + persiste;
   *   - correção/rejeição → volta a ACTIVE e pede o dado a ajustar;
   *   - ambígua/não reconhecida → reapresenta e re-solicita confirmação.
   */
  private async handleConfirmationReply(
    text: string,
    state: PendingMealState,
  ): Promise<void> {
    // Timeout de confirmação (Req 6.6): resposta fora da janela de 10 min não
    // calcula nem persiste; mantém WAITING_CONFIRMATION e reabre a janela.
    if (state.waitingSince !== null) {
      const elapsed = this.clock().getTime() - state.waitingSince.getTime();
      if (elapsed > CONFIRMATION_TIMEOUT_MS) {
        await this.respond(
          state,
          "A janela de confirmação expirou (10 min). Por segurança, não calculei nem registrei nada.",
        );
        // Reapresenta e reabre a janela, permanecendo em WAITING_CONFIRMATION.
        await this.presentForConfirmation(state);
        return;
      }
    }

    const classification = classifyConfirmation(text);

    if (classification === "AFFIRMATIVE") {
      await this.calculateAndPersist(state); // Req 6.3
      return;
    }

    if (classification === "CORRECTION") {
      // Não calcula nem persiste; volta a ACTIVE e pede o dado a ajustar (Req 6.4).
      state.status = "ACTIVE";
      state.waitingSince = null;
      await this.repo.updateConversationStatus(state.conversationId, "ACTIVE");
      await this.respond(
        state,
        "Sem problema. Qual dado devo ajustar? (glicemia, tipo de refeição, alimento ou quantidade)",
      );
      return;
    }

    // Ambígua/não reconhecida → reapresenta e re-solicita confirmação (Req 6.7).
    await this.respond(
      state,
      "Não entendi como confirmação. Vou repetir os dados para você confirmar.",
    );
    await this.presentForConfirmation(state);
  }

  /**
   * Único ponto que executa `calculateInsulin` (Req 7.8, 17.1). Carrega os
   * parâmetros exclusivamente do repositório (Req 8.6), constrói o snapshot e a
   * versão da fórmula e persiste de forma atômica (Req 9). Guarda contra dados
   * insuficientes (Req 17.3, 6.4).
   */
  private async calculateAndPersist(state: PendingMealState): Promise<void> {
    // Guarda de dados insuficientes: nunca calcula sem dados completos (Req 17.3).
    const missing = computeMissing(state);
    if (missing.length > 0 || state.ambiguous.length > 0) {
      state.status = "ACTIVE";
      state.waitingSince = null;
      await this.repo.updateConversationStatus(state.conversationId, "ACTIVE");
      await this.respond(
        state,
        "Ainda faltam dados para calcular. Vamos completar antes de prosseguir.",
      );
      await this.advance(state);
      return;
    }

    const glucose = state.glucose!;
    const mealType = state.meal!;

    // Parâmetros lidos exclusivamente do repositório (Req 8.6).
    const parameters = await this.repo.getInsulinParameters(mealType);
    if (parameters === null) {
      // Parâmetro ausente → não calcula e indica erro (Req 8.7).
      await this.respond(
        state,
        "Não encontrei os parâmetros de cálculo para este tipo de refeição. Não é possível calcular a dose.",
      );
      return;
    }

    // Recalcula o CHO de forma determinística (Req 5) e monta os itens a persistir.
    const carbs = calculateMealCarbs(state.resolvedItems);
    const items: SaveMealItemInput[] = state.resolvedItems.map((item) => {
      const perItem = carbs.perItem.find((p) => p.foodId === item.foodId);
      return {
        foodId: item.foodId,
        foodNameSnapshot: item.foodName,
        quantity: item.quantity,
        unit: item.unit,
        carbohydrates: item.llmCarbohydrates ?? (
          perItem !== undefined
            ? perItem.carbohydrates
            : round2((item.quantity * item.carbsPerServing) / item.servingQuantity)
        ),
      };
    });
    const totalCarbohydrates = state.llmTotalCarbohydrates ?? carbs.totalCarbohydrates;
    state.totalCarbohydrates = totalCarbohydrates;

    // Cálculo determinístico de insulina — ÚNICO lugar (Req 7.8, 17.1).
    let result;
    try {
      result = calculateInsulin({
        glucose,
        carbohydrates: totalCarbohydrates,
        targetGlucose: parameters.targetGlucose,
        correctionFactor: parameters.correctionFactor,
        carbohydrateRatio: parameters.carbohydrateRatio,
      });
    } catch (error) {
      if (error instanceof InsulinCalculationError) {
        await this.respond(
          state,
          "Não foi possível calcular a dose com os dados/parâmetros atuais.",
        );
        return;
      }
      throw error;
    }

    // Persistência atômica de refeição + cálculo + itens, com Parameter_Snapshot
    // e Formula_Version (Req 9.3, 9.4, 9.5, 9.6, 9.7).
    let mealId: string;
    try {
      const patient = await this.repo.getPatient();
      const saved = await this.repo.saveMealWithCalculation({
        conversationId: state.conversationId,
        patientId: patient.id,
        externalMessageId: state.externalMessageId,
        mealType,
        glucose,
        totalCarbohydrates,
        items,
        calculation: {
          correctionDose: result.correctionDose,
          carbohydrateDose: result.carbohydrateDose,
          totalDose: result.totalDose,
          roundedDose: result.roundedDose,
          snapshotTargetGlucose: parameters.targetGlucose,
          snapshotCorrectionFactor: parameters.correctionFactor,
          snapshotCarbohydrateRatio: parameters.carbohydrateRatio,
          formulaVersion: FORMULA_VERSION,
        },
      });
      mealId = saved.mealId;
    } catch {
      // Falha de persistência → rollback já tratado pelo repositório (Req 9.4).
      await this.respond(
        state,
        "Ocorreu um erro ao registrar a refeição. Nada foi salvo. Tente novamente.",
      );
      return;
    }

    // Conclui: status COMPLETED (Req 16.3) e guarda a dose calculada (Req 10).
    state.mealId = mealId;
    state.calculatedRoundedDose = result.roundedDose;
    state.calculatedTotalDose = result.totalDose;
    state.status = "COMPLETED";
    state.waitingSince = null;
    await this.repo.updateConversationStatus(state.conversationId, "COMPLETED");

    await this.respond(
      state,
      [
        "Refeição registrada com sucesso.",
        `Dose calculada: ${result.roundedDose} unidade(s) (dose bruta: ${round2(result.totalDose)}).`,
        'Se aplicar uma dose diferente, me avise (por exemplo, "apliquei 6").',
      ].join("\n"),
    );
  }

  /**
   * Registra a dose efetivamente aplicada (Req 10). É independente da calculada:
   * valida a faixa [0.1, 250] (Req 10.3, 10.4), persiste e exibe a diferença
   * entre aplicada e calculada (Req 10.6).
   */
  private async handleAppliedDose(
    text: string,
    state: PendingMealState,
  ): Promise<void> {
    if (state.mealId === null) {
      await this.respond(state, "Não há refeição registrada para associar a dose aplicada.");
      return;
    }

    const applied = parseAppliedDose(text);
    // Validação de faixa (Req 10.3, 10.4): número em [0.1, 250].
    if (applied === null || applied < 0.1 || applied > 250) {
      await this.respond(
        state,
        "Valor de dose aplicada inválido. Informe um número entre 0,1 e 250 unidades.",
      );
      return;
    }

    try {
      await this.repo.saveAppliedDose(state.mealId, applied);
    } catch {
      await this.respond(
        state,
        "Não foi possível registrar a dose aplicada. A dose anterior foi preservada.",
      );
      return;
    }

    // Diferença aplicada vs calculada (Req 10.6). Usa a dose calculada arredondada.
    const calculated = state.calculatedRoundedDose;
    if (calculated !== null) {
      const difference = round2(applied - calculated);
      await this.respond(
        state,
        [
          `Dose aplicada registrada: ${applied} unidade(s).`,
          `Dose calculada: ${calculated} unidade(s).`,
          `Diferença (aplicada − calculada): ${difference} unidade(s).`,
        ].join("\n"),
      );
      return;
    }

    await this.respond(state, `Dose aplicada registrada: ${applied} unidade(s).`);
  }

  // --- Auxiliares de estado/itens ---

  /**
   * Mescla um item resolvido no estado acumulado, deduplicando pela combinação
   * `foodId` + unidade normalizada. Como o mesmo alimento pode aparecer com
   * medidas diferentes (cada medida tem seu próprio carboidrato — Req 12.2),
   * duas medidas distintas do mesmo alimento NÃO são colapsadas. Se o item já
   * existe (mesmo alimento e mesma medida), atualiza a quantidade/unidade
   * apenas quando os novos valores forem utilizáveis, preservando informação
   * previamente fornecida.
   */
  private mergeResolvedItem(state: PendingMealState, item: ResolvedItem): void {
    const key = mergeKey(item.foodId, item.unit);
    const index = state.resolvedItems.findIndex(
      (r) => mergeKey(r.foodId, r.unit) === key,
    );
    if (index < 0) {
      state.resolvedItems.push(item);
      return;
    }
    const previous = state.resolvedItems[index]!;
    state.resolvedItems[index] = {
      ...item,
      quantity: isPositiveFinite(item.quantity) ? item.quantity : previous.quantity,
      unit: item.unit ?? previous.unit,
    };
  }

  /** Aplica um número isolado à única quantidade que acabou de ser solicitada. */
  private applyStandaloneQuantityReply(text: string, state: PendingMealState): boolean {
    const missing = computeMissing(state);
    if (
      !missing.includes("FOOD_QUANTITY") ||
      missing.some((value) => value !== "FOOD_QUANTITY")
    ) {
      return false;
    }

    const withoutQuantity = state.resolvedItems.filter(
      (item) => !isPositiveFinite(item.quantity),
    );
    if (withoutQuantity.length !== 1) {
      return false;
    }

    const quantity = extractStandaloneQuantityReply(text);
    if (quantity === null) {
      return false;
    }
    withoutQuantity[0]!.quantity = quantity;
    return true;
  }

  /**
   * Tenta interpretar a mensagem como a escolha de um candidato para a primeira
   * ambiguidade pendente. Aceita escolha por índice (1-based), pelo nome do
   * alimento OU pela unidade da medida (normalizados — Req 4.6). Ao escolher,
   * reconstrói um ResolvedItem a partir do par alimento+medida selecionado,
   * preservando a quantidade do item original interpretado. Os valores
   * nutricionais vêm exclusivamente da medida (Req 4.9). Retorna `true` se
   * resolveu; `false` para seleção inválida (Req 4.7).
   */
  private trySelectCandidate(text: string, state: PendingMealState): ResolvedFoodMeasure | null {
    const entry = state.ambiguous[0]!;
    const candidates = entry.kind === "FOOD" ? distinctPairs(entry.candidates) : entry.candidates;

    let chosen: ResolvedFoodMeasure | null = null;

    // Escolha por índice (ex.: "2").
    const numeric = parseFirstNumber(text);
    if (
      numeric !== null &&
      Number.isInteger(numeric) &&
      numeric >= 1 &&
      numeric <= candidates.length
    ) {
      chosen = candidates[numeric - 1]!;
    }

    // Escolha por texto só é válida quando casa exatamente UMA opção.
    if (chosen === null) {
      const key = normalizeName(text);
      const matches = candidates.filter((candidate) =>
        entry.kind === "FOOD"
          ? normalizeName(candidate.food.name) === key
          : normalizeName(candidate.measure.servingUnit) === key,
      );
      chosen = matches.length === 1 ? matches[0]! : null;
    }

    if (chosen === null) {
      return null;
    }

    // A escolha de alimento pode ainda exigir escolher uma medida.
    if (entry.kind === "FOOD") {
      const selectedFood = chosen!;
      const measures = entry.candidates.filter((candidate) => candidate.food.id === selectedFood.food.id);
      const unitMatches = entry.item.unit === null ? measures : measures.filter((candidate) => normalizeName(candidate.measure.servingUnit) === normalizeName(entry.item.unit!));
      if (unitMatches.length !== 1) {
        entry.kind = "MEASURE";
        entry.candidates = unitMatches.length > 0 ? unitMatches : measures;
        entry.saturated = false;
        return null;
      }
      chosen = unitMatches[0]!;
    }

    // Reconstrói o ResolvedItem preservando a quantidade do item original; a
    // unidade e os valores nutricionais vêm da medida escolhida (Req 4.9).
    this.mergeResolvedItem(state, {
      foodName: chosen.food.name,
      quantity: entry.item.quantity ?? Number.NaN,
      quantityMode: entry.item.unit === null ? "WEIGHT" : "SERVINGS",
      unit: chosen.measure.servingUnit,
      carbsPerServing: chosen.measure.carbohydrates,
      servingQuantity: chosen.measure.servingQuantity,
      foodId: chosen.food.id,
      ...(entry.item.carbohydrates === undefined
        ? {}
        : { llmCarbohydrates: entry.item.carbohydrates }),
    });

    state.ambiguous.shift(); // ambiguidade resolvida
    return chosen;
  }

  /** Aprende uma associação somente depois de uma escolha textual válida. */
  private async rememberFoodChoice(
    phrase: string,
    candidate: ResolvedFoodMeasure,
  ): Promise<void> {
    try {
      await this.repo.upsertFoodMemory({
        phrase,
        normalizedPhrase: normalizeName(phrase),
        foodId: candidate.food.id,
        measureId: candidate.measure.id,
      });
    } catch {
      // A memória é auxiliar: uma falha não interrompe a conversa nem o cálculo.
    }
  }

  // Prompt de ambiguidade: lista os pares alimento+medida e pede escolher
  // exatamente um (Req 4.6).
  private promptForAmbiguity(entry: AmbiguityEntry): string {
    if (this.options.naturalFoodConversation) {
      if (entry.saturated) {
        return `Encontrei muitas opções para “${entry.foodName}”. Pode descrevê-lo melhor, por exemplo informando o preparo ou a marca?`;
      }
      return entry.kind === "MEASURE"
        ? `Qual medida de ${entry.foodName} você quis dizer? Descreva-a com suas palavras.`
        : `Não consegui identificar exatamente qual alimento você quis dizer por “${entry.foodName}”. Pode descrevê-lo melhor?`;
    }
    if (entry.saturated) {
      return `Encontrei muitas opções para "${entry.foodName}". Pode informar mais detalhes, como preparo ou marca?`;
    }
    const displayCandidates = entry.kind === "FOOD" ? distinctPairs(entry.candidates) : entry.candidates;
    const options = displayCandidates
      .map(
        (candidate, index) =>
          entry.kind === "FOOD"
            ? `${index + 1}) ${candidate.food.name}`
            : `${index + 1}) ${candidate.measure.servingUnit} (${candidate.measure.servingQuantity} g/ml)`,
      )
      .join(", ");
    return `Para "${entry.foodName}" encontrei mais de uma opção: ${options}. Qual você quis dizer? Escolha exatamente uma (número ou texto).`;
  }

  // --- Auxiliares de IO via portas ---

  // Resolve o estado da conversa corrente (ou null).
  private currentState(): PendingMealState | null {
    if (this.currentConversationId === null) {
      return null;
    }
    return this.states.get(this.currentConversationId) ?? null;
  }

  // Registra uma mensagem inbound (Req 16.5).
  private async recordInbound(
    conversationId: string,
    content: string,
    externalMessageId: string,
  ): Promise<void> {
    await this.repo.appendConversationMessage({
      conversationId,
      direction: "INBOUND",
      messageType: "TEXT",
      content,
      externalMessageId,
    });
  }

  // Envia a resposta ao canal e registra a mensagem outbound (Req 1.5, 16.5).
  private async respond(state: PendingMealState, text: string): Promise<void> {
    await this.channel.send(text);
    await this.repo.appendConversationMessage({
      conversationId: state.conversationId,
      direction: "OUTBOUND",
      messageType: "TEXT",
      content: text,
      externalMessageId: null,
    });
  }
}

// --- Funções puras auxiliares (nível de módulo) ---

// Número finito estritamente positivo (quantidade válida — Req 5.6).
function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

// Chave de deduplicação de itens: alimento + unidade normalizada. Assim, duas
// medidas distintas do mesmo alimento (cada uma com seu carboidrato — Req 12.2)
// não são colapsadas em um único item.
function mergeKey(foodId: string, unit: string | null): string {
  return `${foodId}\u0000${unit === null ? "" : normalizeName(unit)}`;
}

function displayMeasureUnit(unit: string): string {
  return unit.replace(/^\s*(?:\d+(?:[.,]\d+)?|\d+\/\d+)\s+/, "");
}

function pluralizeMeasure(unit: string, quantity: number): string {
  if (quantity === 1) return unit;
  const [first, ...rest] = unit.split(" ");
  const plural: Record<string, string> = {
    "xícara": "xícaras", xicara: "xícaras", colher: "colheres",
    unidade: "unidades", fatia: "fatias", concha: "conchas", copo: "copos",
  };
  return [plural[first!] ?? (first!.endsWith("s") ? first! : `${first}s`), ...rest].join(" ");
}

function distinctPairs(candidates: ResolvedFoodMeasure[]): ResolvedFoodMeasure[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.food.id)) return false;
    seen.add(candidate.food.id);
    return true;
  });
}

/**
 * Calcula o conjunto de informações ausentes a partir do estado acumulado
 * (Req 11). FOOD/FOOD_QUANTITY derivam da resolução (fonte de verdade), não do
 * interpretador. Ordem estável: GLUCOSE, MEAL, FOOD, FOOD_QUANTITY.
 */
function computeMissing(state: PendingMealState): MissingInfo[] {
  const missing: MissingInfo[] = [];

  if (state.glucose === null) {
    missing.push("GLUCOSE"); // Req 11.1
  }
  if (state.meal === null) {
    missing.push("MEAL"); // Req 11.2
  }

  const hasNoFoods =
    state.resolvedItems.length === 0 &&
    state.ambiguous.length === 0 &&
    state.unresolvedFoods.length === 0;
  if (state.unresolvedFoods.length > 0 || hasNoFoods) {
    missing.push("FOOD"); // Req 11.3 / 4.8
  }

  const hasInvalidQuantity = state.resolvedItems.some(
    (item) => !isPositiveFinite(item.quantity),
  );
  if (hasInvalidQuantity) {
    missing.push("FOOD_QUANTITY"); // Req 11.4
  }

  return missing;
}

// Classifica a resposta de confirmação por tokens de palavra (Req 6.3, 6.4, 6.7).
// Correção/rejeição tem precedência sobre afirmação para evitar falso positivo.
function classifyConfirmation(
  text: string,
): "AFFIRMATIVE" | "CORRECTION" | "AMBIGUOUS" {
  const tokens = tokenize(text);
  if (tokens.some((token) => CORRECTION_TOKENS.has(token))) {
    return "CORRECTION";
  }
  if (tokens.some((token) => AFFIRMATIVE_TOKENS.has(token))) {
    return "AFFIRMATIVE";
  }
  return "AMBIGUOUS";
}

// Detecta cancelamento explícito (Req 16.4).
function isCancel(text: string): boolean {
  return tokenize(text).some((token) => CANCEL_TOKENS.has(token));
}

// Tokeniza em palavras minúsculas, preservando acentos do português.
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^0-9a-záàâãéêíóôõúüç]+/i)
    .filter((token) => token.length > 0);
}

// Extrai o primeiro número do texto, aceitando vírgula decimal (ex.: "5,5").
function parseFirstNumber(text: string): number | null {
  const match = text.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (match === null) {
    return null;
  }
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

// Reconhece uma resposta exclusiva para o prompt de glicemia, com unidade
// opcional. Não aceita números misturados a outros textos/alimentos; estes
// continuam a ser interpretados pelo Interpreter normalmente.
function extractStandaloneGlucoseReply(text: string): number | null {
  const match = text.trim().match(/^(\d+(?:[.,]\d+)?)\s*(?:mg\s*\/?\s*dl)?$/i);
  if (match === null) {
    return null;
  }
  const value = Number(match[1]!.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Número puro para a resposta à pergunta de quantidade. A unidade não é
// permitida aqui porque a medida já foi resolvida e exibida no turno anterior.
function extractStandaloneQuantityReply(text: string): number | null {
  const match = text.trim().match(/^(\d+(?:[.,]\d+)?)$/);
  if (match === null) {
    return null;
  }
  const value = Number(match[1]!.replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// Interpreta uma dose aplicada a partir do texto: um número positivo finito.
function parseAppliedDose(text: string): number | null {
  const value = parseFirstNumber(text);
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}
