# Ask IT release QA

Scope: the additive `/ask-it` route and its entry points, using fictional inventory and intercepted requests. Scan remains a separate route. The user approved production release and then requested removal of verification and physical-inspection checkboxes. This QA review makes no live inventory writes or paid AI requests; deployment is handled by the main agent.

## Acceptance matrix

| Area          | Scenario                                | Required evidence                                                                                                                                                       |
| ------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entry         | Inventory, Scan and asset-context entry | All destinations remain reachable; contextual conversation retains the immutable asset ID.                                                                              |
| Registration  | Normalized exact serial                 | Existing asset is offered; no create request occurs.                                                                                                                    |
| Registration  | Near serial                             | Candidates are presented before an explicit distinct-device continuation; candidate IDs reset after identity changes. No attestation checkbox is required.              |
| Registration  | Unknown serial                          | An inventory search, direct unknown-serial continuation and alternative identifying name; the identity-uncertainty notice remains. No attestation checkbox is required. |
| Registration  | Owner and storage                       | Employee resolves to an actual record; empty location only with an assignee; unassigned registration requires Engineering Area or Locker.                               |
| Confirmation  | Ordinary replies and review             | Ordinary Enter/choice actions never write; complete identity, ownership, location and unknowns appear before explicit confirmation.                                     |
| Confirmation  | Repeated click / interrupted response   | One stable request ID represents the same proposed command; retry preserves the draft and request ID.                                                                   |
| Edit          | Field-level review                      | Before/after values are visible and request targets the original asset ID with its version.                                                                             |
| Movement      | Transfer and return                     | Exact employee selected for transfer; return explicitly chooses storage; confirmed request retains asset ID/version.                                                    |
| Concurrency   | Stale asset version                     | Conflict announces failure, keeps the proposal, reloads current state and requires a fresh review before a new write.                                                   |
| Capture       | Label OCR cancel                        | Cancel restores a usable step; delayed OCR cannot replace newer input; label bytes absent from draft/history and device thumbnail.                                      |
| Capture       | Separate device photo                   | Only an explicitly retained real device photo may become thumbnail; removal cancels pending work.                                                                       |
| Providers     | Quota/offline                           | Clear recoverable message; draft intact; manual/Scan path usable; no blind provider retry.                                                                              |
| Value         | Estimate and research                   | Indicative ranges, date, assumptions and uncertainty; current listings have real links; estimate only saved after review.                                               |
| Navigation    | Cross-mode handoff and reset            | Explicit handoff carries same draft ID; no auto-save; Clear conversation removes draft state.                                                                           |
| Accessibility | Mobile and desktop                      | Native keyboard-accessible choices, labeled composer, announced state changes, no horizontal overflow, WCAG AA scan.                                                    |

## Current simplified flow and read-only review

Users enter specifications and select condition directly, then review the proposed change. Verification and physical-inspection checkboxes are removed from Ask IT, Scan, possible-match comparison and asset editing. The same final confirmation buttons control writes. These entries are user-recorded values, not evidence of independent verification or completed physical inspection.

The read-only release review found no blocker in the revised identity protection: exact canonical-serial rejection remains in both writer implementations; possible-match IDs are still required server-side and are provided by the explicit distinct-device action. Serial changes invalidate the previous identity lookup/match state. Idempotent retries, expected-version conflicts, ownership/storage rules and temporary label handling remain. Legacy inspection flags are retained for compatibility and are not automatically asserted by choosing condition or entering specifications.

The main agent is running `npm run check` and the updated browser regression against the isolated demo on port 3418. This QA agent did not run browser tests concurrently. The earlier results below are historical baseline evidence and do not replace the updated release-candidate checks.

## Previous built-preview baseline

Before attestation removal on 7 October 2026, all **22 Ask IT browser tests passed** against the isolated fictional production build at `http://127.0.0.1:3416` (28.6 seconds). The test file also passed ESLint and Prettier formatting. Tests intercept every `/api/**` request: an unconfigured request receives a mock error rather than reaching a live writer or paid provider.

```sh
HC_ASSETS_TEST_URL=http://127.0.0.1:3416 npx playwright test tests/browser/assistant.spec.ts --output /tmp/ask-it-test-results --reporter=list
npx eslint tests/browser/assistant.spec.ts
```

The historical baseline covered:

- Accessible welcome choices and no horizontal overflow at 390, 1280 and 1440 pixels.
- Normalized exact serial opens existing identity without creation; possible serial matches require a distinct-device continuation. The old checkbox assertion is superseded by the simpler action in the updated tests.
- Choice-first registration resolves a real directory employee, preserves Unknown condition, rejects ordinary Enter as confirmation, and sends only one write for a double click.
- Unassigned registration rejects empty storage; a confirmed employee may use With assignee.
- Unknown serial requires a search and retains an uncertainty notice; duplicate directory names cannot be assigned. The old uncertainty-checkbox assertion is superseded by the direct continuation action.
- Interrupted creation preserves the identical payload and request ID, leaving one receipt and one asset.
- Edit retains the original asset ID and version. A stale version reloads current data, preserves the proposed value, requires a new review, and then submits version 2 with a new request ID.
- Transfer and return show the previous and next owner/location before the explicit write; return uses Locker.
- Cancelled OCR cannot replace a newer typed serial; label bytes and photos remain absent from the stored draft.
- Specifications and accessories display separate list entries and save in the existing newline string fields.
- Indicative resale shows three scenarios, date and uncertainty; saving it requires a review and leaves purchase cost intact.
- Explicit Scan–Ask IT handoffs retain the same draft ID, asset name and serial without submitting the draft.
- Typed photo skip, Good condition, return to Locker, manual serial entry and negative serial confirmation follow their choice equivalents. The old Good-condition inspection-checkbox gate is removed; the updated tests should require direct review without an attestation.
- Assigned storage edits preserve owner and serial; unassigned storage moves use an asset edit and require review before submission.

Axe reported zero WCAG A/AA violations on welcome, registration review, transfer review, return review, multiline detail review and resale. Browser tests use native keyboard interaction with the choices and composer. Mobile photo and confirmation controls were scrolled into view and their bounds verified inside the message stream and above the composer.

## Screenshot evidence

| State                               | Local screenshot                                                 |
| ----------------------------------- | ---------------------------------------------------------------- |
| Welcome, mobile                     | [390 px](../screenshots/ask-it-start-390.png)                    |
| Welcome, desktop                    | [1440 px](../screenshots/ask-it-start-1440.png)                  |
| Reading label with Cancel           | [390 px](../screenshots/ask-it-reading-390.png)                  |
| Possible serial match               | [390 px](../screenshots/ask-it-near-match-390.png)               |
| Owner or storage choices            | [390 px](../screenshots/ask-it-owner-390.png)                    |
| Optional device photo guide         | [390 px](../screenshots/ask-it-photo-guide-390.png)              |
| Photo actions, scrolled             | [390 px](../screenshots/ask-it-photo-actions-390.png)            |
| Registration confirmation, scrolled | [390 px](../screenshots/ask-it-registration-actions-390.png)     |
| Registration review                 | [390 px](../screenshots/ask-it-registration-review-390.png)      |
| Existing asset edit review          | [1440 px](../screenshots/ask-it-edit-review-1440.png)            |
| Reassignment review                 | [390 px](../screenshots/ask-it-transfer-review-390.png)          |
| Return review                       | [390 px](../screenshots/ask-it-return-review-390.png)            |
| Specifications/accessories review   | [390 px](../screenshots/ask-it-specs-accessories-review-390.png) |
| Indicative resale                   | [390 px](../screenshots/ask-it-resale-390.png)                   |

Visual inspection confirmed category icons before a real device photo exists, explicit coral confirmation controls, readable before/after values and the desktop context panel. The final production build uses compact mobile context/header content and a scrollable message area above the composer. These screenshots were refreshed by the earlier 22-case run and should be refreshed by the main agent's current simplified-flow suite; visual inspection confirmed the photo and registration actions are unobstructed.

## Verification limits and follow-up

The browser suite proves client behavior under controlled responses. Server unit/route tests remain necessary for simultaneous-confirmation idempotency, canonical serial race prevention, employee authorization, provider budget enforcement and draft/version binding. Physical-device camera permissions and the OS virtual keyboard are outside headless Chromium coverage.

The read-only release review has no identified blocker. The main agent owns the updated build/browser results and the authorized production deployment. The previous 81-case regression and 22 focused assistant checks remain historical evidence; the simplified-flow release validation must be reported separately.

## Simplified-flow release validation — 7 October 2026

Lint, types, production build and 92 core tests passed. Browser validation: 84 cases passed in the full run; the remaining near-serial test still expected the removed attestation gate. After updating it to assert the explicit distinct-device choice, retained candidate IDs and zero writes before confirmation, its focused rerun passed. All 85 scenarios are validated. Screenshot gallery refreshed. Duplicate protections remain in both application and controlled Sheet writer. No live inventory was changed during QA.
