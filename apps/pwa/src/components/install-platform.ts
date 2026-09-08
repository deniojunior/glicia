export type InstallPlatform = "installed" | "native" | "ios-safari" | "ios-other" | "browser-help";

export function detectInstallPlatform(input: { standalone: boolean; promptAvailable: boolean; userAgent: string; navigatorPlatform: string; maxTouchPoints: number }): InstallPlatform {
  if (input.standalone) return "installed";
  if (input.promptAvailable) return "native";
  const appleMobile = /iPhone|iPad|iPod/.test(input.userAgent) || (input.navigatorPlatform === "MacIntel" && input.maxTouchPoints > 1);
  if (!appleMobile) return "browser-help";
  const safari = /Safari/i.test(input.userAgent) && !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(input.userAgent);
  return safari ? "ios-safari" : "ios-other";
}
