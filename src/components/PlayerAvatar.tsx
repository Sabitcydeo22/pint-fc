// The picture on a player profile: never a photo, never a person (owner's content rule). A player who consented to a
// photo (`photo`) gets the neutral local jersey FILE with the shirt number on it; everyone else gets the inline jersey
// with initials and number. The database `photo_url` value is NOT used here, only whether the player consented and has
// one: the page can never load an image from anywhere but /img/ (D-166). It is decoration: the name is the page heading.
import { initials } from '../lib/initials';
import Jersey from './Jersey';

export default function PlayerAvatar({ name, shirtNumber, photo }: { name: string; shirtNumber: number; photo: boolean }) {
  if (photo) {
    return (
      <div className="avatar avatar-solo">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small local SVG from /public, nothing to optimise */}
        <img data-testid="player-photo" className="avatar-art" src="/img/placeholder-player.svg" alt="" width={120} height={120} />
        <span className="avatar-number">{shirtNumber}</span>
      </div>
    );
  }
  return (
    <div className="avatar" data-testid="player-avatar">
      <Jersey className="avatar-art" />
      <span className="avatar-initials">{initials(name)}</span>
      <span className="avatar-number">{shirtNumber}</span>
    </div>
  );
}
