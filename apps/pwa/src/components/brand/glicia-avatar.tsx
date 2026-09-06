import { appPath } from "../../config/app-urls";

export function GliciaAvatar({ size = "medium", variant = "illustration", decorative = true }: { size?: "small" | "medium" | "large"; variant?: "illustration" | "profile"; decorative?: boolean }) {
  return <img className={`glicia-avatar glicia-avatar-${size} glicia-avatar-${variant}`} src={appPath("brand/glicia-avatar-chat-v5.png")} alt={decorative ? "" : "Glicia"} />;
}
