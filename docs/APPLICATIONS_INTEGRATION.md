# Application tracking integration (US-13-T03)

Task: `CU-86e3a3by8`. Baseline: frontend PR #42, backend US-13-T01.

## Implemented behavior

- The company filter uses the API's 200-character limit, trims input and does not
  send invalid searches. Requests carry TanStack Query's cancellation signal.
- The withdrawal response is validated before updating every cached application
  list. A failed list refresh does not undo a confirmed withdrawal on screen.
- Failed or lost responses trigger a list refresh. An already-closed or missing
  application cannot submit another withdrawal from the same confirmation.
- Pending requests block dismissal. Failures appear in an alert, and opening a
  new confirmation clears the previous failure.
- A confirmed withdrawal is announced in a status region. When the confirmation
  closes, focus returns to the button that opened it. If a withdrawal or a
  refreshed list removed that button, focus moves to the card title, or to the
  page title when the application is no longer listed.
- Only rejected applications offer similar jobs. The expandable list displays
  the returned titles and companies, or an explicit empty state.
- Submission dates use the backend's `America/Sao_Paulo` calendar convention.

## Checks

`pnpm validate:push` runs the normal quality gates and the browser suite. The
application unit/integration tests use the real HTTP client and schemas with a
controlled transport. The default Cypress application tests stub HTTP responses
for repeatable success, failure, pending, keyboard and axe checks.

Production builds require `VITE_API_URL`. Without it the build still succeeds,
but the page fails on load, so the browser suite and the pre-push hook fail.
If `.env.local` does not exist yet, create it once from the example, which
already holds the value CI uses. Git ignores this file:

**Bash (Linux, macOS or WSL):**

```bash
cp .env.example .env.local
pnpm validate:push
```

**PowerShell:**

```powershell
Copy-Item .env.example .env.local
pnpm validate:push
```

## Remaining acceptance dependencies

The baseline API exposes neither an expected company response time nor a closing
reason; neither is invented by this screen. `Ver a vaga` links to
`/candidato/vagas/$jobId`. That screen reads `GET /jobs/{job_id}` for the job
status and for whether this professional already applied; the applications list
is not a second source for those states. Suggested jobs are displayed from real
data but have no invented destination. The missing company response time and
closing reason still prevent declaring every US-13 acceptance criterion complete.

No new runtime dependency or production API contract is needed. The job detail
route is generated from `src/routes/candidato.vagas_.$jobId.tsx`.
