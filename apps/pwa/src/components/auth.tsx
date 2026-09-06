import { FormEvent, useState } from "react";

import { AccessServiceError, type AccessService } from "../application";
import { GliciaAvatar } from "./brand/glicia-avatar";
import { GliciaWordmark } from "./brand/glicia-wordmark";

const mailpitUrl = import.meta.env.DEV
  ? import.meta.env.VITE_MAILPIT_URL || "http://127.0.0.1:54324"
  : null;

type AuthStep = "welcome" | "email" | "consent" | "otp" | "link_sent" | "pending" | "unavailable";

type AdminLogin = {
  email: string;
  redirectTo: string;
};

export function Auth({ service, adminLogin }: { service: AccessService; adminLogin?: AdminLogin }) {
  const [step, setStep] = useState<AuthStep>(adminLogin ? "email" : "welcome");
  const [email, setEmail] = useState(adminLogin?.email ?? "");
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const normalizedEmail = email.trim().toLocaleLowerCase("pt-BR");

  async function identify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      if (adminLogin) {
        await sendCode(normalizedEmail);
        return;
      }
      const state = await service.checkAccess(normalizedEmail);
      if (state === "approved") await sendCode(normalizedEmail);
      else if (state === "new") setStep("consent");
      else if (state === "pending") setStep("pending");
      else setStep("unavailable");
    }, "Não foi possível verificar o acesso agora. Tente novamente.");
  }

  async function requestAccess() {
    await run(async () => {
      await service.requestAccess(normalizedEmail);
      setStep("pending");
    }, "Não foi possível entrar na lista agora. Tente novamente.");
  }

  async function verifyCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await run(async () => {
      await service.verifyLoginCode(normalizedEmail, token.replace(/\s/g, ""));
    }, "Código inválido ou expirado. Confira o e-mail ou peça um novo código.");
  }

  async function sendCode(targetEmail: string) {
    const delivery = await service.sendLoginCode(targetEmail, adminLogin?.redirectTo ?? window.location.href);
    setToken("");
    setStep(delivery === "code" ? "otp" : "link_sent");
  }

  async function resendCode() {
    await run(() => sendCode(normalizedEmail), "Não foi possível reenviar o código agora.");
  }

  async function run(action: () => Promise<void>, fallbackMessage: string) {
    setIsSending(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      if (caught instanceof AccessServiceError && caught.code === "not_approved") {
        setStep("unavailable");
        setError("Este e-mail ainda não possui acesso aprovado.");
      } else {
        setError(fallbackMessage);
      }
    } finally {
      setIsSending(false);
    }
  }

  function restart() {
    if (!adminLogin) setEmail("");
    setToken("");
    setError(null);
    setStep("email");
  }

  return (
    <main className="onboarding-shell">
      <header className="app-header auth-header">
        <GliciaWordmark />
      </header>
      {!adminLogin ? <div className="auth-hero" aria-hidden="true">
        <GliciaAvatar size="large" />
      </div> : null}
      <section className="setup-content auth-content" aria-labelledby="auth-title">
        {step === "welcome" ? <>
          <h1 id="auth-title">Contar carboidratos pode ser mais simples.</h1>
          <div className="auth-introduction">
            <p>Oi, eu sou a Glicia! Me conte sua refeição: uso IA para consultar os carboidratos na tabela da Sociedade Brasileira de Diabetes.</p>
            <p>Você confere os alimentos e as porções. Eu faço as contas e sugiro a insulina com os parâmetros do seu tratamento.</p>
          </div>
          <button className="primary-action" type="button" onClick={() => setStep("email")}>Entrar</button>
        </> : null}

        {step === "email" ? <>
          <h1 id="auth-title">{adminLogin ? "Acesso administrativo." : "Entrar na Glicia"}</h1>
          <p id="email-guidance">{adminLogin ? "Confirme sua conta administradora para revisar solicitações." : "A Glicia está em fase experimental e o acesso depende de aprovação."}</p>
          <form onSubmit={identify}>
            <label htmlFor="email">{adminLogin ? "E-mail do administrador" : "Seu e-mail"}</label>
            <input id="email" type="email" autoComplete="email" aria-describedby="email-guidance" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" required readOnly={Boolean(adminLogin)} disabled={isSending} autoFocus={!adminLogin} />
            <button className="primary-action" type="submit" disabled={isSending}>{isSending ? "Verificando…" : "Continuar"}</button>
          </form>
          {!adminLogin ? <button className="text-action auth-back" type="button" disabled={isSending} onClick={() => { setError(null); setStep("welcome"); }}>Voltar à apresentação</button> : null}
        </> : null}

        {step === "consent" ? <>
          <h1 id="auth-title">Vamos dar o primeiro passo?</h1>
          <p>A Glicia está recebendo um grupo pequeno de pessoas nesta fase de testes. Quer colocar <strong>{normalizedEmail}</strong> na lista? Avisaremos quando seu acesso for aprovado.</p>
          <div className="auth-actions"><button className="primary-action" type="button" disabled={isSending} onClick={() => void requestAccess()}>{isSending ? "Enviando…" : "Entrar na lista"}</button><button className="text-action" type="button" disabled={isSending} onClick={restart}>Usar outro e-mail</button></div>
        </> : null}

        {step === "pending" ? <>
          <h1 id="auth-title">Você está na lista.</h1>
          <p>A solicitação de <strong>{normalizedEmail}</strong> aguarda aprovação. Avisaremos por e-mail quando o acesso for liberado.</p>
          <button className="text-action auth-back" type="button" onClick={restart}>Usar outro e-mail</button>
        </> : null}

        {step === "unavailable" ? <>
          <h1 id="auth-title">Acesso indisponível.</h1>
          <p>Este e-mail não possui uma liberação ativa para usar a Glicia.</p>
          <button className="text-action auth-back" type="button" onClick={restart}>Usar outro e-mail</button>
        </> : null}

        {step === "otp" ? <>
          <h1 id="auth-title">Digite o código.</h1>
          <p>Enviamos um código para <strong>{normalizedEmail}</strong>. Confira seu e-mail e digite o código aqui.</p>
          <form onSubmit={verifyCode}>
            <label htmlFor="login-code">Código de acesso</label>
            <input id="login-code" className="otp-input" inputMode="numeric" autoComplete="one-time-code" value={token} onChange={(event) => setToken(event.target.value.replace(/\D/g, "").slice(0, 8))} minLength={6} maxLength={8} pattern="[0-9]{6,8}" required disabled={isSending} autoFocus />
            <button className="primary-action" type="submit" disabled={isSending || token.length < 6}>{isSending ? "Entrando…" : "Entrar"}</button>
          </form>
          <div className="auth-secondary-actions"><button className="text-action" type="button" disabled={isSending} onClick={() => void resendCode()}>Enviar novo código</button><button className="text-action" type="button" disabled={isSending} onClick={restart}>Trocar e-mail</button></div>
          {mailpitUrl ? <a className="mailpit-link" href={mailpitUrl} target="_blank" rel="noreferrer">Abrir Mailpit</a> : null}
        </> : null}

        {step === "link_sent" ? <>
          <h1 id="auth-title">Abra o link enviado.</h1>
          <p>O código não pôde ser entregue agora. Enviamos um link seguro para <strong>{normalizedEmail}</strong> como contingência.</p>
          <div className="auth-secondary-actions"><button className="text-action" type="button" disabled={isSending} onClick={() => void resendCode()}>Tentar o código novamente</button><button className="text-action" type="button" disabled={isSending} onClick={restart}>Trocar e-mail</button></div>
          {mailpitUrl ? <a className="mailpit-link" href={mailpitUrl} target="_blank" rel="noreferrer">Abrir Mailpit</a> : null}
        </> : null}

        {error ? <p className="error-message auth-error" role="alert">{error}</p> : null}
        {step !== "welcome" && (adminLogin || step !== "email") ? <p className="auth-note">{adminLogin ? "Somente a conta administradora pode abrir esta revisão." : "A Glicia está em fase experimental e o acesso depende de aprovação."}</p> : null}
      </section>
    </main>
  );
}

export function AccessNotApproved({ onSignOut }: { onSignOut(): Promise<void> }) {
  return <main className="onboarding-shell"><header className="app-header"><GliciaWordmark /></header><section className="setup-content" aria-labelledby="access-title"><h1 id="access-title">Acesso ainda não liberado.</h1><p>Esta conta não possui uma aprovação ativa.</p><button className="primary-action compact-action" type="button" onClick={() => void onSignOut()}>Voltar à entrada</button></section></main>;
}

export function MissingSupabaseConfiguration() {
  return <main className="onboarding-shell"><header className="app-header"><GliciaWordmark /></header><section className="setup-content" aria-labelledby="configuration-title"><h1 id="configuration-title">A Glicia ainda não está conectada.</h1><p>Configure a URL e a chave publicável do Supabase para abrir sua conta neste ambiente.</p></section></main>;
}
