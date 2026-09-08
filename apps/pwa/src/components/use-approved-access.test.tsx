// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

import { useApprovedAccess } from "./use-approved-access";

let root: Root;
let container: HTMLDivElement;
const service = { hasApprovedAccess: vi.fn<(id: string) => Promise<boolean>>() };

function Conversation() {
  const [draft, setDraft] = useState("");
  return <><p>Conversa em andamento</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} /></>;
}

function Screen({ user }: { user: { id: string } | null }) {
  const approved = useApprovedAccess(user?.id, service);
  if (!user) return <p>Entrar</p>;
  if (approved === undefined) return <p>Verificando</p>;
  return approved ? <Conversation key={user.id} /> : <p>Sem acesso</p>;
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  service.hasApprovedAccess.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

test("mantém o chat e o texto não enviado quando Auth renova o objeto da mesma pessoa", async () => {
  service.hasApprovedAccess.mockResolvedValue(true);
  await act(async () => root.render(<Screen user={{ id: "a" }} />));
  const textarea = container.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(textarea, "Vou comer arroz");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
  for (let refresh = 0; refresh < 3; refresh++) {
    await act(async () => root.render(<Screen user={{ id: "a" }} />));
  }
  expect(container.querySelector("textarea")).toBe(textarea);
  expect(textarea.value).toBe("Vou comer arroz");
  expect(container.textContent).toContain("Conversa em andamento");
  expect(service.hasApprovedAccess).toHaveBeenCalledTimes(1);
});

test("não aproveita a aprovação anterior ao trocar de conta", async () => {
  service.hasApprovedAccess.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  await act(async () => root.render(<Screen user={{ id: "a" }} />));
  await act(async () => root.render(<Screen user={{ id: "b" }} />));
  expect(container.querySelector("textarea")).toBeNull();
  expect(container.textContent).toBe("Sem acesso");
});

test("ignora resposta atrasada da conta anterior", async () => {
  let resolveOld!: (approved: boolean) => void;
  service.hasApprovedAccess.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; })).mockResolvedValueOnce(false);
  await act(async () => root.render(<Screen user={{ id: "a" }} />));
  await act(async () => root.render(<Screen user={{ id: "b" }} />));
  await act(async () => resolveOld(true));
  expect(container.textContent).toBe("Sem acesso");
});

test("logout desmonta a conversa e novo login verifica novamente", async () => {
  service.hasApprovedAccess.mockResolvedValue(true);
  await act(async () => root.render(<Screen user={{ id: "a" }} />));
  const previous = container.querySelector("textarea");
  await act(async () => root.render(<Screen user={null} />));
  expect(container.textContent).toBe("Entrar");
  await act(async () => root.render(<Screen user={{ id: "a" }} />));
  expect(container.querySelector("textarea")).not.toBe(previous);
  expect(service.hasApprovedAccess).toHaveBeenCalledTimes(2);
});
