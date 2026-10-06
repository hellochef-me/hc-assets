# HelloChef HCAssets — private local rewrite

Mobile-first Next.js preview using fictional fixtures. Existing inventory/employee data and IDs have not been changed. No production deployment, live Sheet writes, public preview, credentials or paid AI calls.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3405. Scan asset starts phone camera/file capture; a checked existing serial opens its asset. Try “Find existing sample” for DEMO-C02X148 or “Register new sample” for a fictional new registration. Manual entry works while OCR is disconnected. Unknowns remain marked for review. Saves, edits and movements persist to .local/inventory.json, with duplicate guards, version checks and idempotent retries.

```sh
npm run check
npm run test:e2e
```

Browser checks expect the local server already running and Google Chrome at its macOS application path. Update playwright.config.ts for another browser installation. Core tests use temporary fictional stores. Browser tests use mocked fixtures plus a small real local API fixture; they never use the live Sheet.

[Theme and motion](docs/THEME.md) · [Architecture and integration needs](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) · [Screenshots](docs/screenshots)

Photo recognition and live resale research currently return an explicit unavailable state. The read-only Sheet adapter and intelligence/environment interfaces are not connected. The app does not claim real OCR or internet comparables were tested. The reference image’s prices/counts are fictional and are not app data.

Publica Sans falls back to system sans until an approved licensed local font is available. The logo is the actual SVG from hellochef.me. Mobile behavior is tested in desktop Chrome viewport emulation; physical iOS/Android camera, keyboards and Safari are separate acceptance work.
