# Contributing to Salva Site

Contributions, bug reports, and translations are welcome!

## Prerequisites

- **Node.js 20+**
- A Chromium-based browser (Chrome, Brave, or Edge) for manual or CDP integration testing.

## Local Setup

```bash
git clone https://github.com/ricarossetto/salva-site.git
cd salva-site
npm ci
npm run test
```

## Available Scripts

- `npm run build` — Copies `src/` into `dist/`, regenerates PNG icons, and copies bundled vendor scripts (`pdf-lib`, `fontkit`, `tesseract.js`, `Noto Sans`).
- `npm run validate` — Checks Manifest V3 structure, required files, locale key parity (`en`, `pt_BR`, `pt`), 132-character store description limit, absence of remote code, and absence of test PII.
- `npm run package` — Runs `build` + `validate` and writes `release/salva-site-v<version>.zip` with `manifest.json` at the ZIP root.

## Guidelines

1. Keep **100% local processing** — never add external API calls, remote scripts, or telemetry.
2. When adding UI copy, add the key to **all** files under `src/_locales/*/messages.json` so `npm run validate` passes.
3. Never include real personal data in `test/` fixtures or screenshots.
4. Ensure `npm run test` passes before opening a pull request.
