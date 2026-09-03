# Offline Mode — Install Prompt Browser Compatibility

Reference for `#162` / `#169` (Offline Mode / PWA Support). The install
button on `/offline` relies on the browser's `beforeinstallprompt` event,
which is **not** implemented uniformly across browsers. This table
summarizes what to expect on each.

| Browser | `beforeinstallprompt` support | Install behavior |
|---|---|---|
| Chrome (desktop & Android) | Yes | Fires normally; install button becomes active and triggers the native install dialog. |
| Edge (desktop) | Yes (Chromium-based) | Same as Chrome. |
| Samsung Internet | Yes | Same as Chrome; also offers its own "Add page to" menu independently. |
| Firefox (desktop & Android) | No | Event never fires. Users can still manually install via the browser's menu on Android ("Install app" / "Add to Home screen"); desktop Firefox has no PWA install UI. |
| Safari (macOS) | No | Event never fires. No native install prompt; site can only be added via bookmarking. |
| Safari (iOS/iPadOS) | No | Event never fires. Users must use Share → "Add to Home Screen" manually — there is no way to trigger this programmatically. |

## Practical implications for `OfflinePage.tsx`

- The **Install** button should stay disabled until `beforeinstallprompt`
  actually fires — it already does this correctly, since there's no
  fallback path when the event is unsupported.
- On Firefox and Safari, users currently see a permanently-disabled
  Install button with no explanation. A follow-up could detect
  unsupported browsers (via feature-detecting the event, or user-agent
  sniffing as a last resort) and swap in manual instructions instead of
  a dead button — noted as a possible next step, not implemented here.
- Offline **caching and reading** (the core feature) works identically
  across all browsers above once the service worker registers — this
  compatibility gap is specific to the install prompt only, not to
  offline reading itself.

## How this was checked

Verified manually against each vendor's own current PWA/install
documentation (MDN's `beforeinstallprompt` compatibility data, and each
browser's own developer docs) rather than by testing on physical devices
for every entry — flagging that as a limitation of this pass, not a
verified device-by-device QA sweep.
