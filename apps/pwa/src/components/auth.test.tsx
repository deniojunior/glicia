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

test("restringe a entrada da revisão à conta administradora", () => {
  const html = renderToStaticMarkup(<Auth service={service} adminLogin={{
    email: "admin@glicia.test",
    redirectTo: "http://localhost:5173/admin/access-requests?request=123"
  }} />);

  expect(html).toContain("Acesso administrativo");
  expect(html).toContain("Continuar");
  expect(html).toContain("admin@glicia.test");
  expect(html).toContain("readOnly");
  expect(html).toContain("Somente a conta administradora");
});
