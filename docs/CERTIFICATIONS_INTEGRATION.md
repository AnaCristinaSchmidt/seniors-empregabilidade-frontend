# Certifications integration (US-07-T03)

Task: `CU-86e3ke40r`. Baseline: backend PR #42 (US-07-T01), frontend PR #71
(US-07-T02), infrastructure PR #10. The API contract is in the backend's
`docs/CERTIFICATIONS.md`.

## Required scenarios

| Scenario                                       | Frontend                                                                                                                                 | Backend (`tests/candidates/test_certification_router_integration.py`)                                                                                                                                                                      |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Add, attach and download as the owner          | `cypress/e2e/certifications.cy.ts`: the proof is sent as `multipart/form-data` and the downloaded file is read from the downloads folder | `test_owner_gets_a_short_lived_link`                                                                                                                                                                                                       |
| Unauthorized users cannot reach the file       | The profile shows the API refusal and never opens a link                                                                                 | `test_other_candidates_certification_is_not_found`, `test_company_cannot_manage_certifications`, `test_certifications_require_a_token`, `test_only_administrators_use_the_professional_route`, `test_administrator_route_checks_the_owner` |
| Invalid type or size is blocked with a message | A `.docx` and a file over 5 MB are refused before any request; a renamed file refused by the API shows the same message                  | `test_unsupported_file_is_rejected_before_storage`, `test_oversized_file_is_rejected_before_storage`                                                                                                                                       |

The Cypress tests stub HTTP responses, as the other browser tests do, and run
axe on the edit dialog and on the profile.

## Production check

Run once the infrastructure change is applied and both pull requests are
deployed, with the synthetic test accounts:

1. As the candidate, add a certification with a PDF proof, reload the profile
   and download it. The file must download, not open in the tab.
2. Copy the download link and open it after five minutes. Storage must refuse it.
3. Try a `.docx` and a renamed text file saved as `.pdf`. Both must be refused
   with "Envie um arquivo PDF, PNG ou JPG."
4. As the administrator, request
   `GET /api/v1/professionals/{professional_id}/certifications/{id}/document`.
   As the company, the same request must return `403`.
5. Remove the proof. The object becomes a noncurrent version in the uploads
   bucket and expires after seven days.

## Remaining dependencies

The production check needs the infrastructure change applied (IMDSv2 hop limit
and the uploads lifecycle rule) and `UPLOADS_BUCKET` in `/seniors/api/config`.
Until then, uploads answer `503 document_storage_unavailable`.
