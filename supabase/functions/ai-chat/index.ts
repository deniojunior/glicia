import { authenticateApprovedUser } from "../_shared/auth.ts";
import { HttpError } from "../_shared/http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type ChatRequest = {
  messages: readonly { role: "user" | "assistant"; content: string }[];
  instructions: string;
};

const turnSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "total_carbohydrates", "glucose", "glucose_trend", "meal_type", "food_memory_updates"],
  properties: {
    reply: { type: "string" },
    total_carbohydrates: { type: ["number", "null"], minimum: 0 },
    glucose: { type: ["number", "null"], exclusiveMinimum: 0 },
    glucose_trend: { type: ["string", "null"], enum: ["SUBINDO_RAPIDO", "SUBINDO", "ESTAVEL", "CAINDO", "CAINDO_RAPIDO", "NAO_INFORMADA", null] },
    meal_type: { type: ["string", "null"], enum: ["CAFE_DA_MANHA", "ALMOCO", "CAFE_DA_TARDE", "JANTAR", "CEIA", null] },
    food_memory_updates: { type: "array", items: { type: "object", additionalProperties: false, required: ["food", "usual_preparation"], properties: { food: { type: "string", minLength: 1 }, usual_preparation: { type: "string", minLength: 1 } } } }
  }
} as const;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    await authenticateApprovedUser(request);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: "Não foi possível verificar o acesso." }, 500);
  }
  const payload = await request.json() as Partial<ChatRequest>;
  if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > 30 || typeof payload.instructions !== "string" || payload.instructions.length > 250_000) {
    return json({ error: "Solicitação de conversa inválida." }, 400);
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const model = Deno.env.get("OPENAI_MODEL")?.trim();
  if (!apiKey || !model) {
    return json({ error: "O provedor de IA está temporariamente indisponível." }, 503);
  }

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      instructions: payload.instructions,
      input: payload.messages,
      store: false,
      text: { format: { type: "json_schema", name: "glicia_turn", strict: true, schema: turnSchema } }
    })
  });
  if (!openAiResponse.ok) return json({ error: "O provedor de IA não respondeu corretamente." }, openAiResponse.status === 401 ? 502 : openAiResponse.status);
  const openAiPayload = await openAiResponse.json() as Record<string, unknown>;
  const outputText = extractOutputText(openAiPayload);
  if (!outputText) return json({ error: "O provedor de IA devolveu uma resposta inválida." }, 502);
  const resolvedModel = typeof openAiPayload.model === "string" ? openAiPayload.model : model;
  return new Response(JSON.stringify({ id: openAiPayload.id, output_text: outputText, provider: "openai", model: resolvedModel }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
});

function json(body: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function extractOutputText(payload: Record<string, unknown>): string | null {
  if (typeof payload.output_text === "string") return payload.output_text;
  if (!Array.isArray(payload.output)) return null;
  for (const item of payload.output) {
    if (typeof item !== "object" || item === null || !("content" in item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (typeof content === "object" && content !== null && "text" in content && typeof content.text === "string") return content.text;
    }
  }
  return null;
}
