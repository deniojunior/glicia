import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { PwaUpdatePrompt } from "./pwa-update-notice";

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: () => ({ needRefresh: [false], updateServiceWorker: vi.fn() })
}));

describe("PwaUpdatePrompt", () => {
  it("avisa sem impedir que a pessoa continue na versão atual", () => {
    const html = renderToStaticMarkup(<PwaUpdatePrompt collapsed={false} updating={false} onCollapse={vi.fn()} onExpand={vi.fn()} onUpdate={vi.fn()} />);

    expect(html).toContain("Uma nova versão está pronta");
    expect(html).toContain("continuar por aqui");
    expect(html).toContain("Atualizar agora");
    expect(html).toContain("Depois");
  });

  it("mantém um atalho discreto depois de recolher o aviso", () => {
    const html = renderToStaticMarkup(<PwaUpdatePrompt collapsed updating={false} onCollapse={vi.fn()} onExpand={vi.fn()} onUpdate={vi.fn()} />);

    expect(html).toContain("Atualização disponível");
    expect(html).not.toContain("Uma nova versão está pronta");
  });
});
