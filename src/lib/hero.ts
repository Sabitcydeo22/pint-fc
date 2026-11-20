// The photo slot of the home hero band (session 20e-1, owner answers 1 and 2).
// HERO_PHOTO stays null until the owner hands over a photo that is allowed (players only fully dressed in kit, and only
// with consent; parents' consent for minors). The photo is a LOCAL file in public/img, never a URL from another site:
// `heroPhotoSrc` is the only gate, and it accepts nothing but /img/<name>.jpg|jpeg|png|webp (CSP img-src 'self' data:).
export const HERO_PHOTO: string | null = null;

const LOCAL_PHOTO = /^\/img\/[a-z0-9][a-z0-9-]*\.(jpe?g|png|webp)$/;

/** The photo path when it is a plain local /img/ file, otherwise null (the band then shows its graphic fallback). */
export function heroPhotoSrc(src: string | null | undefined): string | null {
  return typeof src === 'string' && LOCAL_PHOTO.test(src) ? src : null;
}
