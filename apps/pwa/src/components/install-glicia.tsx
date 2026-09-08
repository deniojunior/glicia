import { useState, useSyncExternalStore } from "react";
import { getInstallPromptState, requestInstall, subscribeInstallPrompt } from "../adapters/browser/install-prompt";
import { detectInstallPlatform, type InstallPlatform } from "./install-platform";

export function InstallGlicia({ variant = "onboarding" }: { variant?: "onboarding" | "menu" }) {
  const [showHelp, setShowHelp] = useState(false);
  const installPrompt = useSyncExternalStore(subscribeInstallPrompt, getInstallPromptState, getInstallPromptState);
  const platform = detectInstallPlatform({
    standalone: installPrompt.installed,
    promptAvailable: installPrompt.prompt !== null,
    userAgent: typeof navigator === "undefined" ? "" : navigator.userAgent,
    navigatorPlatform: typeof navigator === "undefined" ? "" : navigator.platform,
    maxTouchPoints: typeof navigator === "undefined" ? 0 : navigator.maxTouchPoints
  });

  if (platform === "installed") return null;

  async function install() {
    if (!installPrompt.prompt) { setShowHelp((current) => !current); return; }
    await requestInstall();
  }

  const helpId = `install-help-${variant}`;

  return <section className={`install-glicia install-glicia-${variant}`} aria-labelledby={`install-title-${variant}`}>
    {variant === "onboarding" ? <><h2 id={`install-title-${variant}`}>Ter a Glicia na tela inicial</h2><p>É opcional. Instalada, ela abre como um aplicativo, sem precisar de loja.</p></> : <h3 id={`install-title-${variant}`}>Instalar a Glicia</h3>}
    <button className={variant === "menu" ? "install-menu-action" : "secondary-action"} type="button" aria-expanded={installPrompt.prompt ? undefined : showHelp} aria-controls={installPrompt.prompt ? undefined : helpId} onClick={() => void install()}>
      <InstallIcon />
      <span><strong>Instalar app</strong>{variant === "menu" ? <small>{installPrompt.prompt ? "Adicionar à tela inicial" : "Ver instruções para este aparelho"}</small> : null}</span>
      {variant === "menu" ? <svg className="install-menu-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d={installPrompt.prompt ? "m7 10 5 5 5-5" : "m10 7 5 5-5 5"} /></svg> : null}
    </button>
    {!installPrompt.prompt && showHelp ? <div className="install-instructions" id={helpId} role="status">{installHelp(platform)}</div> : null}
  </section>;
}

function installHelp(platform: InstallPlatform) {
  if (platform === "ios-safari") return <p>No Safari, toque em <strong>Compartilhar</strong> e depois em <strong>Adicionar à Tela de Início</strong>.</p>;
  if (platform === "ios-other") return <p>Abra <strong>glicia.app</strong> no Safari. Depois toque em <strong>Compartilhar</strong> e em <strong>Adicionar à Tela de Início</strong>.</p>;
  return <p>Abra o menu do navegador e procure <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>. Se essa opção não aparecer, você pode continuar usando a Glicia normalmente por aqui.</p>;
}

function InstallIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M5 19h14" /></svg>;
}
