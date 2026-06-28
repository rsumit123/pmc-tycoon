import { useState } from "react";
import { PlatformSilhouette } from "./PlatformSilhouette";

interface Props {
  platformId: string;
  name: string;
  variant?: "hero" | "thumb";
  author?: string | null;
  license?: string | null;
  /** Optional HUD sub-tag, e.g. "AIR SUPERIORITY · GEN 4.5" (hero only). */
  tag?: string;
  className?: string;
}

export function PlatformImage({ platformId, name, variant = "hero", author, license, tag, className }: Props) {
  const [broken, setBroken] = useState(false);
  const src = `${import.meta.env.BASE_URL}platforms/${platformId}/hero.webp`;
  const hero = variant === "hero";

  if (broken) {
    return (
      <div
        data-testid="platform-image-fallback"
        className={`flex items-center justify-center bg-slate-900/60 ${className ?? ""}`}
      >
        <PlatformSilhouette size={hero ? 150 : 56} />
      </div>
    );
  }

  // L-shaped HUD corner bracket; sized by variant.
  const b = hero ? "h-6 w-6 border-2" : "h-3.5 w-3.5 border";

  return (
    <div className={`relative overflow-hidden bg-[#0a0f1c] ${className ?? ""}`}>
      {/* Tactical-recon duotone: desaturate, navy shadows + amber highlights. */}
      <img
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setBroken(true)}
        className="h-full w-full object-contain grayscale-[0.65] contrast-[1.12] brightness-[0.9]"
      />
      <div className="pointer-events-none absolute inset-0 bg-[#0a0f1c] opacity-40 mix-blend-multiply" />
      <div className="pointer-events-none absolute inset-0 bg-amber-500/15 mix-blend-overlay" />
      {/* sensor scanlines */}
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, rgba(10,15,28,0.35) 0px, rgba(10,15,28,0.35) 1px, transparent 1px, transparent 3px)" }}
      />
      {/* edge vignette + bottom scrim — seat the photo into the card */}
      <div className="pointer-events-none absolute inset-0 shadow-[inset_0_0_38px_14px_#0a0f1c]" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#0a0f1c]/80 via-transparent to-[#0a0f1c]/35" />

      {/* HUD corner brackets */}
      <div className={`pointer-events-none absolute left-2 top-2 ${b} border-b-0 border-r-0 border-amber-400/70`} />
      <div className={`pointer-events-none absolute right-2 top-2 ${b} border-b-0 border-l-0 border-amber-400/70`} />
      <div className={`pointer-events-none absolute bottom-2 left-2 ${b} border-r-0 border-t-0 border-amber-400/70`} />
      <div className={`pointer-events-none absolute bottom-2 right-2 ${b} border-l-0 border-t-0 border-amber-400/70`} />

      {hero && (
        <>
          {/* center targeting reticle */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2">
            <div className="absolute left-1/2 top-0 h-3 w-px -translate-x-1/2 bg-cyan-400/50" />
            <div className="absolute bottom-0 left-1/2 h-3 w-px -translate-x-1/2 bg-cyan-400/50" />
            <div className="absolute left-0 top-1/2 h-px w-3 -translate-y-1/2 bg-cyan-400/50" />
            <div className="absolute right-0 top-1/2 h-px w-3 -translate-y-1/2 bg-cyan-400/50" />
            <div className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/70" />
          </div>
          <div className="font-tech pointer-events-none absolute left-9 top-2.5 text-[10px] tracking-widest text-amber-400/85">▸ VISUAL ID</div>
          {tag && (
            <div className="font-tech pointer-events-none absolute bottom-2 left-2.5 text-[10px] tracking-wider text-slate-300/80">{tag}</div>
          )}
        </>
      )}

      {hero && author && (
        <div className="font-tech absolute bottom-1 right-2 text-[9px] text-slate-400/80">
          © {author}{license ? ` · ${license}` : ""}
        </div>
      )}
    </div>
  );
}
