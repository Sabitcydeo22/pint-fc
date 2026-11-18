// The club crest: a shield with three bars and a chevron, no letters and no figure. Decoration only (`aria-hidden`): the
// club name is written next to it. Colours come from the tokens through globals.css (`.crest`, `.crest-shield`, `.crest-detail`).
export default function Crest() {
  return (
    <svg className="crest" viewBox="0 0 100 120" aria-hidden="true" focusable="false">
      <path className="crest-shield" d="M10 8 H90 V62 Q90 96 50 114 Q10 96 10 62 Z" />
      <rect className="crest-detail" x="22" y="18" width="16" height="16" />
      <rect className="crest-detail" x="42" y="18" width="16" height="16" />
      <rect className="crest-detail" x="62" y="18" width="16" height="16" />
      <polygon className="crest-detail" points="10,44 50,68 90,44 90,56 50,80 10,56" />
    </svg>
  );
}
