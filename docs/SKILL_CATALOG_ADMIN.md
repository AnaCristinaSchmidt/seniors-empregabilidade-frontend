# Skill catalog administration (US-06-T03)

Task: CU-86e3ke3vh. The administrator keeps the skill catalog used by résumés
and jobs: lists it, adds and edits entries, and inactivates or reactivates them.

## Route

The administrator sidebar links to `/administrador/competencias`. The parent
route checks the administrator role; the API must enforce it independently.

## Proposed API contract

The backend has only `GET /skills` so far (see the backend
`docs/SKILL_CATALOG.md`). The administrative endpoints below are a proposal
that this screen already consumes; the backend task must implement them, or
this page and its tests must follow whatever contract it settles on. All paths
start with `/api/v1` and answer `403 administrator_required` to other roles.

| Endpoint                   | Request                                                                                                                                               | Success                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /admin/skills`        | `search` (optional, matched like `GET /skills`), `type` (`hard`/`soft`, optional), `status` (`active`/`inactive`, optional), `limit` (1–50), `offset` | `200`: `{ "items": [Skill], "total": n }`, sorted by name, inactive entries included |
| `POST /admin/skills`       | `{ "name": "...", "type": "hard" }`                                                                                                                   | `201`: `Skill`, created active                                                       |
| `PATCH /admin/skills/{id}` | any of `name`, `type` and `status`                                                                                                                    | `200`: the updated `Skill`                                                           |

```json
{
  "id": "<uuid>",
  "name": "Trabalho em grupo",
  "type": "soft",
  "status": "active"
}
```

The screen sends `{ "name", "type" }` when editing and `{ "status" }` when
inactivating or reactivating.

Errors the screen explains:

- `409 skill_name_conflict`: the normalized name already belongs to another
  entry, active or not. Renaming an entry to a spelling of its own name, such
  as fixing an accent, is not a conflict.
- `404 skill_not_found`: the entry no longer exists.
- `422 validation_error`: the name rules of `SkillName` (1–100 visible
  characters after normalization).

## Expected meaning of inactivation

The confirmation tells the administrator that an inactive skill:

- stops appearing in `GET /skills`, so candidates cannot select it and
  companies do not get it as a suggestion;
- stays on the résumés and jobs that already use it, so compatibility does not
  change silently;
- can be reactivated later.

A company typing the name of an inactive skill should not recreate it as a new
entry, because the normalized name is unique. The backend task decides whether
the job keeps the inactive entry or the name is refused.

## Interaction and accessibility

Search (debounced), type and status filters combine and reset pagination. The
name field reports a duplicate name and receives focus once the form is enabled
again; other failures keep the typed values and allow retry. A new skill starts
without a type so the administrator classifies it deliberately. Inactivation
asks for confirmation; reactivation does not. The status button keeps its place
in the row so keyboard focus survives the refreshed list.

## Validation

- Component tests cover listing, combined filters and pagination, empty and
  failed lists, creation with validation and a duplicate name, editing, a
  failed save, and inactivation/reactivation with failures.
- `cypress/e2e/admin-skills.cy.ts` covers menu navigation, 390–1280px reflow,
  WCAG 2.2 AA axe checks on the page and both dialogs, keyboard submission and
  the request bodies, using intercepted synthetic responses.

These checks do not replace a test against the real backend once its endpoints
exist.
