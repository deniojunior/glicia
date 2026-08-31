import { useEffect, useState } from "react";

interface DeferredInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallGlicia() {
  const [deferredPrompt, setDeferredPrompt] = useState<DeferredInstallPromptEvent | null>(null);
  const [showIosHelp, setShowIosHelp] = useState(false);
  const [installed, setInstalled] = useState(() => isStandalone());
  const appleMobile = isAppleMobile();

  useEffect(() => {
    function capture(event: Event) { event.preventDefault(); setDeferredPrompt(event as DeferredInstallPromptEvent); }
    function markInstalled() { setInstalled(true); setDeferredPrompt(null); }
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", markInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", capture); window.removeEventListener("appinstalled", markInstalled); };
  }, []);

  if (installed || (!deferredPrompt && !appleMobile)) return null;

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setDeferredPrompt(null);
  }

  return <section className="install-glicia" aria-labelledby="install-title">
    <h2 id="install-title">Ter a Glicia na tela inicial</h2>
    <p>Instalar é opcional. Assim ela abre como aplicativo, sem App Store.</p>
    {deferredPrompt ? <button className="secondary-action" type="button" onClick={() => void install()}>Instalar Glicia</button> : <><button className="text-action install-help" type="button" aria-expanded={showIosHelp} onClick={() => setShowIosHelp((current) => !current)}>Como instalar no iPhone</button>{showIosHelp ? <p className="install-instructions">No Safari, toque em Compartilhar e escolha <strong>Adicionar à Tela de Início</strong>. Depois volte aqui para continuar.</p> : null}</>}
  </section>;
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}

function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
