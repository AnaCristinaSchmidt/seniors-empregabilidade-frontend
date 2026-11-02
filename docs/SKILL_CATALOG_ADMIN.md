# Skill catalog administration (US-06-T03)

Task: CU-86e3ke3vh. The administrator keeps the skill catalog used by résumés
and jobs: lists it, adds and edits entries, and inactivates or reactivates them.

## Route

The administrator sidebar links to `/administrador/competencias`. The parent
route checks the administrator role; the API must enforce it independently.

## API contract

The backend implements these endpoints since US-06-T04 (CU-86e3ke3w9); its
`docs/SKILL_CATALOG.md` is the reference. All paths start with `/api/v1` and
answer `403 administrator_required` to other roles.

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

## Meaning of inactivation

The confirmation tells the administrator that an inactive skill:

- stops appearing in `GET /skills`, so candidates cannot select it and
  companies do not get it as a suggestion;
- stays on the résumés and jobs that already use it, so compatibility does not
  change silently;
- can be reactivated later.

A candidate whose résumé already has an inactive skill keeps it when saving the
profile again, but cannot select it anew once removed (`404 skill_not_found`,
see `docs/SKILL_SELECTION.md`). A company typing the name of an inactive skill
does not recreate it, because the normalized name is unique: the job links the
existing inactive entry.

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

- `cypress/e2e/skill-catalog-flow.cy.ts` follows one catalog across the
  administrator, candidate and company screens (US-06-T04), with an in-memory
  API that applies the backend rules above.

The backend PostgreSQL tests cover the real endpoints, including the same flow
through the API (`tests/skills/test_catalog_end_to_end_integration.py`).
