import { useState } from "react";
import { PlatformSilhouette } from "./PlatformSilhouette";

interface Props {
  platformId: string;
  name: string;
  variant?: "hero" | "thumb";
  author?: string | null;
  license?: string | null;
  className?: string;
}

export function PlatformImage({ platformId, name, variant = "hero", author, license, className }: Props) {
  const [broken, setBroken] = useState(false);
  const src = `${import.meta.env.BASE_URL}platforms/${platformId}/hero.webp`;

  if (broken) {
    return (
      <div
        data-testid="platform-image-fallback"
        className={`flex items-center justify-center bg-slate-900/60 ${className ?? ""}`}
      >
        <PlatformSilhouette size={variant === "hero" ? 150 : 56} />
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden bg-slate-950 ${className ?? ""}`}>
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-full w-full object-contain saturate-[0.9] contrast-[1.05]"
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
      {variant === "hero" && author && (
        <div className="font-tech absolute bottom-1 right-2 text-[9px] text-slate-400/80">
          © {author}{license ? ` · ${license}` : ""}
        </div>
      )}
    </div>
  );
}
