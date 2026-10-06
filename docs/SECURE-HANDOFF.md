# Secure integration handoff — 6 October 2026

The supported local handoff is now documented step by step in [LOCAL-SECURE-HANDOFF.md](LOCAL-SECURE-HANDOFF.md), including the exact secret-free launcher command, available UI limitations and action-time user ownership. Anthony explicitly authorized API-key setup on 6 October 2026. The existing BC credentials are now reused only in the private server process; no env files were copied or values displayed. The restart command is `npm run start:connected-local`.

The mandatory new-gateway path is superseded for local operation by the implemented BC-style direct Google JWT/REST writer. No new Google identity, OpenAI key, Apps Script deployment, HMAC secret or Advanced Sheets service enablement is inherently required. The existing gateway source remains an optional alternative. Direct operation still requires verified existing account access, reviewed metadata tabs and exclusive writer ownership.

Current live server reads return 51 assets, 7 legacy history events and 67 employee rows with original IDs preserved. The earlier mode-0600 snapshot remains Git-ignored and excluded from build traces. Existing BC credentials are reused at runtime; photo OCR and private user-triggered live saves are active under Anthony’s explicit approvals. Resale is enabled using the same BC model. Current UAE refurbished product prices are verified from public pages; blocked or unsupported sources return no comparable.

Google access initially failed with 403. Anthony explicitly approved Editor access for the existing BC service account on this workbook only, and permission readback confirmed writer access. No new account/key or broader file sharing was introduced. The three hidden metadata tabs were provisioned with exact original row hashes unchanged. No production test rows were created.

The metadata design and exact headers are in the local handoff. Original Inventory/assignment_history headers and legacy IDs/history must remain intact. Test writes belong only in an approved isolated staging copy. Direct locking is limited to processes sharing this workspace; independent hosts/scripts/collaborators are outside it. Pending uncertain commands freeze future writes rather than silently retrying.

Authentication, trusted actor identity, physical phone/HEIC/Safari acceptance, distributed/monetary quotas, production monitoring, private photo retention and authorized reconciliation remain deferred or untested. The currently working preview stays loopback-only. Production deployment/cutover and PR publication are not approved.


## Latest activation checkpoint

Anthony requested working OCR, live editing/inserting and BC’s exact model, and confirmed the old app is unused. OCR is enabled at `http://127.0.0.1:3405/scan` using BC’s configured `OPENAI_MODEL` or its current default `gpt-5.6-terra`; a real fictional-label request returned the exact printed brand/model/serial/specs.

Google initially returned 403 and the existing BC service account was absent from the sharing list. Anthony explicitly approved Editor access for `butchers-counter-orders@orbital-falcon-362007.iam.gserviceaccount.com` on this workbook only. That grant was applied and verified. Three hidden metadata tabs were provisioned atomically; the original Inventory/history/Employees row hashes and counts remained unchanged (51/7/67). No new account/key, production test row or public deployment was created.

The main preview now uses `HC_ASSETS_BACKEND=live`, `HC_ASSETS_WRITES_ENABLED=approved` and `HC_ASSETS_WRITER=direct`. It reads the original workbook and permits user-triggered confirmed creates/edits/movements. Resale is enabled using the same BC model. Current UAE refurbished product prices are verified from public pages; blocked or unsupported sources return no comparable. This checkpoint supersedes the earlier read-only/pending-access notes above. Restart with `npm run start:connected-local`.

Storage choices are Engineering Area and Locker. An empty location is allowed only when assigned to a person; current server assignment governs edits, and return/repair/retirement require a storage location. Existing records/IDs are untouched during setup. Current checks: 46 core tests and 36 browser scenarios plus lint, typecheck and build. Actual production domain mutations were not manufactured for testing; mock/local Sheet tests cover their contracts. The first real save will be an intended user action.
