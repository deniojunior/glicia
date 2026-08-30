import { useEffect, useState } from "react";

import type { MealHistoryRepository, MealRecord } from "../application";

export function History({ repository, onBack }: { repository: MealHistoryRepository; onBack(): void }) {
  const [records, setRecords] = useState<readonly MealRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { void repository.list().then(setRecords).catch(() => setError("Não foi possível abrir o histórico local.")); }, [repository]);
  return <main className="onboarding-shell"><header className="app-header"><span className="brand"><img src="/icons/glicia-192.png" width="44" height="44" alt="" /><span>Glicia</span></span><button className="text-action" type="button" onClick={onBack}>Voltar</button></header><section className="setup-content" aria-labelledby="history-title"><h1 id="history-title">Histórico</h1>{error ? <p className="error-message" role="alert">{error}</p> : null}{records === null ? <p className="waiting">Abrindo registros…</p> : records.length === 0 ? <p className="empty-history">As refeições confirmadas aparecerão aqui.</p> : <ol className="history-list">{records.map((record) => <li key={record.id}><time dateTime={record.created_at}>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(record.created_at))}</time><strong>{record.meal_type.replaceAll("_", " ").toLocaleLowerCase("pt-BR")}</strong><span>{record.carbohydrates} g · {record.glucose} mg/dL</span><span>Sugestão {record.suggested_dose} U · aplicada {record.applied_dose ?? "—"}</span></li>)}</ol>}</section></main>;
}
