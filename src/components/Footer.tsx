import Link from 'next/link';
import Crest from './Crest';

export default function Footer() {
  return (
    <footer className="site-footer" data-testid="site-footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Crest />
          <span>PINT FC</span>
        </div>
        <p className="muted">New Jersey, USA</p>
        <nav aria-label="Footer">
          <ul className="footer-links">
            <li>
              <Link href="/">Home</Link>
            </li>
            <li>
              <Link href="/squad">Squad</Link>
            </li>
            <li>
              <Link href="/sign-in">Players sign in</Link>
            </li>
          </ul>
        </nav>
        <ul className="footer-social" aria-label="Social media (placeholders)">
          <li>
            <a href="#" aria-label="PINT FC on Instagram (placeholder)">
              Instagram
            </a>
          </li>
          <li>
            <a href="#" aria-label="PINT FC on Facebook (placeholder)">
              Facebook
            </a>
          </li>
          <li>
            <a href="#" aria-label="PINT FC on X (placeholder)">
              X
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
