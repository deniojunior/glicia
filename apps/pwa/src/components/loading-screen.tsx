import { GliciaAvatar } from "./brand/glicia-avatar";
import { GliciaWordmark } from "./brand/glicia-wordmark";

export function LoadingScreen({ message }: { message: string }) {
  return <main className="loading-screen" aria-busy="true">
    <GliciaWordmark />
    <GliciaAvatar variant="profile" />
    <div role="status"><span className="loading-spinner" aria-hidden="true" /><p>{message}</p></div>
    <p className="loading-caption">Já vamos conversar.</p>
  </main>;
}
