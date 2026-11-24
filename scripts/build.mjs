import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const srcDir = path.join(rootDir, "src");
const distDir = path.join(rootDir, "dist");
const nodeModulesDir = path.join(rootDir, "node_modules");

function assertSafeDistPath(target) {
  const resolved = path.resolve(target);
  if (path.dirname(resolved) !== rootDir || path.basename(resolved) !== "dist") {
    throw new Error(`Caminho de saída inseguro: ${resolved}`);
  }
}

async function copyFile(source, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination);
}

async function findFirstFile(directory, predicate) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findFirstFile(fullPath, predicate);
      if (nested) return nested;
    } else if (predicate(entry.name, fullPath)) {
      return fullPath;
    }
  }
  return null;
}

function roundedRectangleContains(x, y, left, top, right, bottom, radius) {
  const centerX = Math.min(Math.max(x, left + radius), right - radius);
  const centerY = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

function generateIcon(size) {
  const supersampling = 4;
  const highSize = size * supersampling;
  const high = new Uint8Array(highSize * highSize * 4);
  const backgroundMargin = highSize * 0.045;
  const radius = highSize * 0.23;
  const lines = [
    { y: 0.30, width: 0.54 },
    { y: 0.46, width: 0.42 },
    { y: 0.62, width: 0.30 }
  ];

  for (let y = 0; y < highSize; y += 1) {
    for (let x = 0; x < highSize; x += 1) {
      const index = (y * highSize + x) * 4;
      if (!roundedRectangleContains(
        x + 0.5,
        y + 0.5,
        backgroundMargin,
        backgroundMargin,
        highSize - backgroundMargin,
        highSize - backgroundMargin,
        radius
      )) continue;

      const gradient = y / highSize;
      high[index] = Math.round(24 + 10 * gradient);
      high[index + 1] = Math.round(68 + 20 * gradient);
      high[index + 2] = Math.round(189 + 35 * gradient);
      high[index + 3] = 255;

      for (const line of lines) {
        const lineLeft = highSize * 0.23;
        const lineTop = highSize * line.y;
        const lineHeight = highSize * 0.08;
        if (roundedRectangleContains(
          x + 0.5,
          y + 0.5,
          lineLeft,
          lineTop,
          lineLeft + highSize * line.width,
          lineTop + lineHeight,
          lineHeight / 2
        )) {
          high[index] = 255;
          high[index + 1] = 255;
          high[index + 2] = 255;
        }
      }
    }
  }

  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const totals = [0, 0, 0, 0];
      for (let sampleY = 0; sampleY < supersampling; sampleY += 1) {
        for (let sampleX = 0; sampleX < supersampling; sampleX += 1) {
          const sourceIndex = (((y * supersampling + sampleY) * highSize) + (x * supersampling + sampleX)) * 4;
          for (let channel = 0; channel < 4; channel += 1) totals[channel] += high[sourceIndex + channel];
        }
      }
      const targetIndex = (y * size + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        png.data[targetIndex + channel] = Math.round(totals[channel] / (supersampling * supersampling));
      }
    }
  }
  return PNG.sync.write(png);
}

assertSafeDistPath(distDir);
await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });
await cp(srcDir, distDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const iconPath = path.join(distDir, "icons", `icon-${size}.png`);
  await mkdir(path.dirname(iconPath), { recursive: true });
  await writeFile(iconPath, generateIcon(size));
}

await copyFile(
  path.join(nodeModulesDir, "pdf-lib", "dist", "pdf-lib.min.js"),
  path.join(distDir, "vendor", "pdf-lib.min.js")
);
await copyFile(
  path.join(nodeModulesDir, "@pdf-lib", "fontkit", "dist", "fontkit.umd.min.js"),
  path.join(distDir, "vendor", "fontkit.umd.min.js")
);
await copyFile(
  path.join(nodeModulesDir, "@fontsource", "noto-sans", "files", "noto-sans-latin-400-normal.woff"),
  path.join(distDir, "vendor", "fonts", "noto-sans-latin.woff")
);

await copyFile(
  path.join(nodeModulesDir, "tesseract.js", "dist", "tesseract.min.js"),
  path.join(distDir, "vendor", "tesseract", "tesseract.min.js")
);
await copyFile(
  path.join(nodeModulesDir, "tesseract.js", "dist", "worker.min.js"),
  path.join(distDir, "vendor", "tesseract", "worker.min.js")
);

const coreDirectory = path.join(nodeModulesDir, "tesseract.js-core");
for (const fileName of ["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js"]) {
  await copyFile(
    path.join(coreDirectory, fileName),
    path.join(distDir, "vendor", "tesseract", "core", fileName)
  );
}

for (const language of ["eng", "por"]) {
  const packageDirectory = path.join(nodeModulesDir, "@tesseract.js-data", language);
  const trainedData = await findFirstFile(
    packageDirectory,
    (name) => name === `${language}.traineddata.gz`
  );
  if (!trainedData) {
    throw new Error(`Arquivo de idioma do OCR não encontrado: ${language}`);
  }
  await copyFile(
    trainedData,
    path.join(distDir, "vendor", "tesseract", "lang", `${language}.traineddata.gz`)
  );
}

console.log(`Extensão montada em ${distDir}`);
