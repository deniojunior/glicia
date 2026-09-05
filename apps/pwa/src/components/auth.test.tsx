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
  reviewAccessRequest: async () => undefined
};

test("começa com uma única entrada de e-mail, sem seletor de intenção", () => {
  const html = renderToStaticMarkup(<Auth service={service} />);

  expect(html).toContain("Entre na Glicia");
  expect(html).toContain("Seu e-mail");
  expect(html).toContain("Continuar");
  expect(html).not.toContain("Solicitar acesso");
  expect(html).not.toContain("Já fui aprovado");
});

test("restringe a entrada da revisão à conta administradora", () => {
  const html = renderToStaticMarkup(<Auth service={service} adminLogin={{
    email: "admin@glicia.test",
    redirectTo: "http://localhost:5173/admin/access-requests?request=123"
  }} />);

  expect(html).toContain("Acesso administrativo");
  expect(html).toContain("admin@glicia.test");
  expect(html).toContain("readOnly");
  expect(html).toContain("Somente a conta administradora");
});
