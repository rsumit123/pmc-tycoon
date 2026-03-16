import { useState } from 'react';

interface LazyImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallbackIcon?: string;
  fallbackText?: string;
  style?: React.CSSProperties;
}

/**
 * Image component with loading skeleton and error fallback.
 * Shows a pulsing placeholder while loading, falls back to icon/text on error.
 */
export const LazyImage = ({ src, alt, className = '', fallbackIcon, fallbackText, style }: LazyImageProps) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!src || error) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{
          background: 'var(--color-surface-raised)',
          color: 'var(--color-text-muted)',
          ...style,
        }}
      >
        {fallbackIcon ? (
          <span className="text-lg">{fallbackIcon}</span>
        ) : fallbackText ? (
          <span className="text-[9px] font-display tracking-wider text-center px-1">{fallbackText}</span>
        ) : (
          <span className="text-[9px] font-display tracking-wider">IMG</span>
        )}
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${className}`} style={style}>
      {/* Loading skeleton */}
      {!loaded && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{ background: 'var(--color-surface-raised)' }}
        />
      )}
      <img
        src={src}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        loading="lazy"
      />
    </div>
  );
};
