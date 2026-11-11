// Plan checker. Fails (exit 1) when:
//  - an acceptance check has no owning session, or has two owners
//  - a session depends on itself, on a later session, or on a session that does not exist
//  - a plan has no exit gate (no command inside a fenced block under "## Exit gate")
//  - a plan lacks a required section
//  - PLAN.md's check->session table disagrees with the plan files (when PLAN.md exists)
//  - there is not exactly one session marked "live in class"
// Usage: node scripts/plan-check.mjs [--plans <dir>] [--requirements <file>] [--plan-md <file>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? path.resolve(args[i + 1]) : dflt;
};
const plansDir = opt('--plans', path.join(root, 'plans'));
const reqFile = opt('--requirements', path.join(root, 'docs', 'REQUIREMENTS.md'));
const planMd = opt('--plan-md', path.join(root, 'PLAN.md'));

const errors = [];
const fail = (m) => errors.push(m);

const REQUIRED = [
  'Goal', 'Depends on', 'Read first', 'Checks it owns', 'Tests to write first (titles)',
  'Files it may touch', 'Steps', 'Exit gate', 'What to write in PROGRESS.md for the next session',
];

// ---- all checks, from the requirements file ----
const allChecks = [];
for (const line of fs.readFileSync(reqFile, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^- \*\*(AC-\d+\.\d+(?:\.\d+)?)\*\*/);
  if (m) allChecks.push(m[1]);
}
if (new Set(allChecks).size !== allChecks.length) fail('requirements list a check ID twice');
if (allChecks.length === 0) fail(`no checks found in ${reqFile}`);

// ---- plans ----
const files = fs.readdirSync(plansDir).filter((f) => /^session-\d\d-.+\.md$/.test(f)).sort();
if (files.length === 0) fail(`no plan files in ${plansDir}`);

const sections = (text) => {
  const out = {};
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^## (.+?)\s*$/);
    if (h) { cur = h[1]; out[cur] = []; } else if (cur) out[cur].push(line);
  }
  return out;
};

const sessions = [];
for (const f of files) {
  const n = Number(f.match(/^session-(\d\d)/)[1]);
  const text = fs.readFileSync(path.join(plansDir, f), 'utf8');
  const sec = sections(text);
  for (const r of REQUIRED) if (!(r in sec)) fail(`${f}: missing section "## ${r}"`);

  // depends
  const depsText = (sec['Depends on'] || []).join(' ').trim();
  const depends = [...depsText.matchAll(/session-(\d\d)/g)].map((m) => Number(m[1]));
  if (!/session-\d\d/.test(depsText) && !/^none\b/i.test(depsText)) fail(`${f}: "Depends on" must be "none" or list session-NN`);

  // owns
  const owns = [...(sec['Checks it owns'] || []).join(' ').matchAll(/AC-\d+\.\d+(?:\.\d+)?/g)].map((m) => m[0]);

  // exit gate: at least one non-empty, non-comment line inside a fenced block
  const gateLines = sec['Exit gate'] || [];
  let inFence = false;
  const commands = [];
  for (const l of gateLines) {
    if (/^```/.test(l)) { inFence = !inFence; continue; }
    if (inFence && l.trim() && !l.trim().startsWith('#')) commands.push(l.trim());
  }
  if (commands.length === 0) fail(`${f}: no exit gate (needs at least one command in a fenced block under "## Exit gate")`);

  const live = /LIVE IN CLASS/i.test(text.split(/\r?\n/)[0]);
  sessions.push({ n, f, depends, owns, live });
}

// numbering and dependency order
const nums = sessions.map((s) => s.n);
if (new Set(nums).size !== nums.length) fail('two plan files share a session number');
for (const s of sessions) {
  for (const d of s.depends) {
    if (d === s.n) fail(`${s.f}: depends on itself`);
    else if (d > s.n) fail(`${s.f}: depends on a LATER session (session-${String(d).padStart(2, '0')})`);
    else if (!nums.includes(d)) fail(`${s.f}: depends on session-${String(d).padStart(2, '0')}, which has no plan file`);
  }
}

// ownership: exactly one owner per check
const owners = {};
for (const s of sessions) for (const id of s.owns) (owners[id] ||= []).push(s.n);
for (const id of allChecks) {
  const o = owners[id] || [];
  if (o.length === 0) fail(`${id}: no owner`);
  if (o.length > 1) fail(`${id}: ${o.length} owners (${o.map((n) => 'session-' + String(n).padStart(2, '0')).join(', ')})`);
}
for (const id of Object.keys(owners)) if (!allChecks.includes(id)) fail(`${id}: owned by a plan but not in the requirements`);

// exactly one live-in-class session
const live = sessions.filter((s) => s.live);
if (live.length !== 1) fail(`expected exactly one session marked "LIVE IN CLASS", found ${live.length}`);

// PLAN.md table must agree with the plans
if (fs.existsSync(planMd)) {
  const rows = {};
  for (const line of fs.readFileSync(planMd, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\| (AC-\d+\.\d+(?:\.\d+)?) \|.*\| session-(\d\d) \|\s*$/);
    if (m) rows[m[1]] = Number(m[2]);
  }
  for (const id of allChecks) {
    const o = owners[id] || [];
    if (rows[id] === undefined) fail(`PLAN.md: no table row for ${id}`);
    else if (o.length === 1 && o[0] !== rows[id]) fail(`PLAN.md: ${id} says session-${String(rows[id]).padStart(2, '0')} but the plan files say session-${String(o[0]).padStart(2, '0')}`);
  }
} else {
  fail(`PLAN.md not found at ${planMd}`);
}

if (errors.length) {
  console.error(`plan-check FAILED (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}
console.log(`plan-check OK: ${sessions.length} sessions, ${allChecks.length} checks, each with exactly one owner; no forward dependencies; every plan has an exit gate.`);
