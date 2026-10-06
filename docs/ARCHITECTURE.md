# Local preview architecture

Next.js App Router + React + TypeScript, using the same server-only environment boundary, JSON errors, input size bounds, origin checking and private credential convention inspected in Butchers Counter. No credentials were copied. The native HelloChef header SVG is sourced from the official site; a system font fallback is intentional until a licensed Publica Sans file is supplied.

## App and domain

Inventory has text search and status/category/person/location filters, keyboard search, desktop contextual preview, and phone cards. People, locations and activity use the same snapshot. Asset detail separates purchase cost/currency from resale evidence, supports edits and assignment/transfer/return/repair/retirement.

Phone registration uses the native camera/file picker. JPG/PNG/WebP are compressed locally to a maximum 1,400px edge; three photos maximum, 20MB original limit and bounded encoded size. HEIC is explicitly unsupported in this preview. Photo preparation can be cancelled; asynchronous completion is ignored after cancellation. No photos leave this computer. Review comes before persistence; camera pictures never prove function, battery health, accessories or hidden specs. Unknown serial/specs/condition remain explicit.

Serial identity is outer trim + case folding ONLY. Internal spaces, hyphens and punctuation remain meaningful. After human serial verification, lookup checks a fresh snapshot: one match opens existing detail, no match continues new registration, multiple matches expose explicit record choice without merging. Existing lookup needs no asset name. Unknown/missing serial requires explicit confirmation. Server duplicate checks apply again at persistence; races do not rely on the earlier browser lookup.

## Confirmed local writes

lib/server/store.ts stores assets, full movement events and idempotency receipts together in one snapshot. A lock directory serializes competing writers, including separate Node processes. All validation, serial uniqueness and expectedVersion checks run while holding that lock. A temporary file and atomic rename install the complete snapshot; a response is returned only after rename. A failed/uncertain request preserves the client draft. Retrying an unchanged payload uses the same request UUID and returns its stored receipt without a second event. Reusing a UUID with different content is rejected. Editing preserves existing ID and createdAt.

The lock deliberately fails closed. A terminated writer can leave a lock requiring local manual recovery after verifying there is no running writer; it is not automatically broken based on time. This is a local preview store, not a distributed production database. Rename provides local atomic visibility, not a disaster-recovery guarantee. Backups/fsync and durable multi-instance writer coordination remain production work.

Movement events store actor (Demo operator), server time, from/to assignee, location, status, and notes. No destructive deletion endpoint exists. Retirement preserves all history and prevents new movements. Production actors must come from authenticated identity, never a browser-supplied name.

## Integration boundaries and existing data

lib/server/sheets.ts is a read-only, injected Google Sheets REST adapter, with mock network tests. The app never instantiates it. Decoding retains original IDs, original row strings (raw), purchase currency/cost, and original timestamps. Missing condition/location/specs remain unknown. Duplicate IDs stop import; duplicate serials remain separate records for explicit resolution. The existing 19 inventory fields and 9 assignment_history fields are documented from repository code. Employees is decoded as name/department. No live rows were read into this preview or edited. Existing unknown currencies remain preserved, not silently relabeled AED.

lib/server/integrations.ts defines server-only environment and intelligence interfaces. Adding an OPENAI_API_KEY or Sheet ID does not activate either service. /api/scan and /api/resale explicitly return 503. They make no outbound requests and cannot incur AI charges. Market range is blank until actual source evidence exists; the sample image’s resale prices are not copied into the app. Future providers must keep source URL, checkedAt, original currency, region, condition and explicit AED conversion evidence.

The dev/start scripts bind 127.0.0.1. API requests reject non-loopback hosts/forwarded addresses, external origins and any non-demo mode. This is defense for a private local preview, not authentication. Do not expose the service, credentials or real employee inventory publicly. Authentication, live integration and deployment are explicitly deferred. The previous GitHub Pages auto-deploy workflow and VITE browser AI/Apps Script environment interfaces have been removed from this isolated rewrite. No replacement deployment workflow is enabled.

## Before live integration

1. Review/approve this local UX, including physical phone camera and keyboard behavior. Decide HEIC support and photo retention/access policy.
2. Select authentication and authorization; resolve actor identity and protect reads, writes, photos and paid endpoints. Add rate limits/quotas before provider access.
3. Configure approved existing credentials securely in server-only hosting; no new keys, IAM changes or client secrets are required by this preview.
4. Read-only validate exact live tab/header schema and ID mapping. The parent previously reported 51 unique assets, 7 history rows and 67 employee rows; those counts are contextual, not re-verified by this implementation. Back up and reconcile without changing IDs or rewriting history.
5. Approve storage for new location, accessories, condition verification, complete movements, revision and idempotency metadata. Existing headers must not be changed implicitly. Additional columns/tabs or a sidecar need a separate reviewed migration.
6. Implement one controlled, durable writer. Google Sheets has NO native unique serial constraint. Do not issue independent asset/history appends. Use a singleton/durable transaction coordinator plus an atomic Sheet batch for asset/history/revision/receipt projection, with acknowledged errors and retry receipts. Disable the legacy write gateway before cutover. Decide which durable store is authoritative and when projection acknowledgement is considered confirmed.
7. Account for direct Sheet edits: regular read-only ID/serial/revision/fingerprint audits; flag collisions or out-of-band edits, stop affected writes and require explicit human reconciliation. Never merge legacy duplicates automatically or fabricate missing actor/location/status events.
8. Connect OCR with structured, field-level evidence and human review; test unreadable labels, injection in photo text, unsupported fields, provider timeouts and spending bounds. Connect current market research with verifiable cited listings and currency provenance; no invented comparables.
9. Test a staging copy, backup/rollback, concurrency, duplicate reconciliation, interrupted writes and replay before any authorized production deployment/cutover.
