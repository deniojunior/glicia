import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return reply({ error: "Sessão autenticada obrigatória." }, 401);
  const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authorization } }
  });
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return reply({ error: "Sessão autenticada obrigatória." }, 401);
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
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
