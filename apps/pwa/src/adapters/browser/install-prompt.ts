export interface DeferredInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallPromptState {
  prompt: DeferredInstallPromptEvent | null;
  installed: boolean;
}

let state: InstallPromptState = { prompt: null, installed: isStandalone() };
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    update({ prompt: event as DeferredInstallPromptEvent, installed: false });
  });
  window.addEventListener("appinstalled", () => update({ prompt: null, installed: true }));
}

export function subscribeInstallPrompt(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getInstallPromptState() { return state; }

export async function requestInstall() {
  if (!state.prompt) return null;
  const prompt = state.prompt;
  await prompt.prompt();
  const choice = await prompt.userChoice;
  update({ prompt: null, installed: choice.outcome === "accepted" });
  return choice.outcome;
}

function update(next: InstallPromptState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function isStandalone(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone === true);
}
