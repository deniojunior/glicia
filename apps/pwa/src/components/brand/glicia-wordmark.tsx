import { appHomePath } from "../../config/app-urls";

export function GliciaWordmark({ link = false }: { link?: boolean }) {
  const mark = <span className="wordmark" aria-label="Glicia"><span>Glic</span><span className="wordmark-ai">IA</span><span className="wordmark-rays" aria-hidden="true">✦</span></span>;
  return link ? <a className="brand" href={appHomePath}>{mark}</a> : <span className="brand">{mark}</span>;
}
