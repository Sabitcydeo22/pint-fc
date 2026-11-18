// A flat football shirt: sleeves, collar and one hoop, NO body (the owner's content rule: graphics only, never a figure).
// It is decoration (`aria-hidden`); the shirt number and initials are real text laid over it by the parent. Its colours
// come from the tokens through the classes in globals.css (`.jersey-fill`, `.jersey-trim`).
export default function Jersey({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <path className="jersey-fill" d="M38 16 L48 16 Q60 30 72 16 L82 16 L110 36 L100 54 L86 46 L86 104 L34 104 L34 46 L20 54 L10 36 Z" />
      <path className="jersey-trim" d="M48 16 Q60 30 72 16 L68 16 Q60 24 52 16 Z" />
      <polygon className="jersey-trim" points="10,36 20,54 25,51 15,33" />
      <polygon className="jersey-trim" points="110,36 100,54 95,51 105,33" />
      <rect className="jersey-trim" x="34" y="92" width="52" height="6" />
    </svg>
  );
}
