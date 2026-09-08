import { useCallback, useEffect, useState } from "react";

import type { AccessRequestStatus, AccessRequestSummary, AccessService, AiAdminControls } from "../application";
import { GliciaWordmark } from "./brand/glicia-wordmark";

const statusLabels: Record<AccessRequestStatus, string> = {
  pending: "Aguardando",
  approved: "Aprovado",
  rejected: "Não aprovado"
};

export function AdminAccessRequests({ service, onSignOut }: { service: AccessService; onSignOut(): Promise<void> }) {
  const [requests, setRequests] = useState<readonly AccessRequestSummary[] | null>(null);
  const [controls, setControls] = useState<AiAdminControls | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const highlightedId = new URLSearchParams(window.location.search).get("request");
  const [section, setSection] = useState<"menu" | "requests" | "costs">(highlightedId ? "requests" : "menu");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [nextRequests, nextControls] = await Promise.all([service.listAccessRequests(), service.getAiAdminControls()]);
      setRequests(nextRequests);
      setControls(nextControls);
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

  async function toggleAi() {
    if (!controls) return;
    setActiveId("ai-control"); setError(null);
    try { await service.setAiEnabled(!controls.enabled); await load(); }
    catch { setError("Não foi possível alterar a disponibilidade da IA."); }
    finally { setActiveId(null); }
  }

  async function toggleAccess(request: AccessRequestSummary) {
    if (!request.userId) return;
    setActiveId(request.id); setError(null);
    try { await service.setAccessSuspended(request.userId, !request.accessSuspended); await load(); }
    catch { setError("Não foi possível alterar o acesso desta conta."); }
    finally { setActiveId(null); }
  }

  return (
    <main className="admin-shell">
      <header className="app-header">
        <GliciaWordmark link />
        {section !== "menu" ? <button className="admin-menu-action" type="button" onClick={() => setSection("menu")}><BackIcon /> Menu</button> : null}
      </header>
      <section className="admin-content" aria-labelledby="admin-title">
        {error ? <p className="error-message" role="alert">{error}</p> : null}
        {section === "menu" ? <AdminMenu requests={requests} controls={controls} onOpenRequests={() => setSection("requests")} onOpenCosts={() => setSection("costs")} onSignOut={onSignOut} /> : null}
        {section === "costs" ? <>
          <div className="admin-heading"><div><p className="eyebrow">Administração</p><h1 id="admin-title">Custos e uso da IA</h1><p>Acompanhe os limites e a disponibilidade das análises.</p></div><button className="refresh-action" type="button" onClick={() => void load()}>Atualizar</button></div>
          {controls ? <CostDashboard controls={controls} activeId={activeId} onToggleAi={toggleAi} /> : <p className="waiting">Carregando custos…</p>}
        </> : null}
        {section === "requests" ? <>
          <div className="admin-heading"><div><p className="eyebrow">Administração</p><h1 id="admin-title">Solicitações de acesso</h1><p>Revise quem poderá participar do experimento.</p></div><button className="refresh-action" type="button" onClick={() => void load()}>Atualizar</button></div>
          {requests === null ? <p className="waiting">Abrindo solicitações…</p> : requests.length === 0 ? <p className="admin-empty">Nenhuma solicitação recebida.</p> : (
          <ul className="access-request-list">
            {requests.map((request) => (
              <li key={request.id} className={request.id === highlightedId ? "highlighted" : ""}>
                <div className="request-main"><strong>{request.email}</strong><span className={`request-status ${request.status}`}>{statusLabels[request.status]}</span></div>
                <p>Solicitado em {formatDate(request.lastRequestedAt)}{request.requestCount > 1 ? ` · ${request.requestCount} tentativas` : ""}</p>
                {request.status === "pending" ? <div className="review-actions"><button className="approve-action" type="button" disabled={activeId === request.id} onClick={() => void review(request.id, "approved")}>{activeId === request.id ? "Salvando…" : "Aprovar"}</button><button className="reject-action" type="button" disabled={activeId === request.id} onClick={() => void review(request.id, "rejected")}>Não aprovar</button></div> : null}
                {request.status === "approved" && request.userId ? <div className="review-actions"><button className={request.accessSuspended ? "approve-action" : "reject-action"} type="button" disabled={activeId === request.id} onClick={() => void toggleAccess(request)}>{activeId === request.id ? "Salvando…" : request.accessSuspended ? "Reativar acesso" : "Suspender acesso"}</button></div> : null}
              </li>
            ))}
          </ul>
          )}
        </> : null}
      </section>
    </main>
  );
}

function CostDashboard({ controls, activeId, onToggleAi }: { controls: AiAdminControls; activeId: string | null; onToggleAi(): Promise<void> }) {
  const dailyUsage = Math.min(100, controls.estimatedCostTodayMicrousd / controls.globalDailyCostLimitMicrousd * 100);
  const successRate = percentage(controls.completedToday, controls.completedToday + controls.failedToday);
  return <div className="cost-dashboard">
    <section className="cost-overview" aria-labelledby="cost-month-title">
      <p className="eyebrow">Custo neste mês</p>
      <p className="cost-primary" id="cost-month-title">{formatCost(controls.estimatedCostMonthMicrousd)}</p>
      <p>Projeção até o fim do mês: <strong>{formatCost(controls.projectedMonthCostMicrousd)}</strong></p>
      <div className="cost-facts">
        <div><span>Hoje</span><strong>{formatCost(controls.estimatedCostTodayMicrousd)}</strong></div>
        <div><span>Média por análise</span><strong>{formatCost(controls.averageCostPerAnalysisMicrousd)}</strong></div>
      </div>
      <div className="cost-limit"><div><span>Limite diário</span><strong>{dailyUsage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% usado</strong></div><progress value={dailyUsage} max="100">{dailyUsage}%</progress><small>{formatCost(controls.estimatedCostTodayMicrousd)} de {formatCost(controls.globalDailyCostLimitMicrousd)}</small></div>
    </section>

    <section className="product-overview" aria-labelledby="product-today-title">
      <div className="section-title"><p className="eyebrow">Produto</p><h2 id="product-today-title">Uso real</h2></div>
      <dl className="product-metrics">
        <div><dt>Análises concluídas hoje</dt><dd>{controls.completedToday}</dd></div>
        <div><dt>Pessoas ativas hoje</dt><dd>{controls.activeUsersToday}</dd></div>
        <div><dt>Taxa de sucesso hoje</dt><dd>{successRate}</dd></div>
        <div><dt>Tempo médio de resposta</dt><dd>{formatDuration(controls.averageLatencyMs)}</dd></div>
        <div><dt>Análises neste mês</dt><dd>{controls.completedMonth}</dd></div>
        <div><dt>Pessoas ativas no mês</dt><dd>{controls.activeUsersMonth}</dd></div>
      </dl>
      <p className="metrics-note">Uma pessoa é considerada ativa quando conclui uma chamada ou recebe uma falha do provedor. Custos são estimados pelos tokens registrados.</p>
    </section>

    <section className="ai-operation" aria-labelledby="ai-admin-title">
      <div><p className="eyebrow">Operação</p><h2 id="ai-admin-title">{controls.enabled ? "IA disponível" : "IA pausada"}</h2><p>{controls.activeRequests} de {controls.maxConcurrentRequests} chamadas simultâneas agora · {formatCompact(controls.tokensMonth)} tokens neste mês</p></div>
      <button className={controls.enabled ? "reject-action" : "approve-action"} type="button" disabled={activeId === "ai-control"} onClick={() => void onToggleAi()}>{activeId === "ai-control" ? "Salvando…" : controls.enabled ? "Pausar IA" : "Reativar IA"}</button>
    </section>
  </div>;
}

function AdminMenu({ requests, controls, onOpenRequests, onOpenCosts, onSignOut }: { requests: readonly AccessRequestSummary[] | null; controls: AiAdminControls | null; onOpenRequests(): void; onOpenCosts(): void; onSignOut(): Promise<void> }) {
  const pending = requests?.filter((request) => request.status === "pending").length ?? null;
  return <div className="admin-menu">
    <div className="admin-menu-heading"><p className="eyebrow">Glicia</p><h1 id="admin-title">Administração</h1><p>Escolha o que você quer acompanhar.</p></div>
    <div className="admin-menu-list">
      <button type="button" onClick={onOpenRequests}><span className="admin-menu-icon"><PeopleIcon /></span><span><strong>Solicitações de acesso</strong><small>{pending === null ? "Carregando…" : pending === 0 ? "Nenhuma aguardando revisão" : `${pending} ${pending === 1 ? "aguardando" : "aguardando"}`}</small></span><ChevronIcon /></button>
      <button type="button" onClick={onOpenCosts}><span className="admin-menu-icon"><ChartIcon /></span><span><strong>Custos e uso da IA</strong><small>{controls ? `${formatCost(controls.estimatedCostTodayMicrousd)} usados hoje` : "Carregando…"}</small></span><ChevronIcon /></button>
    </div>
    <button className="admin-sign-out" type="button" onClick={() => void onSignOut()}><ExitIcon /> Sair da administração</button>
  </div>;
}

function BackIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6" /></svg>; }
function ChevronIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>; }
function PeopleIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>; }
function ChartIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></svg>; }
function ExitIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /></svg>; }

function formatCompact(value: number): string { return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(value); }
function formatCost(microusd: number): string { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: microusd > 0 && microusd < 10_000 ? 4 : 2 }).format(microusd / 1_000_000); }
function percentage(part: number, total: number): string { return total === 0 ? "—" : `${Math.round(part / total * 100)}%`; }
function formatDuration(milliseconds: number): string { return milliseconds === 0 ? "—" : milliseconds < 1_000 ? `${milliseconds} ms` : `${(milliseconds / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`; }

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}
