# Account management integration (US-23)

Tasks: CU-86e3ke4pc (frontend) and CU-86e3ke4pm (integration).
This work builds on frontend PR #79 and the merged backend PR #53.

## Route and API

The administrator sidebar links to `/administrador/contas`. The parent route
checks the administrator role; the API independently enforces authentication,
role and current account status.

- `GET /api/v1/admin/accounts`: combined filters and pagination.
- `GET /api/v1/admin/accounts/{id}`: candidate or company details.
- `PATCH /api/v1/admin/accounts/{id}/status`: block/reactivate with a required reason.
- `GET /api/v1/admin/accounts/export`: CSV of the filtered list; see [DATA_EXPORT.md](DATA_EXPORT.md).

Deploy the accompanying backend completeness changes before this frontend.
The list and detail both require `missing_fields`: an empty array is complete,
a nonempty array is incomplete, and `null` identifies a company. This follows
the current US-08 policy. The legacy numeric percentage is not displayed.

The new `completeness=complete|incomplete` filter combines with type, account
status and company situation. Company-only and candidate-only filters can
legitimately produce an empty result. Changing any filter resets pagination.

## Interaction and accessibility

The table scrolls horizontally inside its container; the page fits the viewport.
Both the table and the dialog's details have labeled, keyboard-focusable scroll
regions. The inline lint notes document why these scroll regions require focus
even though they are not widgets. Automated WCAG checks still run on them.

If blocking removes the last row of a later page, Previous remains available.
The page explains that the current page is empty instead of claiming that no
accounts match the filters.

The reason is trimmed and required, with a maximum of 500 characters. While
saving, the reason and close controls are disabled and Escape cannot dismiss the
dialog. Failed requests retain the reason and allow retry. Successful changes
refresh account queries and display a confirmation.

Blocking denies access on the next authenticated request. Blocking a company
also removes its jobs from candidate search; reactivation restores the jobs
that remain eligible. The backend records the authenticated administrator,
target, previous/new statuses and reason in the same transaction.

## Validation

- Backend PostgreSQL tests compare list/detail completeness with US-08,
  including empty and Unicode whitespace fields and stale percentages.
- Component tests cover completeness, filter resets and recovery from an
  emptied last page.
- `cypress/e2e/admin-accounts.cy.ts` covers menu navigation, 390–1280px reflow,
  WCAG 2.2 AA axe checks, keyboard focus, pending/error/retry and pagination.
- The local integration exercise uses the real API and PostgreSQL with only
  external identity replaced by synthetic accounts. It verifies combined
  filters, candidate access, company job visibility and persisted audit events.

No new dependency or migration is needed. Final human review and deployment
remain delivery steps.

Local validation on 2026-10-25 passed the backend and frontend test suites,
coverage gates, production build and full Cypress suite. Formatting, Ruff,
strict mypy, ESLint and TypeScript also passed. The accompanying pull requests
record the final totals after incorporating the latest main branch.

The production build additionally passed a real-API browser exercise with
PostgreSQL 18.4: US-08 and account filters agreed, stale 0/100 percentages did
not affect completeness, candidate blocking denied access, and company blocking
removed its job from search. Reactivation restored both access and job
visibility. Direct database inspection verified all four audit events, including
their actor, target and exact justification.
