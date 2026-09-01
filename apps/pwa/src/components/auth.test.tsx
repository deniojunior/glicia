import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import type { AccessService } from "../application";
import { Auth } from "./auth";

const service: AccessService = {
  requestAccess: async () => undefined,
  sendLoginLink: async () => undefined,
  hasApprovedAccess: async () => false,
  listAccessRequests: async () => [],
  reviewAccessRequest: async () => undefined
};

test("separa solicitação pública do login de pessoas aprovadas", () => {
  const requestHtml = renderToStaticMarkup(<Auth service={service} initialMode="request" />);
  const loginHtml = renderToStaticMarkup(<Auth service={service} initialMode="login" />);

  expect(requestHtml).toContain("Peça acesso à Glicia");
  expect(requestHtml).toContain("Pedir acesso");
  expect(loginHtml).toContain("Entre na Glicia");
  expect(loginHtml).toContain("Enviar link para entrar");
});

test("explica e restringe o login da revisão à conta administradora", () => {
  const html = renderToStaticMarkup(<Auth service={service} adminLogin={{
    email: "admin@glicia.test",
    redirectTo: "http://localhost:5173/admin/access-requests?request=123"
  }} />);

  expect(html).toContain("Acesso administrativo");
  expect(html).toContain("admin@glicia.test");
  expect(html).toContain("readOnly");
  expect(html).toContain("Enviar link administrativo");
  expect(html).toContain("O e-mail da pessoa que pediu acesso não entra nesta área administrativa");
  expect(html).not.toContain("Solicitar acesso");
});
