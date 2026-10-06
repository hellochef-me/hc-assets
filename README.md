# HelloChef HCAssets — private local rewrite

Mobile-first Next.js preview with an authorized read-only import of the existing Sheet (51 assets, 7 history events, 67 employee rows). It uses fictional fixtures when no import is present or demo mode is explicitly selected. Existing data and IDs have not been changed. No production deployment, live Sheet writes, public preview, credentials or paid AI calls.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3405. Scan asset starts a live browser camera with capture, retake, cancel and upload/native-picker fallback; a checked existing serial opens its asset. In fictional demo mode, try “Find existing sample” for DEMO-C02X148 or “Register new sample” for a fictional new registration. Manual entry works while OCR is disconnected. Unknowns remain marked for review. Real imported inventory is read only. In demo mode, saves, edits and movements persist to .local/inventory.json, with duplicate guards, version checks and idempotent retries.

```sh
npm run check
HC_ASSETS_TEST_URL=http://127.0.0.1:3406 npm run test:e2e
```

Browser checks require a separate fictional server: `HC_ASSETS_BACKEND=demo HC_ASSETS_DEMO_SUBDIRECTORY=browser-validation npx next start --hostname 127.0.0.1 -p 3406`. They expect that server already running and Google Chrome at its macOS application path. Update playwright.config.ts for another browser installation. Core tests use temporary fictional stores. Browser tests use mocked fixtures plus a small real local API fixture; they never use the live Sheet.

[Theme and motion](docs/THEME.md) · [Architecture and integration needs](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) · [Screenshots](docs/screenshots)

Photo recognition and live resale research currently return an explicit unavailable state. Real server OCR, cited AED resale, Google read/auth, and a controlled Sheet writer have route/UI wiring and mocked end-to-end tests. Secure runtime configuration and isolated staging acceptance are pending. The imported snapshot is not continuous Google access. See [integration status and remaining work](docs/INTEGRATIONS.md). See the [user-controlled local credential handoff](docs/LOCAL-SECURE-HANDOFF.md). BC-style direct Sheet writes now avoid a mandatory new Apps Script gateway; OCR is independent of Sheet writes and resale configuration. The reference image’s prices/counts are fictional and are not app data.

Publica Sans falls back to system sans until an approved licensed local font is available. The logo is the actual SVG from hellochef.me. Mobile behavior is tested in desktop Chrome viewport emulation; physical iOS/Android camera, keyboards and Safari are separate acceptance work.
