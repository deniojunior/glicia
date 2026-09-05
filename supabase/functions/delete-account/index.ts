import { authenticateApprovedUser } from "../_shared/auth.ts";
import { HttpError } from "../_shared/http.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  try {
    const { user, admin } = await authenticateApprovedUser(request);
    const payload = await request.json() as { confirmation?: unknown };
    if (payload.confirmation !== "EXCLUIR") {
      return json({ error: "Confirmação de exclusão inválida." }, 400);
    }
    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    if (error) throw error;
    return json({ deleted: true });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message }, error.status);
    return json({ error: "Não foi possível excluir a conta. Tente novamente." }, 500);
  }
});

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
