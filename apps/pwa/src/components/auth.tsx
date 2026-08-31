import { FormEvent, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

const mailpitUrl = import.meta.env.DEV
  ? import.meta.env.VITE_MAILPIT_URL || "http://127.0.0.1:54324"
  : null;

export function Auth({ client }: { client: SupabaseClient }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(null);
    const { error: signInError } = await client.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: new URL(import.meta.env.BASE_URL, window.location.origin).toString() }
    });
    setIsSending(false);
    if (signInError) { setError("Não foi possível enviar o link de acesso. Confira o e-mail e tente novamente."); return; }
    setStatus("Enviamos um link de acesso para seu e-mail. Abra-o neste aparelho para continuar.");
  }

  return <main className="onboarding-shell"><header className="app-header"><span className="brand"><img src="/icons/glicia-192.png" width="44" height="44" alt="" /><span>Glicia</span></span></header><section className="setup-content auth-content" aria-labelledby="auth-title"><h1 id="auth-title">Entre para usar a Glicia.</h1><p>Seu histórico, preferências e conexão de IA ficam associados à sua conta.</p><form onSubmit={submit}><label htmlFor="email">Seu e-mail</label><input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" required disabled={isSending} /><button className="primary-action" type="submit" disabled={isSending}>{isSending ? "Enviando…" : "Enviar link de acesso"}</button></form>{status ? <div className="auth-success" role="status"><p>{status}</p>{mailpitUrl ? <a className="mailpit-link" href={mailpitUrl} target="_blank" rel="noreferrer">Abrir Mailpit</a> : null}</div> : null}{error ? <p className="error-message" role="alert">{error}</p> : null}</section></main>;
}

export function MissingSupabaseConfiguration() {
  return <main className="onboarding-shell"><header className="app-header"><span className="brand"><img src="/icons/glicia-192.png" width="44" height="44" alt="" /><span>Glicia</span></span></header><section className="setup-content" aria-labelledby="configuration-title"><h1 id="configuration-title">A Glicia ainda não está conectada.</h1><p>Configure a URL e a chave publicável do Supabase para abrir sua conta neste ambiente.</p></section></main>;
}
