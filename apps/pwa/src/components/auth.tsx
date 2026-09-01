import { FormEvent, useState } from "react";

import { AccessServiceError, type AccessService } from "../application";
import { gliciaIconUrl } from "../config/app-urls";

const mailpitUrl = import.meta.env.DEV
  ? import.meta.env.VITE_MAILPIT_URL || "http://127.0.0.1:54324"
  : null;

type AuthMode = "request" | "login";

type AdminLogin = {
  email: string;
  redirectTo: string;
};

export function Auth({ service, initialMode, adminLogin }: { service: AccessService; initialMode?: AuthMode; adminLogin?: AdminLogin }) {
  const [mode, setMode] = useState<AuthMode>(adminLogin ? "login" : initialMode ?? initialAuthMode());
  const [email, setEmail] = useState(adminLogin?.email ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setError(null);
    setStatus(null);
    try {
      if (mode === "request") {
        await service.requestAccess(email.trim());
        setStatus("Solicitação recebida. Avisaremos por e-mail quando seu acesso for analisado.");
      } else {
        const redirectTo = adminLogin?.redirectTo ?? new URL(import.meta.env.BASE_URL, window.location.origin).toString();
        await service.sendLoginLink(email.trim(), redirectTo);
        setStatus(adminLogin
          ? "Enviamos o link para a conta administradora. Abra-o neste aparelho para voltar à revisão."
          : "Enviamos um link para entrar. Abra-o neste aparelho para continuar.");
      }
    } catch (caught) {
      if (caught instanceof AccessServiceError && caught.code === "not_approved") {
        setError(adminLogin
          ? "A conta administradora ainda não foi provisionada neste ambiente. Confira a configuração do acesso administrativo."
          : "Este e-mail ainda não foi aprovado. Solicite acesso para participar do experimento.");
      } else {
        setError(mode === "request"
          ? "Não foi possível enviar sua solicitação. Tente novamente."
          : "Não foi possível enviar o link. Confira o e-mail e tente novamente.");
      }
    } finally {
      setIsSending(false);
    }
  }

  function changeMode(next: AuthMode) {
    setMode(next);
    setStatus(null);
    setError(null);
  }

  const isRequest = mode === "request";
  return (
    <main className="onboarding-shell">
      <header className="app-header">
        <span className="brand"><img src={gliciaIconUrl} width="44" height="44" alt="" /><span>Glicia</span></span>
      </header>
      <section className="setup-content auth-content" aria-labelledby="auth-title">
        <h1 id="auth-title">{adminLogin ? "Acesso administrativo." : isRequest ? "Peça acesso à Glicia." : "Entre na Glicia."}</h1>
        <p>{adminLogin
          ? "Esta revisão só pode ser aberta pela conta administradora. Enviaremos um link de acesso para o e-mail abaixo."
          : isRequest
          ? "Estamos liberando a experiência para um grupo pequeno. Cadastre seu e-mail para participar."
          : "Use o e-mail que foi aprovado. Você receberá um link seguro, sem precisar de senha."}</p>

        {!adminLogin ? <div className="auth-mode" aria-label="Escolha como continuar">
          <button type="button" className={isRequest ? "selected" : ""} aria-pressed={isRequest} onClick={() => changeMode("request")}>Solicitar acesso</button>
          <button type="button" className={!isRequest ? "selected" : ""} aria-pressed={!isRequest} onClick={() => changeMode("login")}>Já fui aprovado</button>
        </div> : null}

        <form onSubmit={submit}>
          <label htmlFor="email">{adminLogin ? "E-mail do administrador" : "Seu e-mail"}</label>
          <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" required readOnly={Boolean(adminLogin)} disabled={isSending} />
          <button className="primary-action" type="submit" disabled={isSending}>{isSending ? "Enviando…" : isRequest ? "Pedir acesso" : adminLogin ? "Enviar link administrativo" : "Enviar link para entrar"}</button>
        </form>

        {status ? <div className="auth-success" role="status"><p>{status}</p>{mailpitUrl ? <a className="mailpit-link" href={mailpitUrl} target="_blank" rel="noreferrer">Abrir Mailpit</a> : null}</div> : null}
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        <p className="auth-note">{adminLogin
          ? "O e-mail da pessoa que pediu acesso não entra nesta área administrativa."
          : "A Glicia está em fase experimental. O cadastro não garante aprovação imediata."}</p>
      </section>
    </main>
  );
}

export function AccessNotApproved({ onSignOut }: { onSignOut(): Promise<void> }) {
  return <main className="onboarding-shell"><header className="app-header"><span className="brand"><img src={gliciaIconUrl} width="44" height="44" alt="" /><span>Glicia</span></span></header><section className="setup-content" aria-labelledby="access-title"><h1 id="access-title">Acesso ainda não liberado.</h1><p>Esta conta não possui uma aprovação ativa. Saia e solicite acesso com o e-mail que deseja utilizar.</p><button className="primary-action compact-action" type="button" onClick={() => void onSignOut()}>Voltar à entrada</button></section></main>;
}

export function MissingSupabaseConfiguration() {
  return <main className="onboarding-shell"><header className="app-header"><span className="brand"><img src={gliciaIconUrl} width="44" height="44" alt="" /><span>Glicia</span></span></header><section className="setup-content" aria-labelledby="configuration-title"><h1 id="configuration-title">A Glicia ainda não está conectada.</h1><p>Configure a URL e a chave publicável do Supabase para abrir sua conta neste ambiente.</p></section></main>;
}

function initialAuthMode(): AuthMode {
  return new URLSearchParams(window.location.search).get("mode") === "login" ? "login" : "request";
}
