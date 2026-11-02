# Candidate job detail (US-11-T02)

The candidate search opens the existing detail modal. Each opening requests
`GET /api/v1/jobs/{job_id}` through TanStack Query and validates its response
with Zod. Closing the modal cancels an unfinished detail request. Detail data
is not persisted and is discarded when the modal is no longer observed.

## Content and application state

The detail response supplies the description, company, full skill list, work
mode, optional location, closing date and application eligibility. Search
results supply only the existing compatibility summary and optional salary.
The date-only `closing_date` is displayed as `DD/MM/YYYY` without converting
it into a timestamp. Missing descriptions and empty skill lists have explicit
empty states.

`skills` is shown together under "Requisitos e competências". This does not
interpret `hard` and `soft` as separate product concepts; that distinction
still requires product confirmation.

The application button uses the server's `is_applicable` flag and stays disabled
while details load or refresh, after a detail failure, and during submission.
`already_applied`, `is_expired`, `status` and `is_open` provide explanatory
labels. A job with status `published` can still be expired according to the
server's calendar rules. The frontend does not reproduce those rules.

Application submission retains `POST /api/v1/job-postings/{id}/applications`.
Success updates the detail query and invalidates application and search data.
`already_applied`, `job_closed` and `job_not_found` errors refresh the detail
query to reconcile concurrent changes. Switching jobs or reopening the modal
starts a new mutation state; late results cannot show success for another job.

## Failures and accessibility

A detail `404` displays an unavailable message. Other detail failures offer
manual retry. Server exception text is never displayed. Loading, refresh,
success and failure messages use live regions.

The existing Base UI dialog provides modal keyboard behavior. Its `finalFocus`
reference explicitly returns focus to the job button that opened it. Content scrolls
within the viewport so long descriptions do not hide the footer. Interface
copy is Brazilian Portuguese and uses the existing design tokens.

The close-completion callback restores that focus again after the exit transition,
because closing a scrolled popup can otherwise blur the trigger on narrow screens.
It preserves the page's scroll position.

## Entry points

Search opens this detail in a modal. The applications list links `Ver a vaga`
to `/candidato/vagas/$jobId`, which renders the same detail outside the modal.
Both paths call `GET /api/v1/jobs/{job_id}` directly.

`already_applied`, `status`, `is_open`, `is_expired` and `is_applicable` come
only from that response. The applications list is not cross-checked to decide
whether the professional already applied or whether the job is open, closed or
expired. A `409` from submission still refreshes the detail when the job
changes between the read and the click.

## Verification

- API tests validate the real response shape, cancellation and error mapping.
- Component tests cover detail content, loading/retry, unavailable jobs,
  paused/closed/expired/already-applied states, submission, refresh and late results.
- The applications link and the page cover an open job with an enabled action,
  a closed or expired job that blocks applying, and an existing application.
- `cypress/e2e/job-detail.cy.ts` covers keyboard opening and focus return,
  application and reopening, closed/expired states, narrow viewport reflow,
  and axe checks against the built frontend with synthetic HTTP responses.
- `cypress/e2e/applications.cy.ts` covers opening the detail route from
  `Ver a vaga`.
- Run `pnpm validate:push` for the complete repository gates.

These frontend checks stub HTTP at the transport boundary.
