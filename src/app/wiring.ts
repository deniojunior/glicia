// src/app/wiring.ts
//
// Composição da aplicação (wiring) da Fase 1 (MVP Local — Req 19, 20.6).
//
// Princípio arquitetural central:
//   "IA interpreta. Banco fornece dados. Código calcula. Usuária confirma."
//
// Este módulo é o ÚNICO lugar que conhece as implementações concretas e as
// conecta às portas do domínio. O `ConversationOrchestrator` e o restante do
// domínio permanecem agnósticos de canal/persistência/interpretador.
//
// Tudo é 100% offline: NENHUMA chamada de rede em runtime (Req 1.7, 20.6).
// Assume a paciente única cadastrada via migrations/seed (Req 14.1, 14.3).
//
// `buildApp` é totalmente injetável (dbPath, interpreter, channel, clock), o
// que o torna testável end-to-end (tasks 15.2/15.3 injetam um InMemoryChannel
// e/ou um MockInterpreter roteirizado sobre um banco ":memory:").
//
// Nota sobre a semeadura de alimentos: `seeds/import-sbd-foods.ts` vive fora de
// `rootDir` ("src"), portanto um import estático violaria a compilação (tsc).
// A semeadura é feita, sob demanda, por um import dinâmico com especificador
// não-literal (invisível ao tsc), tipado localmente para preservar segurança de
// tipos. É best-effort: uma falha ao carregar o seeder nunca impede o app de
// iniciar (Req 12 é opcional para o boot; parâmetros/paciente vêm das migrations).

import { SqliteRepository } from "../adapters/persistence/sqlite-repository.js";
import { MockInterpreter } from "../adapters/interpreter-mock/mock-interpreter.js";
import { OpenAiInterpreter } from "../adapters/interpreter-openai/openai-interpreter.js";
import { OpenAiMealAssistant, type MealAssistantTurn } from "../adapters/openai-meal-assistant/openai-meal-assistant.js";
import { TerminalChannel } from "../adapters/terminal/terminal-channel.js";
import { FoodResolver } from "../domain/foods/food-resolver.js";
import { CandidateProvider } from "../domain/foods/candidate-provider.js";
import { ConversationOrchestrator } from "../domain/conversation/orchestrator.js";
import type { ChannelAdapter } from "../domain/ports/channel-adapter.js";
import type { Interpreter } from "../domain/ports/interpreter.js";
import { calculateInsulin, InsulinCalculationError } from "../domain/insulin/calculate-insulin.js";
import { round2 } from "../domain/meals/calculate-meal-carbs.js";

/** Conexão SQLite subjacente exposta pelo repositório (para bootstrap/seed). */
type SeedDb = ReturnType<SqliteRepository["getDatabase"]>;

/** Assinatura estrutural de `importSbdFoods` (tipada sem import estático). */
type ImportSbdFoods = (db: SeedDb) => unknown;

/** Módulo do seeder, resolvido dinamicamente em runtime. */
interface SeedModule {
  importSbdFoods: ImportSbdFoods;
}

// Especificador NÃO-literal (tipo `string`) do seeder: impede o tsc de resolver
// estaticamente o módulo fora de `rootDir`, enquanto o runtime (vitest/node)
// resolve normalmente. Mantido em um único ponto para clareza.
const SEED_MODULE_SPECIFIER: string = "../../seeds/import-sbd-foods.js";

/** Opções de composição da aplicação. Todas com padrões sensatos. */
export interface BuildAppOptions {
  /**
   * Caminho do arquivo SQLite. Aceita ":memory:" para testes. Quando omitido,
   * usa `GLICIA_DB_PATH` (env) ou o arquivo local padrão `glicia.db` (Req 1.7).
   */
  dbPath?: string;
  /** Interpretador injetável (padrão: MockInterpreter local, sem rede — Req 3.11). */
  interpreter?: Interpreter;
  /** Canal injetável (padrão: TerminalChannel sobre stdin/stdout). */
  channel?: ChannelAdapter;
  /** Relógio injetável para a janela de confirmação (padrão: `() => new Date()`). */
  clock?: () => Date;
  /**
   * Semeia a base de alimentos (SBD) quando `true`/omitido; `false` desativa.
   * A semeadura ocorre no `start()` e roda em TODO início: é idempotente
   * (`INSERT OR IGNORE`), então atualizações do CSV entram sem duplicar dados
   * nem exigir a recriação do `glicia.db`.
   */
  seedFoods?: boolean;
}

/** Aplicação composta e pronta para operar. */
export interface App {
  repo: SqliteRepository;
  channel: ChannelAdapter;
  interpreter: Interpreter;
  resolver: FoodResolver;
  orchestrator: ConversationOrchestrator;
  /** Semeia (se necessário) e inicia o canal (começa a ler mensagens inbound). */
  start(): Promise<void>;
  /** Encerra o canal e fecha a conexão do repositório. */
  stop(): Promise<void>;
}

/**
 * buildApp — compõe o repositório, o interpretador, o resolvedor de alimentos,
 * o canal e o orquestrador, ligando o handler inbound do canal ao orquestrador.
 *
 * Não realiza IO de rede (Req 1.7, 20.6). O bootstrap de paciente/parâmetros é
 * garantido pelas migrations aplicadas na construção do `SqliteRepository`. A
 * semeadura opcional de alimentos acontece em `start()`.
 */
export function buildApp(options: BuildAppOptions = {}): App {
  // Repositório local: as migrations (paciente única + parâmetros default) são
  // aplicadas no construtor (Req 8.3, 8.4, 14.1, 14.5).
  const repo =
    options.dbPath !== undefined
      ? new SqliteRepository({ dbPath: options.dbPath })
      : new SqliteRepository();

  const interpreter: Interpreter = resolveInterpreter(options.interpreter, repo);
  // A base inteira é fornecida ao interpretador como contexto. Não existe uma
  // segunda chamada de IA para pesquisar/selecionar alimentos no meio da fala.
  const resolver = new FoodResolver({ candidateProvider: new CandidateProvider(repo), memory: repo });
  const channel: ChannelAdapter = options.channel ?? new TerminalChannel();
  const clock = options.clock ?? ((): Date => new Date());

  const orchestrator = new ConversationOrchestrator(
    interpreter,
    resolver,
    repo,
    channel,
    clock,
    { naturalFoodConversation: process.env.GLICIA_INTERPRETER === "openai" },
  );

  // No modo OpenAI, a conversa inteira pertence à LLM. Não há máquina de
  // estados, perguntas ou roteamento conversacional no domínio: o código só
  // envia o turno, recebe os parâmetros consolidados e calcula a dose.
  const openAiChat = options.interpreter === undefined && process.env.GLICIA_INTERPRETER === "openai"
    ? new OpenAiMealAssistant({
      foodCatalog: async () => formatFoodCatalog(await repo.listActiveFoodEntries()),
    })
    : null;
  channel.onMessage(async (msg) => {
    if (openAiChat === null) {
      await orchestrator.handleInbound(msg);
      return;
    }
    const turn = await openAiChat.reply(msg.text);
    await channel.send(await formatAssistantReply(turn, repo));
  });

  const shouldSeed = options.seedFoods !== false;

  return {
    repo,
    channel,
    interpreter,
    resolver,
    orchestrator,
    async start(): Promise<void> {
      if (shouldSeed) {
        await seedFoods(repo);
      }
      await channel.start();
    },
    async stop(): Promise<void> {
      await channel.stop();
      repo.close();
    },
  };
}

async function formatAssistantReply(
  turn: MealAssistantTurn,
  repo: SqliteRepository,
): Promise<string> {
  if (!turn.ready || turn.carbohydrates === null || turn.glucose === null || turn.meal === null) {
    return turn.reply;
  }
  const parameters = await repo.getInsulinParameters(turn.meal);
  if (parameters === null) {
    return `${turn.reply}\n\nNão encontrei os parâmetros de insulina para essa refeição.`;
  }
  try {
    const result = calculateInsulin({
      glucose: turn.glucose,
      carbohydrates: turn.carbohydrates,
      targetGlucose: parameters.targetGlucose,
      correctionFactor: parameters.correctionFactor,
      carbohydrateRatio: parameters.carbohydrateRatio,
    });
    return `${turn.reply}\n\nDose sugerida pelo cálculo: ${result.roundedDose} unidade(s) (dose bruta: ${round2(result.totalDose)}).`;
  } catch (error) {
    if (error instanceof InsulinCalculationError) {
      return `${turn.reply}\n\nNão foi possível calcular a dose com os parâmetros atuais.`;
    }
    throw error;
  }
}

/**
 * Seleciona a implementação de Interpreter (Req 2.5, 2.6, 20.2):
 *   1. se `injected` for fornecido, usa-o (ex.: MockInterpreter roteirizado em testes);
 *   2. senão, se `GLICIA_INTERPRETER === "openai"`, usa o OpenAiInterpreter
 *      (lê OPENAI_API_KEY/OPENAI_MODEL do ambiente — segredos server-side);
 *   3. caso contrário, mantém o padrão offline `MockInterpreter` (Req 3.11).
 *
 * A troca do interpretador NÃO altera o pipeline de domínio (Req 2.6).
 */
function resolveInterpreter(
  injected: Interpreter | undefined,
  repo: SqliteRepository,
): Interpreter {
  if (injected !== undefined) {
    return injected;
  }
  if (process.env.GLICIA_INTERPRETER === "openai") {
    return new OpenAiInterpreter({
      foodCatalog: async () => formatFoodCatalog(await repo.listActiveFoodEntries()),
      foodMemory: async () => formatFoodMemory(repo),
    });
  }
  return new MockInterpreter();
}

function formatFoodCatalog(
  entries: Awaited<ReturnType<SqliteRepository["listActiveFoodEntries"]>>,
): string {
  return entries.map((entry) => {
    const aliases = entry.aliases.length > 0 ? `; apelidos: ${entry.aliases.join(", ")}` : "";
    const measures = entry.measures.map((measure) =>
      `${measure.servingUnit} (${measure.servingQuantity} unidade(s), ${measure.carbohydrates} g CHO)`,
    ).join(" | ");
    return `- ${entry.food.name}${aliases}: ${measures}`;
  }).join("\n");
}

async function formatFoodMemory(repo: SqliteRepository): Promise<string> {
  const [memories, entries] = await Promise.all([
    repo.listFoodMemories(),
    repo.listActiveFoodEntries(),
  ]);
  return memories.map((memory) => {
    const entry = entries.find((candidate) => candidate.food.id === memory.foodId);
    const measure = entry?.measures.find((candidate) => candidate.id === memory.measureId);
    const target = entry && measure
      ? `${entry.food.name} / ${measure.servingUnit}`
      : `food_id=${memory.foodId}, measure_id=${memory.measureId}`;
    return `- "${memory.phrase}" => ${target}`;
  }).join("\n");
}

/**
 * Semeia a base de alimentos (Req 12) usando a MESMA conexão do repositório
 * (para alcançar inclusive bancos ":memory:").
 *
 * A importação roda em TODO início e é totalmente idempotente: `importSbdFoods`
 * usa `INSERT OR IGNORE` sobre índices únicos normalizados (identidade por nome,
 * medida por food_id + unidade, alias por alias normalizado). Assim, atualizações
 * no `sbd-foods.csv` (novos alimentos/medidas) são incorporadas no próximo start
 * SEM duplicar registros e SEM precisar apagar/recriar o `glicia.db`.
 *
 * Best-effort: se o seeder não puder ser carregado, registra um aviso e segue —
 * o app continua operável (parâmetros/paciente vêm das migrations).
 */
async function seedFoods(repo: SqliteRepository): Promise<void> {
  const db = repo.getDatabase();
  try {
    const mod = (await import(SEED_MODULE_SPECIFIER)) as SeedModule;
    mod.importSbdFoods(db);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(
      `Aviso: não foi possível semear a base de alimentos (${message}). ` +
        "Prosseguindo sem seed automático.\n",
    );
  }
}
