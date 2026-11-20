// The photo of a player on the profile page (session 20e-3, owner's option a: local files only).
// A photo is a LOCAL file in public/img, never a URL from another site: `playerPhotoSrc` is the only gate and it uses the
// same rule as the hero photo (`heroPhotoSrc`): nothing but /img/<name>.jpg|jpeg|png|webp (CSP img-src 'self' data:).
// No photo file is added by the agent: the owner provides consented files.
import { heroPhotoSrc } from './hero';

/** The photo path when it is a plain local /img/ file, otherwise null (the profile then shows the number graphic). */
export function playerPhotoSrc(src: string | null | undefined): string | null {
  return heroPhotoSrc(src);
}
