import { authenticateApprovedUser, type AuthenticatedClients } from "../_shared/auth.ts";
import { HttpError } from "../_shared/http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  let authenticated: AuthenticatedClients;
  try {
    authenticated = await authenticateApprovedUser(request);
  } catch (error) {
    if (error instanceof HttpError) return reply({ error: error.message, code: error.code }, error.status);
    return reply({ error: "Não foi possível verificar o acesso." }, 500);
  }
  const { user, admin } = authenticated;
  let payload: { provider?: string; model?: string; apiKey?: string };
  try {
    payload = await request.json();
  } catch {
    return reply({ code: "invalid_request", error: "Solicitação inválida." }, 400);
  }
  if (payload.provider !== "openai" || !payload.model?.trim() || !payload.apiKey?.trim()) {
    return reply({ code: "invalid_request", error: "Informe provedor, modelo e chave." }, 400);
  }

  try {
    const validation = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${payload.apiKey.trim()}` }
    });
    if (!validation.ok) {
      return reply({ code: "invalid_openai_key", error: "A chave OpenAI não foi aceita." }, 400);
    }
  } catch {
    return reply({ code: "openai_unavailable", error: "Não foi possível validar a chave na OpenAI." }, 502);
  }

  const { data, error } = await admin.rpc("store_ai_connection_from_edge", {
    p_user_id: user.id,
    p_provider: payload.provider,
    p_model: payload.model.trim(),
    p_api_key: payload.apiKey.trim()
  });
  if (error || !data) {
    console.error("store-ai-connection failed", { code: error?.code ?? "missing_data" });
    return reply({ code: "connection_store_failed", error: "Não foi possível guardar a conexão com segurança." }, 500);
  }

  const connection = Array.isArray(data) ? data[0] : data;
  if (!connection) {
    return reply({ code: "connection_store_failed", error: "Não foi possível guardar a conexão com segurança." }, 500);
  }
  return reply({
    provider: connection.provider,
    model: connection.model,
    connectedAt: connection.connected_at
  });
});

function reply(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
