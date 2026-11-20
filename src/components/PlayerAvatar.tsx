// The graphic on the player panel (session 20e-3): never a person, never a body. With a valid LOCAL photo
// (`playerPhotoSrc`, only a plain /img/ file; the page passes it only for a player who consented) it shows that photo
// with the shirt number on a chip. Without one it shows the shirt number as a big round graphic, no image at all.
// It is decoration: the name is the page heading.
import { playerPhotoSrc } from '../lib/photo';

export default function PlayerAvatar({ shirtNumber, photoSrc }: { shirtNumber: number; photoSrc: string | null }) {
  const src = playerPhotoSrc(photoSrc);
  if (src) {
    return (
      <div className="player-media">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local file from /public chosen by the owner, nothing to optimise */}
        <img data-testid="player-photo" className="player-photo" src={src} alt="" width={120} height={120} />
        <span data-testid="player-number" className="player-number player-number-chip">
          {shirtNumber}
        </span>
      </div>
    );
  }
  return (
    <div className="player-media" data-testid="player-avatar" aria-hidden="true">
      <span data-testid="player-number" className="player-number">
        {shirtNumber}
      </span>
    </div>
  );
}
