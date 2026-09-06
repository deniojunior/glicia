import { useCallback, useEffect, useState } from "react";

import type { AccessRequestStatus, AccessRequestSummary, AccessService } from "../application";
import { GliciaWordmark } from "./brand/glicia-wordmark";

const statusLabels: Record<AccessRequestStatus, string> = {
  pending: "Aguardando",
  approved: "Aprovado",
  rejected: "Não aprovado"
};

export function AdminAccessRequests({ service, onSignOut }: { service: AccessService; onSignOut(): Promise<void> }) {
  const [requests, setRequests] = useState<readonly AccessRequestSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const highlightedId = new URLSearchParams(window.location.search).get("request");

  const load = useCallback(async () => {
    setError(null);
    try {
      setRequests(await service.listAccessRequests());
    } catch {
      setError("Não foi possível abrir as solicitações. Confirme se esta conta é administradora.");
    }
  }, [service]);

  useEffect(() => { void load(); }, [load]);

  async function review(requestId: string, decision: "approved" | "rejected") {
    setActiveId(requestId);
    setError(null);
    try {
      await service.reviewAccessRequest(requestId, decision);
      await load();
    } catch {
      setError("Não foi possível registrar a decisão. Atualize a lista e tente novamente.");
    } finally {
      setActiveId(null);
    }
  }

  return (
    <main className="admin-shell">
      <header className="app-header">
        <GliciaWordmark link />
        <button className="text-action" type="button" onClick={() => void onSignOut()}>Sair</button>
      </header>
      <section className="admin-content" aria-labelledby="admin-title">
        <div className="admin-heading"><div><h1 id="admin-title">Solicitações de acesso</h1><p>Revise quem poderá participar do experimento.</p></div><button className="refresh-action" type="button" onClick={() => void load()}>Atualizar</button></div>
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        {requests === null ? <p className="waiting">Abrindo solicitações…</p> : requests.length === 0 ? <p className="admin-empty">Nenhuma solicitação recebida.</p> : (
          <ul className="access-request-list">
            {requests.map((request) => (
              <li key={request.id} className={request.id === highlightedId ? "highlighted" : ""}>
                <div className="request-main"><strong>{request.email}</strong><span className={`request-status ${request.status}`}>{statusLabels[request.status]}</span></div>
                <p>Solicitado em {formatDate(request.lastRequestedAt)}{request.requestCount > 1 ? ` · ${request.requestCount} tentativas` : ""}</p>
                {request.status === "pending" ? <div className="review-actions"><button className="approve-action" type="button" disabled={activeId === request.id} onClick={() => void review(request.id, "approved")}>{activeId === request.id ? "Salvando…" : "Aprovar"}</button><button className="reject-action" type="button" disabled={activeId === request.id} onClick={() => void review(request.id, "rejected")}>Não aprovar</button></div> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
