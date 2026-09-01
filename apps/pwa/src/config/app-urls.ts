const baseUrl = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;

export const gliciaIconUrl = `${baseUrl}icons/glicia-192.png`;
export const appHomePath = baseUrl;

export function appPath(path: string): string {
  return `${baseUrl}${path.replace(/^\/+/, "")}`;
}
