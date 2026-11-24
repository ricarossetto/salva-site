let ocrWorker = null;
let workerPromise = null;

async function getWorker() {
  if (ocrWorker) return ocrWorker;
  if (workerPromise) return workerPromise;

  workerPromise = Tesseract.createWorker(["por", "eng"], Tesseract.OEM.LSTM_ONLY, {
    workerPath: chrome.runtime.getURL("vendor/tesseract/worker.min.js"),
    corePath: chrome.runtime.getURL("vendor/tesseract/core"),
    langPath: chrome.runtime.getURL("vendor/tesseract/lang"),
    workerBlobURL: false,
    cacheMethod: "write",
    gzip: true
  });
  try {
    ocrWorker = await workerPromise;
    await ocrWorker.setParameters({ preserve_interword_spaces: "1" });
    return ocrWorker;
  } finally {
    workerPromise = null;
  }
}

function parseTsv(tsv) {
  if (!tsv) return [];
  const lines = tsv.split(/\r?\n/);
  const words = [];
  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split("\t");
    if (columns.length < 12 || columns[0] !== "5") continue;
    const text = columns.slice(11).join("\t").trim();
    const confidence = Number(columns[10]);
    if (!text || confidence < 25) continue;
    words.push({
      text,
      left: Number(columns[6]) || 0,
      top: Number(columns[7]) || 0,
      width: Number(columns[8]) || 0,
      height: Number(columns[9]) || 0,
      confidence
    });
  }
  return words;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "salva-site-offscreen") return undefined;

  if (message.type === "SALVA_SITE_RUN_OCR") {
    (async () => {
      const worker = await getWorker();
      const result = await worker.recognize(message.imageDataUrl, {}, { tsv: true });
      return { words: parseTsv(result.data.tsv) };
    })().then(
      (response) => sendResponse(response),
      (error) => sendResponse({ error: error?.message || String(error) })
    );
    return true;
  }

  if (message.type === "SALVA_SITE_STOP_OCR") {
    (async () => {
      if (ocrWorker) await ocrWorker.terminate();
      ocrWorker = null;
      workerPromise = null;
      return { stopped: true };
    })().then(sendResponse, (error) => sendResponse({ error: error?.message || String(error) }));
    return true;
  }

  return undefined;
});
