import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { AccountLoadError } from "./account-load-error";

test("oferece recuperação quando a conta não carrega", () => {
  const html = renderToStaticMarkup(<AccountLoadError onRetry={() => undefined} onSignOut={async () => undefined} />);
  expect(html).toContain("Tentar novamente");
  expect(html).toContain("Sair da conta");
  expect(html).toContain("continuam salvos");
});
