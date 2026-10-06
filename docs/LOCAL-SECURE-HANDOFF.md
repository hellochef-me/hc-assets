# Local secure handoff for Anthony

On 6 October 2026 Anthony explicitly requested API-key setup in this project. Under that authorization, the existing BC credentials were loaded directly into the loopback server process without copying env files or displaying values. Google continuous read-only access returned 51 assets, 7 history events and 67 people; a free OpenAI model-list request returned HTTP 200. Paid AI, Sheet writes, metadata provisioning and deployment remain disabled. Do not send keys, private-key text or env-file contents in Slack/chat.

## Supported path

No verified secret-entry UI is bound to this local Next process. Codex exposes an environment secrets panel, but its documented environment finalization is a simulated cloud catalog, with no documented local-thread injection target. Sites/Higgsfield/Vercel controls target hosted projects and do not configure this local process. No callable 1Password runtime-injection tool is exposed in this session. None of those tools was used to collect or configure credentials.

Use your own Terminal on this Mac, or your own already approved secure remote terminal, when available. You do not need to paste or duplicate a secret: the prepared launcher reads the existing BC `.env` / `.env.local` at runtime and imports only `OPENAI_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` into the loopback HCAssets process. It does not import the BC workbook ID, payments, Slack or workstation operations credentials. The launcher passed synthetic tests and has now been used under Anthony’s explicit setup authorization. An environment approval flag is a guard, not evidence of human approval; credential reuse requires specific authorization for this source and destination. The earlier suggestion that Anthony must personally type the command was a conservative handoff proposal, not a platform requirement.

## Minimal first step: existing credentials, read-only

The approved connection can be restarted with `npm run start:connected-local` from this workspace. It contains no secret values, reloads only the selected existing BC credentials at runtime and preserves the disabled AI/write flags. It requires Node 20.12+ and the already built local workspace. The equivalent explicit command is:

```sh
cd /Users/anthonyponcio/Documents/Codex/2026-10-06/task-5/hc-assets-rewrite
HC_ASSETS_REUSE_BC_CREDENTIALS=approved HC_ASSETS_REUSE_BC_GOOGLE=approved HC_ASSETS_BACKEND=live-readonly HC_ASSETS_WRITES_ENABLED=disabled HC_ASSETS_AI_ENABLED=disabled HC_ASSETS_OCR_ENABLED=disabled HC_ASSETS_RESALE_ENABLED=disabled HC_ASSETS_LOCAL_PORT=3408 npm run start:approved-local
```

This creates a new process bound only to `127.0.0.1:3408`. Open `http://127.0.0.1:3408/settings` on this Mac. It attempts continuous Google reads of the HCAssets workbook, not BC orders. Writes and paid AI stay disabled. This link is not a phone/LAN link. Existing previews at 3405/3406 need not be stopped. Stop the new process with Ctrl+C.

Tell the parent task only “local secure launcher started” and whether Settings loaded or showed an access error; do not share any secret values. The agent may then verify counts/IDs with harmless reads. A denial stops this step: no sharing, new OAuth grants, IAM changes or replacement key creation. Existing Google read access is verified. Write access has not been tested.

## OCR and research after the read check

An explicit next approval must identify selected equipment photos being sent to OpenAI using the existing BC key, the vision model and the default allowance of 20 paid HTTP attempts/day and 4/minute. Models must be supported by the actual account; BC's successful text-chat model does not alone prove vision or web-search support. The agent can validate nonsecret model availability after a valid handoff. The free model-list request verified key validity; it did not exercise any vision or web-search model.

Anthony stops/restarts the same launcher himself with `HC_ASSETS_OCR_ENABLED=approved` and `HC_ASSETS_OPENAI_MODEL=<verified vision model ID>`, preserving `HC_ASSETS_BACKEND=live-readonly`, `HC_ASSETS_WRITES_ENABLED=disabled`, `HC_ASSETS_RESALE_ENABLED=disabled` and `HC_ASSETS_AI_ENABLED=disabled`. These model/flag values are not secrets. OCR works without enabling writes or configuring a resale model. Research is separately enabled with `HC_ASSETS_RESALE_ENABLED=approved` and `HC_ASSETS_SEARCH_MODEL=<verified research model ID>`; it sends brand/model/specs/condition, never serial, employee or purchase-cost fields. It performs one search request plus one structured extraction request and may find no verifiable AED comparable. Request-count limits are not a monetary cap.

## Reviewed metadata layout for confirmed writes

The designs below are nonsecret. No tabs have been created. Actual row contents remain private under existing Sheet access.

| Additional tab       | Exact headers                | Purpose                                                                                                                           |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `HCAssets_records`   | `id,version,part,json`       | Complete reviewed asset fields/photos, revision and original-row fingerprint. JSON chunks are at most 44,000 characters.          |
| `HCAssets_movements` | `id,json`                    | Append-only full actor/time/action/from/to/location/status/notes movement; matches the legacy event ID to prevent double display. |
| `HCAssets_commands`  | `requestId,digest,part,json` | Durable pending intent and immutable confirmed receipt, enabling unchanged-request retry without duplicate writes.                |

Inventory's 19 headers, assignment_history's 9 headers, Employees and all existing IDs/rows stay unchanged during schema provisioning. Domain operations later update the intended Inventory row and append history with RAW/string values; they do not rewrite old history or merge duplicate records. Metadata creation and a staging copy require separate specific approval. Test writes use a distinct approved staging Sheet ID, never test rows in production. Enabling real operation later requires approved write configuration (`HC_ASSETS_BACKEND=live`, `HC_ASSETS_WRITES_ENABLED=approved`, `HC_ASSETS_WRITER=direct`) after acceptance; it has not happened.

## Exclusive writer limit

Direct mode uses a shared filesystem lock for processes using this same workspace on this Mac, plus durable pending intent and atomic Google batches. It cannot fence another computer, another workspace directory, an Apps Script project or direct Sheet edits. Every writer must use this one authority before writes are enabled; the old gateway/other writers must be retired or otherwise stopped through an approved cutover. A fingerprint detects prior outside edits, not a simultaneous Sheet compare-and-swap. Any uncertain pending command freezes later writes for authorized reconciliation; no automatic expiry/resend exists. Authentication remains deferred; the actor is explicitly “Local operator (authentication deferred)”. No public or LAN exposure of real data or paid/write endpoints is approved.

## Current connection status

The connected local server is at `http://127.0.0.1:3408/settings`. Anthony authorized credential setup explicitly; both existing credential sets are accepted for the read-only checks above. No keys were copied to this project, logged, exposed to browser code or committed. The previous 3405 preview remains a timestamped snapshot. Restart with `npm run start:connected-local`; stop with Ctrl+C. Paid OCR/research and inventory mutations require their separately scoped activation steps above.
