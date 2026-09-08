export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function sendEmail(message: EmailMessage): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY")?.trim();
  if (resendKey) {
    await sendWithResend(message, resendKey);
    return;
  }

  if (isLocalSupabase()) {
    await sendWithMailpit(message);
    return;
  }

  throw new Error("notification_provider_not_configured");
}

export function publicAppUrl(): string {
  const configured = Deno.env.get("PUBLIC_APP_URL")?.trim();
  if (configured) return configured.replace(/\/$/, "");
  if (isLocalSupabase()) return "http://localhost:5173";
  throw new Error("public_app_url_not_configured");
}

export function administratorEmail(): string {
  return Deno.env.get("GLICIA_ADMIN_EMAIL")?.trim() || "glicia.app.admin@gmail.com";
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function sendWithResend(message: EmailMessage, apiKey: string): Promise<void> {
  const from = Deno.env.get("GLICIA_EMAIL_FROM")?.trim();
  if (!from) throw new Error("email_sender_not_configured");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to: [message.to], subject: message.subject, text: message.text, html: message.html })
  });
  if (!response.ok) throw new Error(`resend_failed_${response.status}`);
}

async function sendWithMailpit(message: EmailMessage): Promise<void> {
  const baseUrl = Deno.env.get("MAILPIT_API_URL")?.trim() || "http://host.docker.internal:54324";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/v1/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      From: { Email: "glicia@localhost", Name: "Glicia" },
      To: [{ Email: message.to }],
      Subject: message.subject,
      Text: message.text,
      HTML: message.html,
      Tags: ["glicia"]
    })
  });
  if (!response.ok) throw new Error(`mailpit_failed_${response.status}`);
}

function isLocalSupabase(): boolean {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  if (!url) return false;
  try {
    const hostname = new URL(url).hostname;
    return hostname === "kong" || hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
