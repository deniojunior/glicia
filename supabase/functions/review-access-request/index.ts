import { authenticateApprovedUser, requireAdministrator } from "../_shared/auth.ts";
import { corsHeaders, HttpError, json } from "../_shared/http.ts";
import { escapeHtml, publicAppUrl, sendEmail } from "../_shared/notifications.ts";

type ReviewPayload = {
  requestId?: string;
  decision?: "approved" | "rejected";
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user, admin } = await authenticateApprovedUser(request);
    await requireAdministrator(admin, user.id);

    if (request.method === "GET") {
      const { data, error } = await admin
        .from("access_requests")
        .select("id,email_normalized,status,request_count,requested_at,last_requested_at,reviewed_at,user_id")
        .order("last_requested_at", { ascending: false })
        .limit(100);
      if (error) throw new HttpError(500, "Não foi possível abrir as solicitações.", "request_list_failed");
      return json({ requests: data ?? [] });
    }

    if (request.method !== "POST") return json({ error: "Método não permitido." }, 405);
    let payload: ReviewPayload;
    try {
      payload = await request.json();
    } catch {
      throw new HttpError(400, "Solicitação inválida.", "invalid_request");
    }
    if (!isUuid(payload.requestId) || !payload.decision) {
      throw new HttpError(400, "Informe a solicitação e a decisão.", "invalid_request");
    }

    const { data, error } = await admin.rpc("review_access_request_from_edge", {
      p_request_id: payload.requestId,
      p_reviewer_id: user.id,
      p_decision: payload.decision
    });
    const result = Array.isArray(data) ? data[0] : data;
    if (error || !result) {
      const status = error?.code === "23514" ? 409 : error?.code === "P0002" ? 404 : 500;
      throw new HttpError(status, status === 409 ? "Esta solicitação já possui outra decisão." : "Não foi possível revisar a solicitação.", error?.code ?? "review_failed");
    }

    if (result.should_notify) {
      try {
        const loginUrl = `${publicAppUrl()}/?mode=login`;
        const approved = result.status === "approved";
        const safeUrl = escapeHtml(loginUrl);
        await sendEmail({
          to: result.email_normalized,
          subject: approved ? "Seu acesso à Glicia foi liberado" : "Atualização sobre seu acesso à Glicia",
          text: approved
            ? `Seu acesso à Glicia foi liberado. Entre com seu e-mail em: ${loginUrl}`
            : "Sua solicitação de acesso à Glicia não foi aprovada neste momento.",
          html: approved
            ? `<p>Seu acesso à Glicia foi liberado.</p><p><a href="${safeUrl}">Entrar na Glicia</a></p>`
            : "<p>Sua solicitação de acesso à Glicia não foi aprovada neste momento.</p>"
        });
        const { error: markError } = await admin.rpc("mark_access_notification_from_edge", {
          p_request_id: result.request_id,
          p_kind: "decision"
        });
        if (markError) console.error("review notification mark failed", { code: markError.code });
      } catch (notificationError) {
        console.error("review notification failed", {
          code: notificationError instanceof Error ? notificationError.message : "unknown"
        });
        const { error: releaseError } = await admin.rpc("release_access_notification_from_edge", {
          p_request_id: result.request_id,
          p_kind: "decision"
        });
        if (releaseError) console.error("review notification release failed", { code: releaseError.code });
      }
    }

    return json({ request: result });
  } catch (error) {
    if (error instanceof HttpError) return json({ error: error.message, code: error.code }, error.status);
    console.error("review-access-request failed", { code: error instanceof Error ? error.message : "unknown" });
    return json({ error: "Não foi possível concluir a operação." }, 500);
  }
});

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
