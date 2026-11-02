# Data export (US-25)

Task: CU-86e3ke4te (US-25-T02). Consumes the backend exports from backend PR #60
(US-25-T01); the backend contract, columns and Excel format are documented in
the backend `docs/EXPORTS.md`.

## Where it appears

An "Exportar dados" button sits on the right of the page header, as in the
prototype's administrator Reports screen, on both filterable administrator
screens:

| Screen     | Route                   | API                                 |
| ---------- | ----------------------- | ----------------------------------- |
| Cadastros  | `/administrador/contas` | `GET /api/v1/admin/accounts/export` |
| Relatórios | `/administrador`        | `GET /api/v1/indicators/export`     |

Cadastros exports every account matching the current filters, not only the page
shown, so `limit` and `offset` are never sent. Relatórios exports the filters
already applied with "Aplicar filtros"; an unapplied draft never reaches the
file, so the CSV matches the numbers on screen.

## Download

`src/lib/download-file.ts` requests the file through `apiClient` with
`responseType: "blob"`, so the bearer token goes with it; a plain link would
reach the API unauthenticated. The file name comes from `Content-Disposition`
(exposed by the backend CORS policy) and falls back to `cadastros.csv` or
`relatorios.csv`. With a blob response an RFC 9457 error body also arrives as a
Blob, so the helper reads it and maps it again to keep the `ApiError` code.
`saveFile` hands the blob to the browser through a temporary object URL.

`src/components/export-data-button.tsx` is shared by the two features and owns
the TanStack Query mutation and its feedback.

## Interaction and accessibility

- While the file is generated the button reads "Gerando arquivo…" and is
  disabled with `focusableWhenDisabled`, so keyboard focus stays on it instead
  of falling to the page. The shared `Button` gives `data-disabled` the same
  disabled tokens as `:disabled`.
- Success is announced in a `role="status"` message ("Arquivo CSV exportado.").
  The visible label does not say CSV, so the message names the format.
- A refused export shows a `role="alert"` message: a 403 explains that only
  administrators export data; any other failure asks to try again. Pressing the
  button again retries.

## Tests

- `src/lib/download-file.test.ts`: file name, fallback, problem details read from
  a Blob, network failure and the browser download.
- `src/components/export-data-button.test.tsx`: focus while pending, success
  announcement, refusal messages and retry.
- Page tests: Cadastros sends the filters without pagination; Relatórios sends
  only applied filters.
- `cypress/e2e/admin-dashboard.cy.ts`: the browser saves the file under the
  name from `Content-Disposition`, focus returns to the button and axe passes.
- `tests/download-stub.ts` records downloads in jsdom, which has no object URLs.

End-to-end validation against the real API and Excel is US-25-T03.
