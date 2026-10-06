# Secure integration handoff — 6 October 2026

The supported local handoff is now documented step by step in [LOCAL-SECURE-HANDOFF.md](LOCAL-SECURE-HANDOFF.md), including the exact secret-free launcher command, available UI limitations and action-time user ownership. Anthony explicitly authorized API-key setup on 6 October 2026. The existing BC credentials are now reused only in the private server process; no env files were copied or values displayed. The restart command is `npm run start:connected-local`.

The mandatory new-gateway path is superseded for local operation by the implemented BC-style direct Google JWT/REST writer. No new Google identity, OpenAI key, Apps Script deployment, HMAC secret or Advanced Sheets service enablement is inherently required. The existing gateway source remains an optional alternative. Direct operation still requires verified existing account access, reviewed metadata tabs and exclusive writer ownership.

Current verified data is an authorized read-only import: 51 assets, 7 legacy history events, 67 employee rows, all existing IDs preserved. The import is mode 0600, Git-ignored and excluded from build tracing. A separate continuous Google read-only connection at 127.0.0.1:3408 now returns the same 51/7/67 counts. The existing OpenAI key passed a free model-list request (HTTP 200). No paid AI calls, Sheet writes, schema provisioning or public/LAN exposure have been activated.

Read-only setup comes first, with both AI and writes explicitly disabled. Existing BC credentials may be reused at runtime only through the user-controlled handoff; no env files are duplicated. A Google access denial stops the attempt; no new grants or key creation is authorized. OCR and research are separate approved capabilities, independent of write permissions.

The metadata design and exact headers are in the local handoff. Original Inventory/assignment_history headers and legacy IDs/history must remain intact. Test writes belong only in an approved isolated staging copy. Direct locking is limited to processes sharing this workspace; independent hosts/scripts/collaborators are outside it. Pending uncertain commands freeze future writes rather than silently retrying.

Authentication, trusted actor identity, physical phone/HEIC/Safari acceptance, distributed/monetary quotas, production monitoring, private photo retention and authorized reconciliation remain deferred or untested. The currently working preview stays loopback-only. Production deployment/cutover and PR publication are not approved.
