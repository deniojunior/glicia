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

  let payload: { email?: string; action?: "check" | "request" | "login_code"; redirectTo?: string };
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Solicitação inválida." }, 400);
  }

  const email = payload.email?.trim().toLocaleLowerCase("en-US") ?? "";
  if (!isValidEmail(email)) return json({ error: "Informe um e-mail válido." }, 400);
  const action = payload.action ?? "request";
  if (action !== "check" && action !== "request" && action !== "login_code") {
    return json({ error: "Ação de acesso inválida." }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  if (action === "check" || action === "login_code") {
    const clientHash = await hashClient(request);
    const { data: state, error: stateError } = await admin.rpc("access_entry_state_from_edge", {
      p_email: email,
      p_client_hash: clientHash
    });
    if (state === "rate_limited") {
      return json({ error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." }, 429);
    }
    if (stateError || (!isAccessState(state) && state !== "rate_limited")) {
      console.error("request-access state failed", { code: stateError?.code ?? "invalid_state" });
      return json({ error: "Não foi possível verificar o acesso agora. Tente novamente." }, 500);
    }
    if (action === "check") return json({ state });
    if (state !== "approved") return json(acceptedResponse, 202);

    let redirectTo: string;
    try {
      redirectTo = allowedRedirect(payload.redirectTo);
    } catch {
      return json({ error: "Destino de entrada inválido." }, 400);
    }
    const { data: generated, error: generateError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo }
    });
    const code = generated?.properties?.email_otp;
    const actionLink = generated?.properties?.action_link;
    if (generateError || !code || !actionLink) {
      console.error("request-access login code generation failed", { code: generateError?.code ?? "missing_properties" });
      return json({ error: "Não foi possível gerar o código agora. Tente novamente." }, 500);
    }
    try {
      const safeCode = escapeHtml(code);
      const safeLink = escapeHtml(actionLink);
      await sendEmail({
        to: email,
        subject: `${code} é seu código da Glicia`,
        text: `Seu código de acesso à Glicia é ${code}. Se preferir, use o link: ${actionLink}`,
        html: `<p>Seu código de acesso à Glicia é:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${safeCode}</p><p>Digite o código na Glicia. Se precisar, <a href="${safeLink}">use este link como contingência</a>.</p>`
      });
    } catch (sendError) {
      console.error("request-access login code delivery failed", {
        code: sendError instanceof Error ? sendError.message : "unknown"
      });
      return json({ error: "Não foi possível enviar o código agora. Tente novamente." }, 500);
    }
    return json({ sent: true });
  }

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

function isAccessState(value: unknown): value is "new" | "pending" | "approved" | "rejected" | "revoked" {
  return typeof value === "string" && ["new", "pending", "approved", "rejected", "revoked"].includes(value);
}

async function hashClient(request: Request): Promise<string> {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("cf-connecting-ip") || "unknown";
  const userAgent = request.headers.get("user-agent")?.slice(0, 200) || "unknown";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${address}|${userAgent}`));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function allowedRedirect(candidate?: string): string {
  const base = new URL(publicAppUrl());
  const destination = candidate ? new URL(candidate) : base;
  if (destination.origin !== base.origin) throw new Error("redirect_origin_not_allowed");
  return destination.toString();
}
