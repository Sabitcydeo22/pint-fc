// Runs every gate in order and stops at the first failure.
// Usage: npm run gate
import { spawnSync } from 'node:child_process';

const GATES = ['typecheck', 'lint', 'test:unit', 'test:db', 'test:api', 'test:e2e', 'plan:check'];

for (const name of GATES) {
  console.log(`\n=== gate: npm run ${name} ===`);
  const r = spawnSync(`npm run ${name}`, { stdio: 'inherit', shell: true });
  if (r.status !== 0) {
    console.error(`\nGATE FAILED at "npm run ${name}" (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}
console.log(`\nALL ${GATES.length} GATES PASSED`);
