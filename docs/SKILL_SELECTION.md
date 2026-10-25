# Candidate skill selection (US-06-T02)

The candidate selects catalog skills in the existing profile editor. Searching,
selecting chips, and removing selected chips change a local draft. The maximum
selection is 100 skills, matching the backend request limit. The search can find
skills beyond the first catalog page.

## Saving

When the selection differs from the last confirmed saved set, the editor sends
one `PUT /api/v1/professionals/me/skills` with `skill_ids`. An empty array clears
the set. The backend validates all IDs before replacing the set in one database
transaction, and the client validates the returned skill objects. This uses the
contract merged in backend PR #39.

The profile fields are then saved with `PATCH /api/v1/professionals/me`. These
requests are separate transactions. If the skills PUT succeeds and the profile
PATCH fails, the saved skills remain persisted. The editor explains this beside
the save actions, focuses the error, retains the draft profile fields, and retries
only the profile PATCH when the selection has not changed again. The editor is
locked during a save so edits cannot race with the response.

A failed skill save retains the complete local selection. For
`skill_not_found`, the catalog query is refreshed and the candidate can revise
the selection without closing the editor. The bulk endpoint does not identify
which skill is missing. The frontend must not silently drop selected skills or
treat absence from the first catalog page as proof that an item was removed.
If a connection fails after the backend commits, the client may not know that
the skills were saved; retrying the replacement request is safe.

## Closing and keyboard behavior

Cancel, Escape, the close button, and outside interaction ask for confirmation
when the skill selection or profile fields have unsaved changes. Continuing
editing preserves the draft; discarding closes the editor without reverting
previously persisted operations. The confirmation initially focuses the option
to continue editing.

Escape in a nonempty skill search clears the search and stays in the editor.
Escape from an empty search follows the normal close/confirmation behavior.
Closing refreshes the stored profile, including changes to collections that
were saved separately. A successful profile save closes without a discard
confirmation.

## Validation

Component tests cover the close paths, focus, the selection limit, a failed
skills PUT, a successful PUT followed by a failed profile PATCH, and retries.
`cypress/e2e/profile-skills.cy.ts` covers the browser save/discard flows,
keyboard behavior, mobile failure visibility, and axe checks using intercepted
synthetic API responses. These checks do not substitute for a human test with
the real backend and Cognito or approval by another team member.
