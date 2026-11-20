import Hero from '../components/Hero';
import LatestResults from '../components/LatestResults';
import MiniTable from '../components/MiniTable';
import NextMatch from '../components/NextMatch';
import SeasonRecord from '../components/SeasonRecord';

// The home page: the hero band (next match, countdown and the Going / Not going button), the season record in one full-width
// row, and from 768 px results and table side by side (two equal columns, same height); below that the wrappers add no box
// (see .home-grid in globals.css). The DOM order is the reading order: next match, record, results, table.
export default function HomePage() {
  return (
    <main data-testid="page-home" className="stack">
      <h1 className="sr-only">PINT FC</h1>
      <Hero>
        <NextMatch />
      </Hero>
      <SeasonRecord />
      <div className="home-grid">
        <div className="home-col">
          <LatestResults />
        </div>
        <div className="home-col">
          <MiniTable />
        </div>
      </div>
    </main>
  );
}
