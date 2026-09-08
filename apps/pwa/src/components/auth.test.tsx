import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import type { AccessService } from "../application";
import { Auth } from "./auth";

const service: AccessService = {
  checkAccess: async () => "new",
  requestAccess: async () => undefined,
  sendLoginCode: async () => "code" as const,
  verifyLoginCode: async () => undefined,
  hasApprovedAccess: async () => false,
  listAccessRequests: async () => [],
  reviewAccessRequest: async () => undefined,
  getAiAdminControls: async () => ({ enabled: true, perUserDailyRequestLimit: 40, perUserDailyTokenLimit: 2_000_000, globalDailyCostLimitMicrousd: 1_000_000, maxConcurrentRequests: 4, requestsToday: 0, completedToday: 0, failedToday: 0, activeUsersToday: 0, tokensToday: 0, estimatedCostTodayMicrousd: 0, requestsMonth: 0, completedMonth: 0, failedMonth: 0, activeUsersMonth: 0, tokensMonth: 0, estimatedCostMonthMicrousd: 0, projectedMonthCostMicrousd: 0, averageCostPerAnalysisMicrousd: 0, activeRequests: 0, averageLatencyMs: 0 }),
  setAiEnabled: async () => undefined,
  setAccessSuspended: async () => undefined
};

test("começa com apresentação e botão Entrar, sem formulário de e-mail", () => {
  const html = renderToStaticMarkup(<Auth service={service} />);

  expect(html).toContain("Contar carboidratos pode ser mais simples");
  expect(html).toContain("Sociedade Brasileira de Diabetes");
  expect(html).toContain(">Entrar</button>");
  expect(html).not.toContain("Seu e-mail");
  expect(html).not.toContain("<form");
  expect(html).not.toContain("Quer experimentar?");
  expect(html).not.toContain("A Glicia está em fase experimental");
  expect(html).not.toContain("Solicitar acesso");
  expect(html).not.toContain("Já fui aprovado");
});

test("permite informar o e-mail administrativo sem fixar uma conta no formulário", () => {
  const html = renderToStaticMarkup(<Auth service={service} adminLogin={{
    redirectTo: "http://localhost:5173/admin/access-requests?request=123"
  }} />);

  expect(html).toContain("Acesso administrativo");
  expect(html).toContain("Continuar");
  expect(html).toContain('value=""');
  expect(html).not.toMatch(/readonly/i);
  expect(html).toContain("Somente a conta administradora");
});
