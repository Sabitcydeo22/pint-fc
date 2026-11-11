# PINT FC MVP — project rules

Product owner: the user. We follow the agentic SDLC: requirements → design → session plan → build one session at a time → release. Each phase writes files into this repo and STOPS for the owner's "approved".

Environment: Windows 11, PowerShell syntax only (no bash). Docker is NOT installed and must not be installed.
Stack (change only with a reason in DECISIONS.md): Next.js (App Router) + TypeScript, Supabase Postgres + Auth, Vitest, Playwright, Vercel hosting.
Deploy targets are the OWNER's accounts (Vercel team `sabit-pintfc`, Supabase org `sabit`). Ignore the instructor's team/project/screens named in the PDF.

## Rules

- **Secrets:** never print, log or commit a token, key or password. Keys live in `.env.local` (gitignored). Vercel commands use `--token $env:VERCEL_TOKEN`; the Supabase CLI reads `SUPABASE_ACCESS_TOKEN`. Never run commands that list all environment variables. Check a token only with: `if ($env:VERCEL_TOKEN) {"set"} else {"not set"}`.
- **No deletion:** never delete files or folders, and never run `git reset --hard`, `git clean` or a force push. If something must go, ask the owner with the exact path.
- **Git:** never `git commit` without the owner's "go". Never `git push`.
- **Fake data only:** no real names, emails or phone numbers.
- **Ask first** before creating anything in Supabase or Vercel, before anything that may cost money, and before any production deploy.
- **Existing Supabase project** in org `sabit` is NOT part of this work: never touch it. The Supabase token is read-only.
- **Tests first:** write the test, run it, show it failing for the right reason, then write the code.
- **Done means** the exit gate ran and its output is shown. Commit only after the test command itself exits 0, never through a pipe.
- **One session at a time.** At the end, append to `PROGRESS.md`: done, proof, decisions, and "Next session needs to know".
- **Phase gates:** after each phase's files are written, summarize and wait for "approved".
