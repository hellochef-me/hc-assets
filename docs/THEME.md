# HelloChef HCAssets foundations — approved revision

The initial teal direction is rejected and superseded. Revised Library references (version 1) were materialized, byte-verified and inspected on 6 October 2026: hcassets-01-inventory-v2.png, hcassets-02-mobile-scan-v2.png, hcassets-03-asset-detail-v2.png. Reference inventory counts, identities and resale numbers are fictional.

The warm cream/coral application palette remains. Anthony superseded the initial company-logo direction on 6 October 2026: HCAssets now has an independent asset-tag mark and wordmark. The header and favicon use only that identity. See [brand assets and usage](branding/README.md). Typography uses system sans without licensed fonts or external requests.

Tokens: primary #E42A12; cream canvas #FDF4EC; peach surface #FEF0E9; peach accent #F7C1A6; charcoal #2F2B2C; border #E4E2E3; white cards. Amber signals review; green only signals confirmed availability. 10px radius, 8px spacing unit, 44px minimum interactive targets, 16px inputs to avoid iOS zoom, 3px focus outline. Lucide icons use consistent 1.7px strokes and accessible names where needed.

Horizontal navigation, inventory table/card view and contextual preview. Phone registration is primary: live browser camera with native-camera/file fallback, progressive capture → review → confirm, sticky bottom actions, optional fields progressively disclosed, Unknown remains valid. Photos cannot establish specs, function or battery health. Maintained Radix dropdown keyboard/typeahead/focus behavior with native form validation, light native date inputs and dialog focus management. The UI explicitly labels fictional, imported read-only and isolated staging sources and provider availability.

Motion: contextual preview 240ms opacity and 12px entry; filters 160ms stable-height opacity; capture-to-review 280ms; reviewed fields 180ms; assignment confirmation 220ms. Easing cubic-bezier(.16,1,.3,1). Save pending stays pending until server confirms; no fabricated progress or scan loops. Reduced motion removes translation/stagger and limits opacity to 80ms.

Shared primitives live in components/ui.tsx and app/globals.css: Button, Badge, Field, Notice, Empty, Device, Timeline. Native dialog handles focus containment, Escape and focus restoration. Every status includes text. Layout must work at 320–430px, tablet and desktop; browser emulation is not physical device certification.
