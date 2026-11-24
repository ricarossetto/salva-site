import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const distDir = path.join(rootDir, "dist");

const requiredFiles = [
  "manifest.json",
  "lucian-tokens.css",
  "i18n.js",
  "service-worker.js",
  "content.js",
  "db.js",
  "popup.html",
  "popup.js",
  "popup.css",
  "offscreen.html",
  "offscreen.js",
  "result.html",
  "result.js",
  "result.css",
  "_locales/en/messages.json",
  "_locales/pt_BR/messages.json",
  "_locales/pt/messages.json",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "vendor/pdf-lib.min.js",
  "vendor/fontkit.umd.min.js",
  "vendor/fonts/noto-sans-latin.woff",
  "vendor/tesseract/tesseract.min.js",
  "vendor/tesseract/worker.min.js",
  "vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "vendor/tesseract/lang/por.traineddata.gz",
  "vendor/tesseract/lang/eng.traineddata.gz"
];

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(distDir, relativePath);
  const file = await stat(absolutePath).catch(() => null);
  if (!file?.isFile() || file.size === 0) {
    throw new Error(`Required file missing or empty: ${relativePath}`);
  }
}

const manifestRaw = await readFile(path.join(distDir, "manifest.json"), "utf8");
const manifest = JSON.parse(manifestRaw);

if (manifest.manifest_version !== 3) {
  throw new Error("manifest.json must use Manifest V3.");
}
if (manifest.default_locale !== "en") {
  throw new Error(`manifest.json default_locale must be "en", got "${manifest.default_locale}".`);
}
if (manifest.host_permissions?.length) {
  throw new Error("manifest.json must not declare permanent host_permissions.");
}
if (!manifest.optional_host_permissions?.includes("https://*/*")) {
  throw new Error("manifest.json must declare optional_host_permissions including https://*/*.");
}

const popupCss = await readFile(path.join(distDir, "popup.css"), "utf8");
if (/\b100vw\b/i.test(popupCss)) {
  throw new Error("dist/popup.css must not use 100vw (breaks Chromium extension popup auto-sizing).");
}
if (/@media\s*\(\s*max-width\s*:/i.test(popupCss)) {
  throw new Error("dist/popup.css must not use @media (max-width: ...) rules (breaks Chromium extension popup auto-sizing).");
}
if (!/body\s*\{[^}]*min-width\s*:\s*390px/s.test(popupCss)) {
  throw new Error("dist/popup.css body rule must lock min-width: 390px for Chromium extension popup auto-sizing.");
}

const locales = ["en", "pt_BR", "pt"];
const localeMessages = new Map();
for (const locale of locales) {
  const filePath = path.join(distDir, "_locales", locale, "messages.json");
  const parsed = JSON.parse(await readFile(filePath, "utf8"));
  localeMessages.set(locale, parsed);

  const desc = parsed.extDescription?.message || "";
  if (!desc || desc.length > 132) {
    throw new Error(`extDescription in locale "${locale}" must be 1..132 chars (got ${desc.length}).`);
  }
}

const baseKeys = Object.keys(localeMessages.get("en")).sort();
for (const locale of locales) {
  const keys = Object.keys(localeMessages.get(locale)).sort();
  const missing = baseKeys.filter((key) => !keys.includes(key));
  const extra = keys.filter((key) => !baseKeys.includes(key));
  if (missing.length || extra.length) {
    throw new Error(
      `Locale "${locale}" key mismatch. Missing: [${missing.join(", ")}], Extra: [${extra.join(", ")}]`
    );
  }
}

const msgTokens = [...manifestRaw.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((match) => match[1]);
for (const token of msgTokens) {
  for (const locale of locales) {
    if (!localeMessages.get(locale)?.[token]?.message) {
      throw new Error(`Manifest token __MSG_${token}__ missing in locale "${locale}".`);
    }
  }
}

const jsFiles = (await readdir(distDir))
  .filter((name) => name.endsWith(".js"))
  .map((name) => path.join(distDir, name));

for (const file of jsFiles) {
  const source = await readFile(file, "utf8");
  const remoteCodePatterns = [
    /importScripts\s*\(\s*["']https?:\/\//,
    /import\s*\(\s*["']https?:\/\//,
    /(?:workerPath|corePath|langPath)\s*:\s*["']https?:\/\//,
    /<script[^>]+src=["']https?:\/\//i
  ];
  if (remoteCodePatterns.some((pattern) => pattern.test(source))) {
    throw new Error(`Remote code reference found in ${path.basename(file)}.`);
  }
}

async function listFilesRecursively(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listFilesRecursively(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

const forbiddenPatterns = [
  /[A-Za-z]:[\\/]Users[\\/]/
];

const scanDirs = ["src", "dist", "scripts", "test"];
const selfPath = path.resolve(fileURLToPath(import.meta.url));
const vendorDir = path.resolve(distDir, "vendor");
for (const dirName of scanDirs) {
  const dirPath = path.join(rootDir, dirName);
  const files = await listFilesRecursively(dirPath);
  for (const file of files) {
    const resolved = path.resolve(file);
    if (resolved === selfPath || resolved.startsWith(vendorDir + path.sep)) continue;
    if (/\.(png|woff2?|gz)$/i.test(resolved)) continue;
    const text = await readFile(resolved, "utf8");
    for (const pattern of forbiddenPatterns) {
      if (pattern.test(text)) {
        throw new Error(`Forbidden local path pattern (${pattern}) found in ${path.relative(rootDir, resolved)}`);
      }
    }
  }
}

console.log(`Validation passed: ${requiredFiles.length} essential files, ${locales.length} locales (${baseKeys.length} keys), 0 hygiene issues.`);
