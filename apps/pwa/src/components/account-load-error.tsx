import { GliciaWordmark } from "./brand/glicia-wordmark";

export function AccountLoadError({ onRetry, onSignOut }: { onRetry(): void; onSignOut(): Promise<void> }) {
  return <main className="onboarding-shell">
    <header className="app-header"><GliciaWordmark /></header>
    <section className="setup-content recovery-content" aria-labelledby="account-load-title">
      <h1 id="account-load-title">Não consegui abrir sua conta.</h1>
      <p role="alert">Confira sua conexão e tente novamente. Seus ajustes e seu histórico continuam salvos.</p>
      <div className="recovery-actions">
        <button className="primary-action" type="button" onClick={onRetry}>Tentar novamente</button>
        <button className="secondary-action" type="button" onClick={() => void onSignOut()}>Sair da conta</button>
      </div>
    </section>
  </main>;
}
