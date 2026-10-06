# Validation — 6 October 2026

## Completed

- `npm run check`: lint, TypeScript, 16 core tests and optimized Next.js build passed.
- Chrome browser suite: 23 scenarios covering local API reads/writes, unavailable paid providers, hostile-origin rejection, responsive inventory/detail/registration, verified existing-serial lookup → detail → edit, explicit legacy duplicate selection, new intake, missing serial, duplicate edit error, stale edit recovery, interrupted save/retry, browser refresh/back, delayed/cancelled photo preparation, valid/invalid photo input, long serials, orientation, keyboard search, filters, preview, confirmed movements and real browser create/edit/assignment persistence.
- Responsive widths: 320, 360, 390, 430, 768, 1280 and 1440px. Inventory, detail, capture, review and confirm had no horizontal overflow. Page errors were checked during responsive flows.
- Axe WCAG 2 A/AA and 2.1 AA scans on mobile inventory, capture, review, detail and edit dialog passed without reported violations. Keyboard dialog Escape/focus restoration and search shortcut checked. Reduced-motion test removes translation and caps animation duration at 80ms.
- Core tests cover trim/case canonicalization while retaining internal serial characters; multiple legacy serial matches; human-verification guards; atomic asset/history/receipt persistence; same-request retry after restart; duplicate create/edit; simultaneous create contention and duplicate retry; optimistic version conflicts; movement states/history; unknown directory person rejection; corrupt store/active lock failure; original IDs, raw row values and currencies; duplicate canonical Sheet headers; mocked Sheet HTTP/payload failures; request limits and safe errors; internal Next localhost URL versus actual loopback Host/Origin.
- Runtime dependency audit (`npm audit --omit=dev`) reports zero vulnerabilities. Compatible security patches were applied. Full development audit still reports five high entries in one lint-tool chain (`eslint-config-next` → Next ESLint plugin → fast-glob → micromatch → braces, GHSA-vfj7-8cjw-p6xm). Registry proposed an incompatible Next ESLint downgrade; it was not applied. Resolve that tooling advisory before broad CI use with untrusted glob patterns.
- `git diff --check` passed. All work is local on `feat/next-assets-rewrite`; no push/PR/deployment or real Sheet mutation.

## Evidence

[Desktop inventory](screenshots/inventory-1440.png) · [Contextual preview](screenshots/inventory-preview-1440.png) · [Mobile inventory](screenshots/inventory-390.png) · [Mobile detail](screenshots/detail-390.png)

[Phone capture viewport](screenshots/capture-390-viewport.png) · [Phone review viewport](screenshots/review-390-viewport.png) · [Phone confirm viewport](screenshots/confirm-390-viewport.png)

Full-page phone form screenshots also exist. Full-page captures can place the sticky action footer over content at the current scroll offset; the viewport screenshots show actual phone framing. All imagery is fictional fixture content and interface screenshots, never actual employee data.

## Limits

Browser tests ran in desktop Google Chrome, including against the optimized production build served only on 127.0.0.1. This is viewport emulation, not physical iOS/Android, Safari, OS keyboard, camera permission, screen-reader or slow-device certification. Original HEIC images are not supported yet. Live OCR, internet resale providers, auth and Google Sheet transport were not exercised; Sheet adapter network tests are mocked. No real-market estimate is displayed. A lost-response UI test uses a mocked acknowledgement failure after its fictional commit; core tests verify real store idempotency separately. Local file atomic rename/lock is not distributed production persistence.
