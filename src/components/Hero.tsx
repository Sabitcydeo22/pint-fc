// The big band at the top of the home page (session 20e-1). Behind the content it shows EITHER a local photo (only when
// `photo` is a plain /img/ file, see lib/hero.ts) under an opaque navy shade, OR a graphic fallback: diagonal shapes (CSS)
// and pitch lines (the SVG below, plain shapes, token colours, no text, no people). The children are the content.
// The photo is a CSS background, not an <img>, so nothing can be loaded from outside and the page asks for no image at all
// while there is no photo.
import type { ReactNode } from 'react';
import { HERO_PHOTO, heroPhotoSrc } from '../lib/hero';

export default function Hero({ children, photo = HERO_PHOTO }: { children: ReactNode; photo?: string | null }) {
  const src = heroPhotoSrc(photo);
  return (
    <div className={src ? 'hero hero-with-photo' : 'hero'} data-testid="hero">
      {src ? (
        <>
          <div className="hero-photo" style={{ backgroundImage: `url("${src}")` }} aria-hidden="true" />
          <div className="hero-shade" aria-hidden="true" />
        </>
      ) : (
        <svg data-testid="hero-art" className="hero-art" viewBox="0 0 400 300" preserveAspectRatio="xMaxYMid meet" aria-hidden="true" focusable="false">
          <rect className="hero-line" x="12" y="12" width="376" height="276" />
          <path className="hero-line" d="M200 12 V288" />
          <circle className="hero-line" cx="200" cy="150" r="48" />
          <rect className="hero-line" x="12" y="84" width="64" height="132" />
          <rect className="hero-line" x="324" y="84" width="64" height="132" />
          <rect className="hero-line" x="12" y="116" width="26" height="68" />
          <rect className="hero-line" x="362" y="116" width="26" height="68" />
        </svg>
      )}
      <div className="hero-body">{children}</div>
    </div>
  );
}
