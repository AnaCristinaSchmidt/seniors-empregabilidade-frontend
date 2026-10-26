# Administrator dashboard (US-24)

Integration task: CU-86e3ke4ra. Builds on the administrator account screen in
frontend PR #79 and the corrected backend indicators in PR #54.

## Route and contract

`/administrador` displays the dashboard after administrator sign-in. The
administrator sidebar's Reports link opens it; account management remains at
`/administrador/contas`. The parent route requires an administrator, and the API
independently checks the authenticated account's current role and status.

`GET /api/v1/indicators` returns `filters`, `totals` and `segments`. The shared
API client sends the bearer token and maps failures to `ApiError`. Zod checks
the response, including nonnegative integer counts. TanStack Query owns the
server state and passes its abort signal to Axios.

The screen shows candidates, companies, jobs, applications, potential matches,
unemployed candidates, unknown employment and incomplete resumes.

## Filters and calculation

Date, account status, availability, company situation, job status and application
status remain editable drafts until Apply is pressed. All filters combine in
one request. Clear restores the unfiltered view. A reversed date range is
reported before sending a request, with an accessible field error.

Dates include whole calendar days in America/Sao_Paulo and select each entity's
creation cohort. Status filters affect their own counts. Candidate, company and
job filters also restrict eligible matches; application status affects only the
application count. The screen explains these rules near the results.

Matches are distinct active candidate/open job pairs with at least 50% of the
required current skill IDs. Companies must be approved and active. No application
is required and stored application scores do not determine eligibility.

Unemployment uses the recorded employment status; unknown status is separate.
Incomplete resumes use the same six-field policy as US-08, not the legacy
completion percentage. Full calculation details are in backend
`docs/INDICATORS.md`.

## Interaction and accessibility

Loading, refreshing, failure/retry and empty results have separate messages.
A failed refresh does not present previous totals as current results. The grid
reflows without horizontal page scrolling. Native form controls have persistent
labels, visible keyboard focus and practical touch targets; text follows the
project's 16px minimum and 18px body scale. Bottom spacing keeps the support
button clear of the final content.

Component and Cypress tests cover navigation, combined filters, pending/error
states, invalid responses, empty results, keyboard interaction, reflow and axe
checks. An additional local browser exercise uses the real API and PostgreSQL
with only external identity replaced by synthetic accounts. Pull requests record
the final validation results.

## Delivery

The corrected backend #54 must be available before this dashboard. Frontend #79
is already integrated into main; this branch includes those US-23 changes and
targets main directly. The shared backend completeness helper is identical to
#57, avoiding incompatible calculations.

No new dependency or schema migration is required. The "Exportar dados" CSV
action is described in [DATA_EXPORT.md](DATA_EXPORT.md). Production Cognito
validation and final human acceptance remain separate work.
