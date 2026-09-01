import postgres from "npm:postgres@3.4.7";

import { authenticateApprovedUser, type AuthenticatedClients } from "../_shared/auth.ts";
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

  let authenticated: AuthenticatedClients;
  try {
    authenticated = await authenticateApprovedUser(request);
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: "Não foi possível verificar o acesso." }, 500);
  }
  const { user, admin } = authenticated;

  const payload = await request.json() as Partial<ChatRequest>;
  if (!Array.isArray(payload.messages) || payload.messages.length === 0 || payload.messages.length > 30 || typeof payload.instructions !== "string" || payload.instructions.length > 250_000) {
    return json({ error: "Solicitação de conversa inválida." }, 400);
  }

  const { data: connection, error: connectionError } = await admin
    .from("ai_connections")
    .select("provider, vault_secret_id")
    .eq("user_id", user.id)
    .eq("provider", "openai")
    .maybeSingle();
  if (connectionError || !connection) return json({ error: "Nenhum provedor de IA configurado." }, 409);
  const { data: preferences, error: preferencesError } = await admin
    .from("user_preferences")
    .select("model")
    .eq("user_id", user.id)
    .maybeSingle();
  if (preferencesError || !preferences?.model) return json({ error: "Modelo de IA não configurado." }, 409);

  const sql = postgres(Deno.env.get("SUPABASE_DB_URL")!, { prepare: false, max: 1 });
  const [secret] = await sql<{ decrypted_secret: string }[]>`
    select decrypted_secret
    from vault.decrypted_secrets
    where id = ${connection.vault_secret_id}
    limit 1
  `;
  await sql.end({ timeout: 2 });
  if (!secret?.decrypted_secret) return json({ error: "Não foi possível acessar a conexão de IA." }, 502);

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret.decrypted_secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: preferences.model,
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
  return new Response(JSON.stringify({ id: openAiPayload.id, output_text: outputText }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
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
