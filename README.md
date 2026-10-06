# HelloChef HCAssets — private local rewrite

Mobile-first Next.js app with live server access to the existing Sheet (51 assets, 7 history events, 67 employee rows). It uses fictional fixtures when no import is present or demo mode is explicitly selected. Existing data and IDs have not been changed. Storage choices are Engineering Area and Locker; location may be empty only while assigned to someone. Unassigned creates, returns, repairs and retirement require a storage location. Legacy records remain visible until explicitly confirmed. The private server reuses the existing BC credentials at runtime without file copies or browser exposure. Anthony approved OCR, live edits/inserts and Editor access for the existing BC Google identity on 6 October 2026. There is no production deployment or public preview; original asset rows/history/employee data have not been mutated during setup.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:3405. Scan asset starts a live browser camera with capture, retake, cancel and upload/native-picker fallback; a checked existing serial opens its asset. In fictional demo mode, try “Find existing sample” for DEMO-C02X148 or “Register new sample” for a fictional new registration. Manual entry works while OCR is disconnected. Unknowns remain marked for review. The authorized timestamped import is read only in snapshot mode; the approved live mode enables Sheet saves. In demo mode, saves, edits and movements persist to .local/inventory.json, with duplicate guards, version checks and idempotent retries.

```sh
npm run check
HC_ASSETS_TEST_URL=http://127.0.0.1:3406 npm run test:e2e
```

Browser checks require a separate fictional server: `HC_ASSETS_BACKEND=demo HC_ASSETS_DEMO_SUBDIRECTORY=browser-validation npx next start --hostname 127.0.0.1 -p 3406`. They expect that server already running and Google Chrome at its macOS application path. Update playwright.config.ts for another browser installation. Core tests use temporary fictional stores. Browser tests use mocked fixtures plus a small real local API fixture; they never use the live Sheet.

[Theme and motion](docs/THEME.md) · [Architecture and integration needs](docs/ARCHITECTURE.md) · [Validation](docs/VALIDATION.md) · [Screenshots](docs/screenshots)

Photo recognition is connected and verified; live resale research is enabled. Real server OCR, cited AED resale, Google read/auth, and a controlled Sheet writer have route/UI wiring and mocked end-to-end tests. Secure local runtime reuse is configured; isolated staging acceptance is pending. Restart the live private preview on 127.0.0.1:3405 with `npm run start:connected-local`. Photo OCR is enabled using BC’s configured `OPENAI_MODEL` or its current default `gpt-5.6-terra`; a real fictional-label request extracted the printed fields successfully. Live saves are enabled through the confirmed direct Sheet writer. The approved existing BC identity has Editor access; three hidden metadata tabs were added with exact original row hashes unchanged (51/7/67). No production test rows were inserted. Resale is enabled using the same BC model. Current UAE refurbished product prices are verified from public pages; blocked or unsupported sources return no comparable. The imported snapshot is not continuous Google access. See [integration status and remaining work](docs/INTEGRATIONS.md). See the [user-controlled local credential handoff](docs/LOCAL-SECURE-HANDOFF.md). BC-style direct Sheet writes now avoid a mandatory new Apps Script gateway; OCR is independent of Sheet writes and resale configuration. The reference image’s prices/counts are fictional and are not app data.

Publica Sans falls back to system sans until an approved licensed local font is available. The logo is the actual SVG from hellochef.me. Mobile behavior is tested in desktop Chrome viewport emulation; physical iOS/Android camera, keyboards and Safari are separate acceptance work.

Asset detail now has a bottom Notes editor using the existing Sheet field and a notes-only controlled save. No schema change is needed. See [Vercel release preparation](docs/VERCEL-RELEASE-PREPARATION.md) for the environment manifest and remaining hosted access/writer work.

Independent HCAssets logo/wordmark/icons and sharing artwork are in [public/brand](public/brand); [brand guide](docs/branding/README.md) and [brand sheet](docs/branding/hcassets-brand-sheet.png). The app does not use the Hello Chef company logo.
