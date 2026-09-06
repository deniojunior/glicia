import { useState } from "react";
import { GliciaWordmark } from "./brand/glicia-wordmark";

export function Account({ onBack, onDeleteAccount }: { onBack(): void; onDeleteAccount(): Promise<void> }) {
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function deleteAccount() {
    if (confirmation !== "EXCLUIR") return;
    setIsDeleting(true); setMessage(null);
    try { await onDeleteAccount(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível excluir sua conta."); setIsDeleting(false); }
  }
  return <main className="onboarding-shell"><header className="app-header"><GliciaWordmark /><button className="back-action" type="button" onClick={onBack}><span aria-hidden="true">←</span> Voltar ao chat</button></header><section className="setup-content" aria-labelledby="account-title"><h1 id="account-title">Sua conta</h1><p>Gerencie os dados associados à sua conta da Glicia.</p><section className="danger-zone" aria-labelledby="delete-account-title"><h2 id="delete-account-title">Excluir conta e dados</h2><p>Isso remove suas configurações, memória alimentar, histórico e acesso. Esta ação não pode ser desfeita.</p><label htmlFor="delete-confirmation">Digite EXCLUIR para confirmar</label><input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /><button className="danger-action" type="button" disabled={confirmation !== "EXCLUIR" || isDeleting} onClick={() => void deleteAccount()}>{isDeleting ? "Excluindo…" : "Excluir minha conta"}</button></section>{message ? <p className="error-message" role="alert">{message}</p> : null}</section></main>;
}
