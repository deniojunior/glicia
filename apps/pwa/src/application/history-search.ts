import type { MealRecord } from "./meal-history";
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replaceAll("_", " ");
export function historyPage(records: readonly MealRecord[], search: string, requestedPage: number, pageSize = 8) {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  const matches = records.filter((record) => {
    const text = normalize([record.meal_input, record.assistant_summary, record.meal_type, ...record.meal_items.map((item) => item.name), new Date(record.created_at).toLocaleDateString("pt-BR")].join(" "));
    return terms.every((term) => text.includes(term));
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  const pages = Math.max(1, Math.ceil(matches.length / pageSize));
  const page = Math.max(1, Math.min(requestedPage, pages));
  return { records: matches.slice((page - 1) * pageSize, page * pageSize), total: matches.length, page, pages };
}
