# Changelog

All notable changes to **Salva Site** are documented in this file.

## [0.3.1] — 2026-11-24

### Fixed
- Fixed extension popup collapsing to a ~24px scrollbar strip in Chromium/Brave by locking `body` to `390px` and removing `max-width: 100vw` and `@media (max-width: 390px)` rules that broke Chromium's popup auto-sizing pass.
- Added a build-time validation guard in `scripts/validate.mjs` to prevent viewport-width regressions in `popup.css`.
- Made `.github/workflows/ci.yml` resolve the packaged `.zip` version dynamically from `package.json`.

## [0.3.0] — 2026-11-24

### Added
- Full internationalization (`_locales/en`, `_locales/pt_BR`, `_locales/pt`) with English as `default_locale`.
- Generic cross-origin `<embed>` and `<iframe>` detection using `optional_host_permissions` and a 1-click **Allow capture** prompt per origin in the popup.
- Live capture cancellation via an in-page **Cancel** button or `Escape` key, cleanly restoring scroll offsets and focus.
- Determinate progress bar inside the Shadow DOM capture overlay.
- Adaptive Light & Dark theme (`prefers-color-scheme`) built with `--ux-*` tokens and adapted MIT-licensed Lucian UX/UI Prompt components (`#004`, `#031`, `#044`, `#072`, `#433`, `#439`).
- Pure-Node Chrome Web Store `.zip` packager (`npm run package`) and automated CWS asset generator (`scripts/generate-store-assets.mjs`).
- Open-source documentation (`README.md`, `README.pt-BR.md`, `PRIVACY.md`, `LICENSE`, `CONTRIBUTING.md`), GitHub Actions CI, and Chrome Web Store listing kit (`store/CHROME_WEB_STORE_LISTING.md`).

### Fixed
- Cleared stuck page highlights when closing the popup mid-hover or moving focus away.
- Preserved unsaved popup option toggles when authorizing an external embedded frame origin.
- Prevented blank/`srcdoc` iframes from inheriting `location.href` origin.
- Guarded opaque `"null"` origin equality on `file://` pages and clamped `imageQuality` (`50..100`).
- Centered the 3 bars inside the extension icon geometry.

## [0.2.0] — 2026-07-10

### Added
- Cross-origin embedded form capture support.
- Optional offline OCR (`por` + `eng`) using bundled `tesseract.js` in an MV3 `offscreen` document.
- Local searchable text layer combining DOM text and filled form fields (with password masking).

## [0.1.0] — 2026-07-10

### Added
- Initial Manifest V3 extension capturing outer page scroll and inner scrollable panels into a local multi-page PDF.
