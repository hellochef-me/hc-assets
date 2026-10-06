# Hello Assets implemented design direction

Generated with the built-in image tool using the approved scan/device-photo board as a visual reference. All people and asset data in these boards are fictional.

- `update-assets-flow.png`: asset overview, editing, separate reassignment and before/after confirmation.
- `existing-serial-prompts.png`: exact-match interstitial and near-match comparison with differing characters highlighted.
- `scan-reading-states.png`: separate label-reading, inventory lookup and failed-read screens. No editable form or invented progress percentages during recognition.
- `device-camera-fullscreen.png`: full-screen device camera and captured-photo preview. Capture has Back, Upload and one shutter. Preview has Back, Use photo and Retake. Native camera fallback is exposed only when the live camera fails.

Implemented these directions with shared portrait, asset summary, serial-match and recognition-state components. Use actual device photos, or a consistent category placeholder where absent. Never substitute generic product imagery as if it were the actual asset. Label images remain temporary OCR inputs; only device photos enter the asset save. Existing photo storage and provider configuration are unchanged.

The edit form highlights name, serial and device photo, with optional fields in disclosures. Rescanning suggests a serial that must be explicitly adopted and checked against the device. Changed values are reviewed before a confirmed save. Record identity, version checks, idempotent retries and movement history remain intact. Reassignment is separate; storage options are Engineering Area and Locker, with empty location permitted while assigned.

Validation: lint, typecheck, 65 core tests and production build passed. The 59 browser scenarios cover duplicate and near-match paths, late OCR cancellation, delayed lookup, unreadable labels, edit review, save retries/conflicts, assignment, thumbnail separation, full-screen capture/preview, nested-dialog Escape, camera cleanup and mobile accessibility. Browser camera tests use a simulated stream; screenshot green frames are its test pattern. Paid providers and live Sheet writes are mocked for these workflow tests. Real phone camera permission/rotation behavior should also be checked on the user's device.
