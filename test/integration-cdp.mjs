import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.argv[2] || 9336);
const enableOcr = process.argv.includes("--ocr");
const savePdf = process.argv.includes("--save-pdf");
const embedMode = process.argv.includes("--embed");
const baseUrl = `http://127.0.0.1:${port}`;
const fixtureUrl = embedMode
  ? "http://127.0.0.1:8765/fixture-embed.html"
  : "http://127.0.0.1:8765/fixture.html";

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) {
        this.eventListeners.forEach((listener) => listener(message));
        return;
      }
      if (!this.pending.has(message.id)) return;
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    });
  }

  onEvent(listener) {
    this.eventListeners.push(listener);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function targets() {
  const response = await fetch(`${baseUrl}/json`);
  if (!response.ok) throw new Error(`CDP indisponível: ${response.status}`);
  return response.json();
}

async function waitForTarget(predicate, timeoutMs = 90000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const target = (await targets()).find(predicate);
    if (target) return target;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("O alvo esperado não apareceu dentro do prazo.");
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

const workerTarget = await waitForTarget((target) => target.type === "service_worker" && target.url.endsWith("/service-worker.js"));
const priorResultIds = new Set(
  (await targets())
    .filter((target) => target.type === "page" && target.url.includes("/result.html?id="))
    .map((target) => target.id)
);
const worker = new CdpClient(workerTarget.webSocketDebuggerUrl);
await worker.connect();
await worker.send("Runtime.enable");
worker.onEvent((message) => {
  if (message.method === "Runtime.consoleAPICalled") {
    const values = message.params.args.map((arg) => arg.value || arg.description || "");
    process.stderr.write(`[service-worker] ${values.join(" ")}\n`);
  }
  if (message.method === "Runtime.exceptionThrown") {
    process.stderr.write(`[service-worker] ${message.params.exceptionDetails.text}\n`);
  }
});

const launchResult = await evaluate(worker, `(async () => {
  let stage = "find-tab";
  try {
  const [tab] = await chrome.tabs.query({ url: ${JSON.stringify(fixtureUrl)} });
  if (!tab) throw new Error("A página de teste não foi encontrada.");
  stage = "activate";
  await chrome.tabs.update(tab.id, { active: true });
  stage = "inject";
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id });
  for (const frame of frames) {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [frame.frameId] },
      files: ["content.js"]
    });
  }
  await new Promise((resolve) => setTimeout(resolve, 150));
  stage = "analyze";
  const analysis = await chrome.tabs.sendMessage(
    tab.id,
    { type: "SALVA_SITE_ANALYZE" },
    { frameId: 0 }
  );
  const frameTargets = [];
  const frameDiagnostics = [];
  if (${embedMode}) {
    const childFrames = frames.filter((frame) => frame.frameId !== 0);
    for (const frame of childFrames) {
      const childAnalysis = await chrome.tabs.sendMessage(
        tab.id,
        { type: "SALVA_SITE_ANALYZE" },
        { frameId: frame.frameId }
      );
      frameDiagnostics.push({
        frameId: frame.frameId,
        origin: new URL(frame.url).origin,
        page: childAnalysis.page
      });
      if (childAnalysis.page.scrollHeight <= childAnalysis.page.clientHeight + 2) continue;
      const embed = analysis.embeds.find((item) =>
        Math.abs(item.clientWidth - childAnalysis.page.clientWidth) <= 4 &&
        Math.abs(item.clientHeight - childAnalysis.page.clientHeight) <= 4
      );
      if (!embed) continue;
      frameTargets.push({
        frameId: frame.frameId,
        embedId: embed.id,
        embedIndex: embed.index,
        label: "Formulário interno de teste"
      });
    }
  }
  stage = "capture";
  await captureTab(tab.id, {
    includePage: true,
    candidateIds: analysis.candidates.map((candidate) => candidate.id),
    frameTargets,
    searchableText: true,
    fullOcr: ${enableOcr},
    imageQuality: 84
  });
  return {
    start: { started: true },
    candidates: analysis.candidates,
    embeds: analysis.embeds,
    frameTargets,
    frameDiagnostics
  };
  } catch (error) {
    return { stage, error: error?.stack || error?.message || String(error) };
  }
})()`);

if (launchResult.error) throw new Error(`${launchResult.stage}: ${launchResult.error}`);
if (!launchResult.start?.started) throw new Error(launchResult.start?.error || "A captura não iniciou.");

const resultTarget = await waitForTarget((target) =>
  target.type === "page"
  && target.url.includes("/result.html?id=")
  && !priorResultIds.has(target.id)
);
const resultPage = new CdpClient(resultTarget.webSocketDebuggerUrl);
await resultPage.connect();
await resultPage.send("Runtime.enable");

const result = await evaluate(resultPage, `(async () => {
  const id = new URLSearchParams(location.search).get("id");
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (globalThis.SalvaSiteDB) {
      const record = await SalvaSiteDB.get(id);
      if (record?.blob) {
        let base64 = null;
        if (${savePdf}) {
          const bytes = new Uint8Array(await record.blob.arrayBuffer());
          let binary = "";
          for (let index = 0; index < bytes.length; index += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + 0x8000, bytes.length)));
          }
          base64 = btoa(binary);
        }
        return {
        filename: record.filename,
        pageCount: record.pageCount,
        size: record.blob.size,
        warnings: record.warnings,
        title: document.title,
        base64
        };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("O PDF não apareceu no armazenamento temporário.");
})()`);

worker.close();
resultPage.close();

if (result.base64) {
  const outputDirectory = path.resolve("tmp", "pdfs");
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, "integration-output.pdf");
  await writeFile(outputPath, Buffer.from(result.base64, "base64"));
  delete result.base64;
  result.savedTo = outputPath;
}

console.log(JSON.stringify({
  detectedAreas: launchResult.candidates,
  detectedEmbeds: launchResult.embeds,
  detectedFrames: launchResult.frameTargets,
  frameDiagnostics: launchResult.frameDiagnostics,
  pdf: result
}, null, 2));
