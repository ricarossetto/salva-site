import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";

const outputPath = path.resolve("tmp", "pdfs", "font-test.pdf");
const fontPath = path.resolve("dist", "vendor", "fonts", "noto-sans-latin.woff");
const pdf = await PDFDocument.create();
pdf.registerFontkit(fontkit);
const font = await pdf.embedFont(await readFile(fontPath), { subset: true });
const page = pdf.addPage([640, 240]);
page.drawText("Formulário, observações, revisão, São Paulo, coerência", {
  x: 36,
  y: 150,
  size: 20,
  font
});
page.drawText("Maria Clara de Souza", {
  x: 36,
  y: 105,
  size: 16,
  font,
  opacity: 0
});
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, await pdf.save());
console.log(outputPath);
