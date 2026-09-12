import { authenticateApprovedUser, type AuthenticatedClients } from "../_shared/auth.ts";
import { corsHeaders, HttpError, json } from "../_shared/http.ts";
import { buildInstructions } from "./guardrails.mjs";
import { FOOD_TABLE_SHA256 } from "./food-table-source.mjs";
import { turnSchema } from "./turn-schema.mjs";

type ChatMessage = { role: "user" | "assistant"; content: string };
type ChatRequest = {
  messages: readonly ChatMessage[];
  foodMemory?: Readonly<Record<string, string>>;
  foodTable?: string;
  instructions?: string;
};

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2_000;
const MAX_MEMORY_ITEMS = 50;
const MAX_OUTPUT_TOKENS = 1_200;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido.", code: "method_not_allowed" }, 405);

  let authenticated;
  try { authenticated = await authenticateApprovedUser(request); }
  catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
    return json({ error: "Não foi possível verificar o acesso.", code: "access_check_failed" }, 500);
  }

  let payload: Partial<ChatRequest>;
  try { payload = await request.json(); }
  catch { return json({ error: "Solicitação de conversa inválida.", code: "invalid_request" }, 400); }

  const validation = await validateRequest(payload);
  if (!validation.valid) return json({ error: validation.message, code: validation.code }, 400);
  const inputChars = validation.inputChars;

  const { data: reservationData, error: reservationError } = await authenticated.admin.rpc("reserve_ai_request_from_edge", {
    p_user_id: authenticated.user.id,
    p_input_chars: inputChars
  });
  const reservation = Array.isArray(reservationData) ? reservationData[0] : reservationData;
  if (reservationError || !reservation) return json({ error: "Não foi possível reservar a análise agora.", code: "usage_check_failed" }, 503);
  if (!reservation.allowed || !reservation.request_id) return deniedResponse(String(reservation.denial_code ?? "unavailable"));

  const reservationId = String(reservation.request_id);
  const startedAt = performance.now();
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const model = Deno.env.get("OPENAI_MODEL")?.trim();
  if (!apiKey || !model) {
    await finish(authenticated.admin, reservationId, authenticated.user.id, "failed", 0, 0, 0, elapsed(startedAt), "missing_provider_configuration");
    return json({ error: "O provedor de IA está temporariamente indisponível.", code: "provider_unavailable" }, 503);
  }

  const instructions = buildInstructions(validation.foodMemory, validation.foodTable);
  let openAiResponse: Response;
  try {
    openAiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model, instructions, input: payload.messages, store: false, max_output_tokens: MAX_OUTPUT_TOKENS,
        text: { format: { type: "json_schema", name: "glicia_turn", strict: true, schema: turnSchema } }
      })
    });
  } catch {
    await finish(authenticated.admin, reservationId, authenticated.user.id, "failed", 0, 0, 0, elapsed(startedAt), "provider_network");
    return json({ error: "Não consegui analisar a refeição agora. Tente novamente.", code: "provider_network" }, 503);
  }

  if (!openAiResponse.ok) {
    const failureCode = openAiResponse.status === 429 ? "provider_rate_limit" : openAiResponse.status === 401 ? "provider_authentication" : "provider_error";
    await finish(authenticated.admin, reservationId, authenticated.user.id, "failed", 0, 0, 0, elapsed(startedAt), failureCode);
    return json({ error: "O provedor de IA não respondeu corretamente.", code: failureCode }, openAiResponse.status === 429 ? 429 : 502);
  }

  const openAiPayload = await openAiResponse.json() as Record<string, unknown>;
  const outputText = extractOutputText(openAiPayload);
  const usage = extractUsage(openAiPayload);
  if (!outputText || outputText.length > Number(reservation.max_output_chars) || !validTurn(outputText)) {
    await finish(authenticated.admin, reservationId, authenticated.user.id, "failed", outputText?.length ?? 0, usage.input, usage.output, elapsed(startedAt), "invalid_provider_response");
    return json({ error: "O provedor de IA devolveu uma resposta inválida.", code: "invalid_provider_response" }, 502);
  }

  await finish(authenticated.admin, reservationId, authenticated.user.id, "completed", outputText.length, usage.input, usage.output, elapsed(startedAt), null);
  const resolvedModel = typeof openAiPayload.model === "string" ? openAiPayload.model : model;
  return new Response(JSON.stringify({ id: openAiPayload.id, output_text: outputText, provider: "openai", model: resolvedModel }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

async function validateRequest(payload: Partial<ChatRequest>): Promise<{ valid: true; inputChars: number; foodMemory: Readonly<Record<string, string>>; foodTable: string } | { valid: false; code: string; message: string }> {
  if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > MAX_MESSAGES) return invalid("invalid_messages");
  if (payload.messages.some((message) => !isMessage(message) || message.content.length > MAX_MESSAGE_CHARS)) return invalid("invalid_messages");
  if (payload.messages.at(-1)?.role !== "user") return invalid("invalid_messages");
  const legacyTable = typeof payload.instructions === "string" ? legacyFoodTable(payload.instructions) : null;
  const foodTable = typeof payload.foodTable === "string" ? payload.foodTable : legacyTable;
  if (typeof foodTable !== "string" || await sha256(foodTable) !== FOOD_TABLE_SHA256) return invalid("invalid_food_table");
  const foodMemory = payload.foodMemory ?? {};
  if (!isFoodMemory(foodMemory)) return invalid("invalid_food_memory");
  const inputChars = payload.messages.reduce((total, message) => total + message.content.length, 0)
    + JSON.stringify(foodMemory).length;
  return { valid: true, inputChars, foodMemory, foodTable };
}

function legacyFoodTable(instructions: string): string | null {
  const marker = "TABELA DE ALIMENTOS:\n";
  const markerIndex = instructions.lastIndexOf(marker);
  return markerIndex >= 0 ? instructions.slice(markerIndex + marker.length) : null;
}

function invalid(code: string) { return { valid: false as const, code, message: "Solicitação de conversa inválida." }; }
function isMessage(value: unknown): value is ChatMessage {
  return typeof value === "object" && value !== null && "role" in value && "content" in value
    && (value.role === "user" || value.role === "assistant") && typeof value.content === "string" && value.content.trim().length > 0;
}
function isFoodMemory(value: unknown): value is Readonly<Record<string, string>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return entries.length <= MAX_MEMORY_ITEMS && entries.every(([food, preparation]) => food.trim().length > 0 && food.length <= 160 && typeof preparation === "string" && preparation.trim().length > 0 && preparation.length <= 500);
}
async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function deniedResponse(code: string): Response {
  if (code === "user_daily_limit") return json({ error: "Você atingiu o limite de análises de hoje. Ainda é possível informar os dados sem IA.", code }, 429);
  if (code === "user_daily_token_limit") return json({ error: "Você atingiu o limite de uso da IA hoje. Ainda é possível informar os dados sem IA.", code }, 429);
  if (code === "concurrency_limit") return json({ error: "A Glicia está atendendo outras análises agora. Tente novamente em instantes.", code }, 429);
  if (code === "input_too_large") return json({ error: "A conversa ficou longa demais. Inicie uma nova refeição.", code }, 413);
  if (code === "suspended") return json({ error: "Seu acesso à Glicia está suspenso.", code }, 403);
  return json({ error: "As análises por IA estão temporariamente pausadas. Ainda é possível informar os dados sem IA.", code }, 503);
}

async function finish(admin: AuthenticatedClients["admin"], requestId: string, userId: string, status: "completed" | "failed", outputChars: number, inputTokens: number, outputTokens: number, latencyMs: number, failureCode: string | null) {
  const { error } = await admin.rpc("finish_ai_request_from_edge", { p_request_id: requestId, p_user_id: userId, p_status: status, p_output_chars: outputChars, p_input_tokens: inputTokens, p_output_tokens: outputTokens, p_latency_ms: latencyMs, p_failure_code: failureCode });
  if (error) console.error("ai usage finish failed", { code: error.code ?? "unknown" });
}
function elapsed(startedAt: number): number { return Math.max(0, Math.round(performance.now() - startedAt)); }

function extractUsage(payload: Record<string, unknown>): { input: number; output: number } {
  const usage = typeof payload.usage === "object" && payload.usage !== null ? payload.usage as Record<string, unknown> : {};
  return { input: nonNegativeInteger(usage.input_tokens), output: nonNegativeInteger(usage.output_tokens) };
}
function nonNegativeInteger(value: unknown): number { return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0; }
function extractOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (typeof item !== "object" || item === null || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) if (typeof content === "object" && content !== null && "text" in content && typeof content.text === "string") return content.text;
  }
  return null;
}
function validTurn(output: string): boolean {
  try {
    const value = JSON.parse(output) as Record<string, unknown>;
    const keys = ["food_memory_updates", "glucose", "glucose_trend", "meal_items", "meal_type", "reply", "total_carbohydrates"];
    return typeof value === "object" && value !== null && Object.keys(value).sort().join() === keys.join()
      && typeof value.reply === "string" && value.reply.length <= 4_000
      && validOptionalNumber(value.total_carbohydrates, true) && validOptionalNumber(value.glucose, false)
      && ["SUBINDO_RAPIDO", "SUBINDO", "ESTAVEL", "CAINDO", "CAINDO_RAPIDO", "NAO_INFORMADA", null].includes(value.glucose_trend as never)
      && ["CAFE_DA_MANHA", "ALMOCO", "CAFE_DA_TARDE", "JANTAR", "CEIA", null].includes(value.meal_type as never)
      && Array.isArray(value.meal_items) && value.meal_items.length <= 30 && value.meal_items.every(validMealItem)
      && Array.isArray(value.food_memory_updates) && value.food_memory_updates.length <= 20 && value.food_memory_updates.every(validMemoryUpdate);
  } catch { return false; }
}
function validOptionalNumber(value: unknown, acceptsZero: boolean): boolean { return value === null || (typeof value === "number" && Number.isFinite(value) && (acceptsZero ? value >= 0 : value > 0)); }
function validMealItem(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join() === "carbohydrates,name,portion" && validText(item.name, 160)
    && validText(item.portion, 160) && typeof item.carbohydrates === "number" && Number.isFinite(item.carbohydrates) && item.carbohydrates >= 0;
}
function validMemoryUpdate(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Record<string, unknown>;
  return Object.keys(item).sort().join() === "food,usual_preparation" && validText(item.food, 160) && validText(item.usual_preparation, 500);
}
function validText(value: unknown, max: number): boolean { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
