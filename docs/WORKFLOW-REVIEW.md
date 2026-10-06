# Registration workflow review — October 6, 2026

The scan flow separates four decisions: read a label, review identity and owner, choose a device thumbnail, then confirm registration. Label images exist only in component memory and are sent to OCR with `store: false`; they are not written into session drafts or inventory. Only the separately chosen device photo persists. Device photos remain encoded in Sheet metadata; private Vercel Blob coordinates the writer and shared AI quota.

Exact serial matches open the existing record. A missing character, substitution, transposition, or formatting difference prompts comparison with possible existing records. The controlled direct writer repeats both checks while holding its shared lock. Near matches require explicit confirmation that the device is different; exact matches cannot be bypassed. Unknown serials cannot be deduplicated automatically and still require explicit acknowledgement.

Registration can assign a directory owner atomically. Unassigned assets require Engineering Area or Locker; assigned assets may omit storage location. Details and Edit expose reassignment, which creates a versioned movement event. Stale changes require reloading rather than silently overwriting another save. Retried saves keep their request identity.

An operator-only duplicate consolidation planner retains both original IDs, archives the duplicate as an alias, preserves historical events and the canonical owner, and writes an audited confirmation receipt. It rejects changed versions, conflicting owners, unverified differing serials, and pending commands. Production cleanup takes a private backup before mutation and uses the same hosted writer lock as the app. Old duplicate links resolve to the canonical record. There is no public consolidation endpoint.

The user approved `gpt-6.1-sol` for OCR and resale. Actual image extraction returned HTTP 200 and correctly read a fictional label using the existing server-only key. The indicative pricing structured-output call also returned HTTP 200. Current-listing search was not re-run for this model migration. No changes were made to Butcher’s Counter credentials or model settings.

Validation covers exact and near duplicate scans, simultaneous identity checks, assignment and transfer, archived links/history, interrupted saves, responsive layouts, keyboard/accessibility, and temporary label versus persisted device photos. Live Sheet cleanup is verified separately with private before/after snapshots; tests use fictional fixtures.
