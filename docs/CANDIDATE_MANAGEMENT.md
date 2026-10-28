# Company candidate management (US-21)

Approved companies open **Candidatos** in the sidebar or **Gerenciar candidatos**
on a job in **Minhas vagas**. The latter opens `/empresa/candidatos?jobId=<uuid>`
with that job selected. The existing ranking page also links to management.
The company route guard and backend ownership checks protect access.

## API and compatibility

- `GET /jobs/me` loads the company's jobs.
- `GET /jobs/{job_id}/applications` supplies application/full-match counts and the
  current US-19/US-20 ranking. `src/lib/job-applicants.ts` owns its shared contract
  and requests; the ranking feature re-exports the existing public interface.
- Automatic matches have `origin: automatic_match`, no application ID and no
  status. Management reports their separate count and shows only actual
  applications as actionable profiles. No application is invented for a match.
- `GET /applications/{application_id}/profile` returns professional summary,
  skills, experience, education and certification metadata. It excludes age,
  contacts, personal identification numbers and certificate documents. A foreign application returns
  `404 application_not_found`.
- `PATCH /applications/{application_id}/status` advances or ends an application.
- `GET /applications/me` includes a rejection `reason` for `not_selected` only;
  the candidate's existing application card displays it.

New applications start in `under_review`. Legacy `applied` records can move to
review; review can advance to `in_selection_process` or reject; selection can
hire or reject. Terminal records are read-only. Rejection requires a trimmed
reason of 1–500 characters; both terminal decisions require confirmation.

Mutations update the visible status from the validated API result and invalidate
job and application queries. A `409` refreshes the list and asks the company to
check the current status. Other failures keep the entered reason available for
retry. Duplicate actions and cancellation are disabled while saving.

## Validation

Build with the same explicit API address as CI:

```bash
VITE_API_URL=http://localhost:8000/api/v1 pnpm validate:push
```

This runs formatting, lint, types, unit/component coverage, the production build
and Cypress. Tests use synthetic data only. If Chrome is unavailable locally,
install it before `pnpm e2e:ci`, or run the built preview and use
`pnpm exec cypress run --browser electron` to exercise the bundled browser;
this does not change the repository's Chrome CI configuration.

- API tests validate mixed origins, decimal percentages, response IDs and status
  correlation, so a malformed response cannot enable application actions.
- Component tests cover profiles, transitions, terminal records, cancellation,
  empty states, initial job selection, retries and concurrent status changes.
- `cypress/e2e/candidate-management.cy.ts` follows both hiring and rejection across
  company/candidate sessions, with desktop/mobile and axe checks. Its API is
  stateful and controlled; it does not call production.
- Backend PostgreSQL integration tests exercise real submission, ownership,
  profiles, decisions, candidate feedback and terminal-state enforcement. Run
  the backend suite against a fresh isolated database: the existing seed tests
  intentionally persist synthetic seed records across complete suite runs.

No database migration or new package is required by US-21. Deploy the backend
profile/reason additions before the frontend that consumes them. The separately
observed AWS CodeBuild failures must be resolved before production rollout.
