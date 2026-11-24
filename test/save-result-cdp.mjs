import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.argv[2]);
const outputPath = path.resolve(process.argv[3] || "tmp/pdfs/integration-output.pdf");
const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const target = targets.find((item) => item.type === "page" && item.url.includes("/result.html?id="));
if (!target) throw new Error("Página de resultado não encontrada.");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

const result = await new Promise((resolve, reject) => {
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    if (message.result?.exceptionDetails) reject(new Error(message.result.exceptionDetails.text));
    else resolve(message.result.result.value);
  });
  socket.send(JSON.stringify({
    id: 1,
    method: "Runtime.evaluate",
    params: {
      expression: `(async () => {
        const id = new URLSearchParams(location.search).get("id");
        const record = await SalvaSiteDB.get(id);
        const bytes = new Uint8Array(await record.blob.arrayBuffer());
        let binary = "";
        for (let index = 0; index < bytes.length; index += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
        }
        return { base64: btoa(binary), pageCount: record.pageCount, size: record.blob.size };
      })()`,
      awaitPromise: true,
      returnByValue: true
    }
  }));
  setTimeout(() => reject(new Error("Tempo esgotado")), 30000);
});

socket.close();
await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, Buffer.from(result.base64, "base64"));
console.log(JSON.stringify({ outputPath, pageCount: result.pageCount, size: result.size }, null, 2));
