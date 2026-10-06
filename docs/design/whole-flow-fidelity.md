# Complete workflow reference pass

The entry-only refresh left the rest of the workflow visually inconsistent. Apply the same white canvas, 460px content width, 30px heading scale, quiet segmented progress and coral primary action across every scan state. Keep the real camera as a full-screen dark overlay.

Screen mapping and changes:

- Reading / inventory lookup / failed read → `scan-reading-states.png`: one heading, captured label or serial card, honest indeterminate progress, one cancel path. Avoid surrounding registration badges and repeated instructions.
- Exact / possible serial match → `existing-serial-prompts.png`: compact heading and status, image-led asset card, primary open-existing action, secondary rescan, explicit distinct-device branch only for near matches.
- Device details → `scan-device-photo-flow.png` panel 2: serial and device identity first, checked-serial control, owner and storage immediately visible. Put additional properties into quiet disclosures. Keep label evidence available in a collapsed section rather than stacking warnings and photo controls above the form.
- Device thumbnail → panel 3 and `device-camera-fullscreen.png`: one title, large actual image or honest empty portrait, one capture action, small replacement/removal actions after a photo, one continue action. Back stays quiet. Show thumbnail preview when a photo exists.
- Confirm → panel 4: photo, asset identity, serial, owner and location. Additional properties and verification detail remain expandable. One Save asset action and one Back action.
- Existing record edit / reassignment / review → `update-assets-flow.png`: keep compact identity summary, move label rescan next to the serial, expose condition near the device photo, retain separate reassignment and before/after confirmation.

Use the existing sans-serif, white #FFFFFF, ink #292524, muted #686568, coral #CF351F, pale coral #FFF0EB and teal #17634F. Fine #E4E2E3 borders, 10–16px corners, 16px controls and 24px mobile margins. Preserve the current brand lockup, actual photos, data IDs and all write safeguards. No generated imagery substituted for real inventory photos.

Capture a screenshot of every listed state after implementation; verify mobile and desktop plus back/retake/retry/save journeys against the full set of references before release. Test with fictional fixtures and mocked AI only.

## Photo framing correction

The old camera guide outlined most of the viewfinder including letterboxing, while the capture retained the sensor frame. The guide now tracks the actual video aspect ratio. Every device thumbnail uses contain sizing, matching the whole-photo preview. The detail hero is constrained so portrait photos cannot dominate the desktop page. Existing files are preserved; these are display and capture-guide changes.

## Verification

All 65 core tests and 59 browser scenarios passed. Actual screenshots of the complete workflow are indexed in `workflow-review.html`; mobile/desktop screenshots of details, editing and reassignment are also saved. Tests assert guide aspect ratio equals camera sensor ratio and thumbnail images use contain sizing. OCR/providers and writes were mocked or isolated to fictional local data; physical phone camera testing remains a user-device check.
