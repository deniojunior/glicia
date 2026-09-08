import { useCallback, useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

const UPDATE_INTERVAL_MS = 60 * 60 * 1000;

type UpdatePromptProps = {
  collapsed: boolean;
  updating: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onUpdate: () => void;
};

export function PwaUpdatePrompt({ collapsed, updating, onCollapse, onExpand, onUpdate }: UpdatePromptProps) {
  if (collapsed) {
    return <button className="pwa-update-pill" type="button" onClick={onExpand}>Atualização disponível</button>;
  }

  return (
    <aside className="pwa-update-card" aria-labelledby="pwa-update-title" aria-live="polite">
      <svg className="pwa-update-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 7v5h-5" />
        <path d="M18.5 15.5A7.5 7.5 0 1 1 19.8 9" />
      </svg>
      <div className="pwa-update-copy">
        <strong id="pwa-update-title">Uma nova versão está pronta</strong>
        <span>Você pode continuar por aqui e atualizar quando terminar.</span>
      </div>
      <div className="pwa-update-actions">
        <button className="pwa-update-primary" type="button" disabled={updating} onClick={onUpdate}>
          {updating ? "Atualizando…" : "Atualizar agora"}
        </button>
        <button className="pwa-update-later" type="button" disabled={updating} onClick={onCollapse}>Depois</button>
      </div>
    </aside>
  );
}

export function PwaUpdateNotice() {
  const [collapsed, setCollapsed] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [registration, setRegistration] = useState<ServiceWorkerRegistration>();
  const onRegisteredSW = useCallback((_url: string, nextRegistration: ServiceWorkerRegistration | undefined) => {
    setRegistration(nextRegistration);
  }, []);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({ onRegisteredSW });

  useEffect(() => {
    if (!registration) return;

    const checkForUpdate = () => {
      if (navigator.onLine && document.visibilityState === "visible") {
        void registration.update().catch(() => undefined);
      }
    };
    const handleVisibility = () => checkForUpdate();
    const interval = window.setInterval(checkForUpdate, UPDATE_INTERVAL_MS);
    window.addEventListener("focus", checkForUpdate);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", checkForUpdate);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [registration]);

  if (!needRefresh) return null;

  const update = async () => {
    setUpdating(true);
    try {
      await updateServiceWorker(true);
    } catch {
      setUpdating(false);
    }
  };

  return <div className="pwa-update-notice"><PwaUpdatePrompt collapsed={collapsed} updating={updating} onCollapse={() => setCollapsed(true)} onExpand={() => setCollapsed(false)} onUpdate={() => void update()} /></div>;
}
