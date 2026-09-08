import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";

import { InstallGlicia } from "./install-glicia";
import { detectInstallPlatform } from "./install-platform";

test("prioriza o prompt nativo de instalação", () => {
  expect(detectInstallPlatform({ standalone: false, promptAvailable: true, userAgent: "Mozilla/5.0 (iPhone) Safari", navigatorPlatform: "iPhone", maxTouchPoints: 5 })).toBe("native");
});

test("diferencia Safari de outro navegador no iPhone", () => {
  expect(detectInstallPlatform({ standalone: false, promptAvailable: false, userAgent: "Mozilla/5.0 (iPhone) Version/18 Mobile Safari", navigatorPlatform: "iPhone", maxTouchPoints: 5 })).toBe("ios-safari");
  expect(detectInstallPlatform({ standalone: false, promptAvailable: false, userAgent: "Mozilla/5.0 (iPhone) CriOS/140 Mobile Safari", navigatorPlatform: "iPhone", maxTouchPoints: 5 })).toBe("ios-other");
});

test("não oferece novamente quando já está em modo standalone", () => {
  expect(detectInstallPlatform({ standalone: true, promptAvailable: true, userAgent: "", navigatorPlatform: "", maxTouchPoints: 0 })).toBe("installed");
});

test("mantém a ação Instalar app acessível no menu", () => {
  const html = renderToStaticMarkup(<InstallGlicia variant="menu" />);
  expect(html).toContain("Instalar app");
  expect(html).toContain("Ver instruções para este aparelho");
});
