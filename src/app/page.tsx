import LatestResults from '../components/LatestResults';
import MiniTable from '../components/MiniTable';
import NextMatch from '../components/NextMatch';
import SeasonRecord from '../components/SeasonRecord';

export default function HomePage() {
  return (
    <main data-testid="page-home">
      <h1>PINT FC</h1>
      <NextMatch />
      <SeasonRecord />
      <LatestResults />
      <MiniTable />
    </main>
  );
}
