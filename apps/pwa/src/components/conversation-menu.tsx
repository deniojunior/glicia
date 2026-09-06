import { useId, useRef, useState } from "react";

interface ConversationMenuProps {
  onOpenHistory(): void;
  onOpenSettings(): void;
  onOpenAccount(): void;
  onSignOut(): void;
  isSigningOut: boolean;
}

export function ConversationMenu({ onOpenHistory, onOpenSettings, onOpenAccount, onSignOut, isSigningOut }: ConversationMenuProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const dialogId = useId();
  const [open, setOpen] = useState(false);

  function choose(action: () => void) {
    dialog.current?.close();
    action();
  }

  return <>
    <button className="conversation-menu-trigger" type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={dialogId} onClick={() => { dialog.current?.showModal(); setOpen(true); }}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      <span>Menu</span>
    </button>
    <dialog className="conversation-menu" id={dialogId} ref={dialog} aria-labelledby={titleId} onClose={() => setOpen(false)} onClick={(event) => { if (event.target === event.currentTarget) dialog.current?.close(); }}>
      <div className="conversation-menu-content">
        <header><h2 id={titleId}>Sua Glicia</h2><button className="conversation-menu-close" type="button" aria-label="Fechar menu" autoFocus onClick={() => dialog.current?.close()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button></header>
        <nav aria-label="Opções da conversa">
          <button type="button" onClick={() => choose(onOpenHistory)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7M12 7v5l3 2" /></svg><span><strong>Histórico</strong><small>Reveja suas refeições</small></span><span aria-hidden="true">›</span></button>
          <button type="button" onClick={() => choose(onOpenSettings)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></svg><span><strong>Ajustes</strong><small>Confira seus parâmetros</small></span><span aria-hidden="true">›</span></button>
          <button type="button" onClick={() => choose(onOpenAccount)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3" /><path d="M5 21c.8-4 3.1-6 7-6s6.2 2 7 6" /></svg><span><strong>Conta</strong><small>Gerencie seus dados</small></span><span aria-hidden="true">›</span></button>
        </nav>
        <button className="conversation-menu-logout" type="button" disabled={isSigningOut} onClick={() => choose(onSignOut)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4H4v16h5m6-13 5 5-5 5M9 12h11" /></svg>{isSigningOut ? "Saindo…" : "Sair da conta"}</button>
      </div>
    </dialog>
  </>;
}
