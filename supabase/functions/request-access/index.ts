import { createClient } from "npm:@supabase/supabase-js@2.57.0";

import { corsHeaders, json } from "../_shared/http.ts";
import { administratorEmail, escapeHtml, publicAppUrl, sendEmail } from "../_shared/notifications.ts";

const acceptedResponse = {
  accepted: true,
  message: "Se o endereço puder participar, você receberá uma mensagem quando o acesso for liberado."
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);

  let payload: { email?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }

  const email = payload.email?.trim().toLocaleLowerCase("en-US") ?? "";
  if (!isValidEmail(email)) return json({ error: "Informe um e-mail válido." }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  const { data, error } = await admin.rpc("submit_access_request_from_edge", { p_email: email });
  const result = Array.isArray(data) ? data[0] : data;
  if (error || !result?.request_id) {
    console.error("request-access failed", { code: error?.code ?? "missing_data" });
    return json({ error: "Não foi possível registrar a solicitação agora. Tente novamente." }, 500);
  }

  if (result.should_notify) {
    try {
      const reviewUrl = `${publicAppUrl()}/admin/access-requests?request=${encodeURIComponent(result.request_id)}`;
      const safeEmail = escapeHtml(email);
      const safeUrl = escapeHtml(reviewUrl);
      await sendEmail({
        to: administratorEmail(),
        subject: "Nova solicitação de acesso à Glicia",
        text: `${email} solicitou acesso à Glicia. Revise em: ${reviewUrl}`,
        html: `<p><strong>${safeEmail}</strong> solicitou acesso à Glicia.</p><p><a href="${safeUrl}">Revisar solicitação</a></p>`
      });
      const { error: markError } = await admin.rpc("mark_access_notification_from_edge", {
        p_request_id: result.request_id,
        p_kind: "admin"
      });
      if (markError) console.error("request-access notification mark failed", { code: markError.code });
    } catch (notificationError) {
      console.error("request-access notification failed", {
        code: notificationError instanceof Error ? notificationError.message : "unknown"
      });
      const { error: releaseError } = await admin.rpc("release_access_notification_from_edge", {
        p_request_id: result.request_id,
        p_kind: "admin"
      });
      if (releaseError) console.error("request-access notification release failed", { code: releaseError.code });
    }
  }

  return json(acceptedResponse, 202);
});

function isValidEmail(email: string): boolean {
  return email.length >= 3
    && email.length <= 320
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
