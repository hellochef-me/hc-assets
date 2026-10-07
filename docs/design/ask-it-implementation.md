# Ask IT implementation and release review

Approved plan: HA-ASK-IT v1, 7 October 2026. The user subsequently authorized production release and requested removal of verification and physical-inspection checkboxes. Scan remains a separate workflow. Release execution and its final deployed status are owned by the main agent; the QA described here uses fictional data and mocked requests.

## Work packages

| Task                                | Owner              | Deliverable                                                                                              | Check                                                                                           |
| ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Conversation and navigation         | Main agent         | Ask IT route, choices/text, selected asset context, shared camera, read/review/save states, Scan handoff | Mobile/desktop reference comparison and workflow tests                                          |
| Multiple specifications/accessories | multi_entry_fields | Shared list editor and bullet display across Scan, detail and Ask IT                                     | Local/mock Sheet persistence; legacy strings retained; paste/remove/limit tests                 |
| Assistant services                  | assistant_services | Intent-only service, OCR and separate quick estimate/research; typed responses                           | Mock provider/quota/error tests; demo never calls a paid provider                               |
| Workflow QA                         | assistant_qa       | Identity, interrupted saves, owner/location, reassignment, photos, accessibility                         | Fully intercepted browser tests against isolated local demo                                     |
| Integration/release review          | Main agent         | Full checks and reviewable preview                                                                       | User-authorized release; real-network behavior identified separately from fictional/mock checks |

## Architecture

- `/ask-it` adds a choice-first conversation without removing `/scan`.
- `assistant-flow.ts` owns identity checks, draft validation, immutable command preparation, and versioned session restoration. Pending writes retain the exact body and request ID across retries.
- Existing inventory writer APIs remain the only write path. Assistant interpretation, OCR and valuation endpoints are read-only. UI changes are drafts until an explicit confirmation button is used.
- The simplified flow removes verification and physical-inspection attestations from Ask IT, Scan and asset editing. Users enter specifications, choose condition, and review the resulting draft directly. These inputs do not establish independently verified specifications, battery health or working function. Unknown remains available.
- Serial duplicate checks remain independent of attestation flags: normalized exact identities open the existing record or are rejected by the writer. A possible match shows the existing candidate and an explicit Continue as a different device action; that action carries the candidate IDs to the server. Unknown serial uses a direct continuation after an inventory search and retains the identity-uncertainty notice.
- Legacy `serialChecked`, `specsChecked` and `conditionChecked` fields remain for schema compatibility, but are no longer mandatory write gates. New inputs are not automatically marked inspected or verified. Ask IT still binds the checked serial lookup to the current draft serial, and serial corrections invalidate previous lookup/match state.
- Demo assistant services return clearly labelled fictional OCR and valuation fixtures. Live provider behavior is implemented behind `HC_ASSETS_ASSISTANT_ENABLED=approved` and the existing OCR/research gates; production feature configuration is handled by the main agent within the approved release.
- Conversation drafts live in session storage for up to 12 hours of inactivity. Clear conversation removes the working draft. Temporary label bytes never enter persisted state or inventory thumbnails.
- Specifications/accessories remain compatible strings, separated by newlines; each entry is displayed as a bullet. Existing prose is kept as one entry. The existing 400-character aggregate limit remains.
- Research returns source/assumption distinctions and separate good/fair/parts scenarios. Explicitly reviewed estimates can be appended to notes; purchase cost is untouched. No new Sheet columns or data migration are introduced.

## Reference fidelity

The two approved boards are at `../ask-it-proposal/ask-it-register.png` and `ask-it-manage.png` relative to the task workspace. Implementation follows white canvas, compact question bubbles, choices above an always-available composer, selected-asset cards, and separate Scan/Ask IT navigation. Desktop adds a context side panel. Missing device photos use category icons, not generated pictures presented as evidence.

## Release and verification boundary

Production release is authorized. The main agent owns deployment and production feature configuration. QA uses isolated fictional inventory and mocked assistant/write/provider responses; it does not make live Sheet writes or paid AI requests. Physical phone cameras and production-network reliability are distinct from the automated local evidence. Saved transcript retention beyond the current tab/session is deliberately excluded.

## Verification evidence

The earlier built-preview baseline passed `npm run check` (ESLint, TypeScript, 91 core/unit/route tests and production build), the full 81-case browser regression, and 22 focused assistant cases. It established duplicate protection, retry identity, stale-version recovery, ownership/storage rules, cancellation, multiline fields, typed replies and mobile accessibility. These historical results preceded the removal of attestation controls.

The simpler release candidate has been reviewed read-only for duplicate protection and false inspection claims. Exact and possible-match writer checks, immutable retry payloads, version checks, explicit write confirmation, and ownership/storage validation remain. No release blocker was identified by that review. The main agent is running the updated `npm run check` and browser suite against the isolated demo at `http://127.0.0.1:3418`; those results should be recorded by the main agent once complete. No QA browser suite was run concurrently with that validation.

The current flow allows a user-selected condition or entered specifications to reach review without an attestation checkbox. Resale outputs remain hypothetical scenarios and do not certify actual battery health, function or physical inspection. Missing device photos continue to use category icons. No Sheet schema migration is introduced.

## Simplified-flow release validation — 7 October 2026

Lint, types, production build and 92 core tests passed. Browser validation: 84 cases passed in the full run; the remaining near-serial test still expected the removed attestation gate. After updating it to assert the explicit distinct-device choice, retained candidate IDs and zero writes before confirmation, its focused rerun passed. All 85 scenarios are validated. Screenshot gallery refreshed. Duplicate protections remain in both application and controlled Sheet writer. No live inventory was changed during QA.
