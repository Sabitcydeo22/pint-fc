import LatestResults from '../components/LatestResults';
import MiniTable from '../components/MiniTable';
import NextMatch from '../components/NextMatch';
import SeasonRecord from '../components/SeasonRecord';

// From 768 px the home page has two columns (next match and record on the left, results and table on the right);
// below that the wrappers add no box (see .home-grid in globals.css). The DOM order is the reading order.
export default function HomePage() {
  return (
    <main data-testid="page-home" className="stack">
      <h1>PINT FC</h1>
      <div className="home-grid">
        <div className="home-col">
          <NextMatch />
          <SeasonRecord />
        </div>
        <div className="home-col">
          <LatestResults />
          <MiniTable />
        </div>
      </div>
    </main>
  );
}
