# Mobile Pack (iPhone‑ready + PWA)

This pack adds iPhone/touch support and an installable PWA wrapper without changing your app logic.

## Files
- `index.mobile.html` — your index with safe mobile/PWA inserts
- `styles.mobile.css` — your styles with safe mobile additions appended
- `js/mobile.js` — pointer/touch + pinch-zoom support (desktop-safe)
- `manifest.json` — PWA manifest
- `sw.js` — service worker for offline and installability
- `icons/icon-192.png`, `icons/icon-512.png` — app icons

## How to apply (safe, reversible)
1) Back up your originals.
2) Replace **index.html** with **index.mobile.html** (or manually copy the small inserts).
3) Replace **styles.css** with **styles.mobile.css** (or append the mobile section).
4) Copy **js/mobile.js**, **manifest.json**, **sw.js**, and the **icons/** folder next to your existing files.
5) Serve the site over HTTPS (required for service workers).
6) On iPhone Safari: open the URL → Share → Add to Home Screen.

If anything looks off, restore your original index/styles files — script logic remains unchanged.