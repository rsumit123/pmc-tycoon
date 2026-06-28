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
    <div className={`relative overflow-hidden bg-[#0a0f1c] ${className ?? ""}`}>
      {/* Tactical-recon duotone: desaturate the photo, then map shadows→navy
          and highlights→amber, and fade the edges into the card so it reads
          as part of the command UI rather than a pasted stock photo. */}
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-full w-full object-contain grayscale-[0.65] contrast-[1.12] brightness-[0.9]"
      />
      {/* navy shadows (duotone low end) */}
      <div className="pointer-events-none absolute inset-0 bg-[#0a0f1c] opacity-40 mix-blend-multiply" />
      {/* amber highlight wash (duotone high end) */}
      <div className="pointer-events-none absolute inset-0 bg-amber-500/15 mix-blend-overlay" />
      {/* edge vignette + bottom scrim — seat the photo into the card */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_38px_14px_#0a0f1c]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0f1c]/80 via-transparent to-[#0a0f1c]/35" />
      {variant === "hero" && author && (
        <div className="font-tech absolute bottom-1 right-2 text-[9px] text-slate-400/80">
          © {author}{license ? ` · ${license}` : ""}
        </div>
      )}
    </div>
  );
}
