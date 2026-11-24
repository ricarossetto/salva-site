importScripts("i18n.js", "db.js", "vendor/fontkit.umd.min.js", "vendor/pdf-lib.min.js");

const PAGE_TARGET_ID = "__salva_site_page__";
const OCR_DOCUMENT_PATH = "offscreen.html";
const { PDFDocument, rgb } = PDFLib;
const { t } = globalThis.SalvaSiteI18n;

let activeCapture = null;
let captureCancelled = false;
let creatingOffscreenDocument = null;
let lastVisibleTabCaptureAt = 0;

class CaptureCancelledError extends Error {
  constructor() {
    super("CAPTURE_CANCELLED");
    this.name = "CaptureCancelledError";
  }
}

function assertNotCancelled() {
  if (captureCancelled) throw new CaptureCancelledError();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendToTab(tabId, message, frameId = 0) {
  const response = await chrome.tabs.sendMessage(tabId, message, { frameId });
  if (response?.error) throw new Error(response.error);
  return response;
}

async function assertTabIsActive(tabId, windowId) {
  const [[activeTab], win] = await Promise.all([
    chrome.tabs.query({ active: true, windowId }),
    chrome.windows.get(windowId).catch(() => null)
  ]);
  if (activeTab?.id !== tabId) {
    throw new Error(t(
      "errorTabSwitched",
      undefined,
      "A captura foi interrompida porque outra aba ficou ativa. Volte à página e tente novamente."
    ));
  }
  if (win?.state === "minimized") {
    throw new Error(t(
      "errorWindowHidden",
      undefined,
      "A captura foi interrompida porque a janela do navegador ficou oculta ou minimizada. Mantenha a página visível e tente novamente."
    ));
  }
}

async function setBadge(text, color = "#126bda") {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
}

async function cropScreenshot(dataUrl, step, quality) {
  const sourceBlob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(sourceBlob);
  const scaleX = bitmap.width / step.viewport.width;
  const scaleY = bitmap.height / step.viewport.height;

  const sourceLeft = Math.max(0, Math.round(step.clip.left * scaleX));
  const sourceTop = Math.max(0, Math.round(step.clip.top * scaleY));
  const sourceWidth = Math.max(1, Math.min(bitmap.width - sourceLeft, Math.round(step.clip.width * scaleX)));
  const sourceHeight = Math.max(1, Math.min(bitmap.height - sourceTop, Math.round(step.clip.height * scaleY)));

  const canvas = new OffscreenCanvas(sourceWidth, sourceHeight);
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, sourceWidth, sourceHeight);
  context.drawImage(
    bitmap,
    sourceLeft,
    sourceTop,
    sourceWidth,
    sourceHeight,
    0,
    0,
    sourceWidth,
    sourceHeight
  );
  bitmap.close();

  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: quality / 100 });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return { blob, bytes, width: sourceWidth, height: sourceHeight, scaleX, scaleY };
}

async function captureVisibleTabSafely(windowId, options) {
  const minimumIntervalMs = 560;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const elapsed = Date.now() - lastVisibleTabCaptureAt;
    if (elapsed < minimumIntervalMs) await delay(minimumIntervalMs - elapsed);
    try {
      const image = await chrome.tabs.captureVisibleTab(windowId, options);
      lastVisibleTabCaptureAt = Date.now();
      return image;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(420 * attempt);
    }
  }
  throw lastError;
}

function bytesToDataUrl(bytes, mimeType) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, Math.min(index + chunkSize, bytes.length)));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function sanitizePdfText(value) {
  return String(value || "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2022/g, "-")
    .replace(/[^\x20-\xFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function boxesOverlap(a, b, padding = 0) {
  const left = Math.max(a.left, b.left - padding);
  const top = Math.max(a.top, b.top - padding);
  const right = Math.min(a.left + a.width, b.left + b.width + padding);
  const bottom = Math.min(a.top + a.height, b.top + b.height + padding);
  if (right <= left || bottom <= top) return false;
  const intersection = (right - left) * (bottom - top);
  const smaller = Math.min(a.width * a.height, b.width * b.height);
  return smaller > 0 && intersection / smaller > 0.38;
}

function deduplicateOcrWords(ocrWords, step, capture) {
  const domBoxes = (step.textItems || []).map((item) => ({
    left: (item.left - step.clip.left) * capture.scaleX,
    top: (item.top - step.clip.top) * capture.scaleY,
    width: item.width * capture.scaleX,
    height: item.height * capture.scaleY
  }));

  return (ocrWords || []).filter((word) => {
    if (!sanitizePdfText(word.text)) return false;
    return !domBoxes.some((box) => boxesOverlap(word, box, 4));
  });
}

function drawInvisibleText(page, font, text, options) {
  const safeText = sanitizePdfText(text);
  if (!safeText) return;
  try {
    page.drawText(safeText, {
      font,
      size: Math.max(2, Math.min(34, options.size)),
      x: Math.max(0, options.x),
      y: Math.max(0, options.y),
      color: rgb(0, 0, 0),
      opacity: 0
    });
  } catch {
    const fallback = safeText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7E]/g, "");
    if (fallback) {
      page.drawText(fallback, {
        font,
        size: Math.max(2, Math.min(34, options.size)),
        x: Math.max(0, options.x),
        y: Math.max(0, options.y),
        color: rgb(0, 0, 0),
        opacity: 0
      });
    }
  }
}

async function addPdfPage(pdf, font, capture, step, ocrWords) {
  const image = await pdf.embedJpg(capture.bytes);
  const imageScale = Math.min(0.75, 1000 / capture.width);
  const imageWidth = capture.width * imageScale;
  const imageHeight = capture.height * imageScale;
  const headerHeight = 30;
  const page = pdf.addPage([imageWidth, imageHeight + headerHeight]);
  page.drawRectangle({ x: 0, y: imageHeight, width: imageWidth, height: headerHeight, color: rgb(0.975, 0.982, 0.992) });
  const partLabel = t("pdfPart", [String(step.part)], `trecho ${step.part}`);
  const headerText = sanitizePdfText(`${step.label} — ${partLabel}`)
    || t("pdfPartFallback", [String(step.part)], `Trecho ${step.part}`);
  page.drawText(headerText, {
    x: 12,
    y: imageHeight + 10,
    size: 9,
    font,
    color: rgb(0.25, 0.32, 0.42)
  });
  page.drawImage(image, { x: 0, y: 0, width: imageWidth, height: imageHeight });

  for (const item of step.textItems || []) {
    const x = (item.left - step.clip.left) * capture.scaleX * imageScale;
    const y = imageHeight - ((item.top - step.clip.top) + item.height) * capture.scaleY * imageScale;
    drawInvisibleText(page, font, item.text, {
      x,
      y,
      size: item.height * capture.scaleY * imageScale * 0.76
    });
  }

  const uniqueOcrWords = deduplicateOcrWords(ocrWords, step, capture);
  for (const word of uniqueOcrWords) {
    drawInvisibleText(page, font, word.text, {
      x: word.left * imageScale,
      y: imageHeight - (word.top + word.height) * imageScale,
      size: word.height * imageScale * 0.78
    });
  }
}

async function ensureOcrDocument() {
  const offscreenUrl = chrome.runtime.getURL(OCR_DOCUMENT_PATH);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [offscreenUrl]
  });
  if (contexts.length) return;
  if (creatingOffscreenDocument) return creatingOffscreenDocument;

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: OCR_DOCUMENT_PATH,
    reasons: ["WORKERS"],
    justification: t("offscreenJustification", undefined, "Executar OCR local nas capturas sem abrir outra página.")
  });
  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

async function recognizeText(capture) {
  await ensureOcrDocument();
  const imageDataUrl = bytesToDataUrl(capture.bytes, "image/jpeg");
  const response = await chrome.runtime.sendMessage({
    target: "salva-site-offscreen",
    type: "SALVA_SITE_RUN_OCR",
    imageDataUrl
  });
  if (response?.error) throw new Error(response.error);
  return response?.words || [];
}

async function closeOcrDocument() {
  try {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (!contexts.length) return;
    await chrome.runtime.sendMessage({ target: "salva-site-offscreen", type: "SALVA_SITE_STOP_OCR" }).catch(() => {});
    await chrome.offscreen.closeDocument();
  } catch {
    // O documento é apenas auxiliar; uma falha ao fechá-lo não invalida o PDF.
  }
}

function safeFilename(title) {
  const fallbackTitle = t("defaultSavedTitle", undefined, "Página salva");
  const base = String(title || fallbackTitle)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 110) || fallbackTitle;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${base} - ${timestamp}.pdf`;
}

async function storeAndOpenResult(bytes, metadata) {
  const id = crypto.randomUUID();
  const blob = new Blob([bytes], { type: "application/pdf" });
  await SalvaSiteDB.cleanup().catch(() => {});
  await SalvaSiteDB.save({
    id,
    blob,
    filename: metadata.filename,
    pageCount: metadata.pageCount,
    sourceTitle: metadata.sourceTitle,
    warnings: metadata.warnings,
    createdAt: Date.now()
  });
  await chrome.tabs.create({ url: chrome.runtime.getURL(`result.html?id=${encodeURIComponent(id)}`) });
}

function translateEmbeddedFrameStep(step, layout, label) {
  const rect = layout.rect;
  const viewport = layout.viewport;
  const rawLeft = rect.left + step.clip.left;
  const rawTop = rect.top + step.clip.top;
  const rawRight = Math.min(rect.right ?? rect.left + rect.width, rect.left + step.clip.left + step.clip.width);
  const rawBottom = Math.min(rect.bottom ?? rect.top + rect.height, rect.top + step.clip.top + step.clip.height);
  const left = Math.max(0, rawLeft);
  const top = Math.max(0, rawTop);
  const right = Math.min(viewport.width, rawRight);
  const bottom = Math.min(viewport.height, rawBottom);
  if (right - left < 2 || bottom - top < 2) {
    throw new Error(t("errorPanelNotVisible", [label], `O painel “${label}” não ficou totalmente visível para a captura.`));
  }

  return {
    ...step,
    label,
    viewport,
    clip: { left, top, width: right - left, height: bottom - top },
    textItems: (step.textItems || []).map((item) => ({
      ...item,
      left: rect.left + item.left,
      top: rect.top + item.top
    }))
  };
}

async function captureTab(tabId, settings) {
  captureCancelled = false;
  const quality = Math.min(100, Math.max(50, Math.round(Number(settings?.imageQuality) || 92)));
  const tab = await chrome.tabs.get(tabId);
  if (typeof tab.windowId !== "number") throw new Error(t("errorNoWindowId", undefined, "Não foi possível identificar a janela da página."));
  const windowId = tab.windowId;
  const warnings = [];
  let preparedMain = false;
  const preparedFrameIds = [];

  const restoreEmbeddedFrames = async (outcome) => {
    for (const frameId of preparedFrameIds) {
      await sendToTab(tabId, {
        type: "SALVA_SITE_FINISH",
        outcome,
        silent: true
      }, frameId).catch(() => {});
    }
    preparedFrameIds.length = 0;
  };

  try {
    assertNotCancelled();
    await assertTabIsActive(tabId, windowId);
    await setBadge("…", "#1D4ED8");

    const preparation = await sendToTab(tabId, { type: "SALVA_SITE_PREPARE", settings });
    preparedMain = true;
    const frameTargets = [...new Map((settings.frameTargets || []).map((target) => [target.frameId, target])).values()];
    for (const frameTarget of frameTargets) {
      await sendToTab(tabId, {
        type: "SALVA_SITE_PREPARE",
        settings: {
          ...settings,
          candidateIds: [],
          frameTargets: [],
          embeddedFrame: true
        }
      }, frameTarget.frameId);
      preparedFrameIds.push(frameTarget.frameId);
    }

    const targets = [];
    if (settings.includePage) {
      targets.push({
        id: PAGE_TARGET_ID,
        label: t("mainPageTitle", undefined, "Página principal"),
        kind: "main",
        frameId: 0
      });
    }
    for (const candidate of preparation.candidates || []) {
      targets.push({ id: candidate.id, label: candidate.label, kind: "main", frameId: 0 });
    }
    for (const frameTarget of frameTargets) {
      targets.push({
        id: PAGE_TARGET_ID,
        label: frameTarget.label || t("embeddedDocFallback", undefined, "Documento incorporado"),
        kind: "frame",
        frameId: frameTarget.frameId,
        embedId: frameTarget.embedId,
        embedIndex: frameTarget.embedIndex
      });
    }
    if (!targets.length) throw new Error(t("errorSelectArea", undefined, "Selecione a página principal ou pelo menos uma área interna."));

    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const fontBytes = await fetch(chrome.runtime.getURL("vendor/fonts/noto-sans-latin.woff")).then((response) => response.arrayBuffer());
    const font = await pdf.embedFont(fontBytes, { subset: true });
    pdf.setTitle(preparation.title || t("defaultSavedTitle", undefined, "Página salva"));
    pdf.setSubject(t("pdfSubject", undefined, "Captura visual criada localmente pela extensão Salva Site"));
    pdf.setCreator("Salva Site");
    pdf.setProducer("Salva Site");
    pdf.setCreationDate(new Date());

    const setActionTitle = (title) => chrome.action.setTitle({ tabId, title }).catch(() => {});

    let pageCount = 0;
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      assertNotCancelled();
      const target = targets[targetIndex];
      await setActionTitle(t("statusPreparingArea", [target.label], `Preparando ${target.label}`));
      const frameLayout = target.kind === "frame"
        ? await sendToTab(tabId, {
          type: "SALVA_SITE_POSITION_EMBED",
          embedId: target.embedId,
          embedIndex: target.embedIndex
        })
        : null;
      await sendToTab(tabId, { type: "SALVA_SITE_BEGIN_TARGET", targetId: target.id }, target.frameId);

      while (true) {
        assertNotCancelled();
        const rawStep = await sendToTab(tabId, { type: "SALVA_SITE_NEXT_STEP" }, target.frameId);
        if (rawStep.done) break;
        assertNotCancelled();
        const step = target.kind === "frame"
          ? translateEmbeddedFrameStep(rawStep, frameLayout, target.label)
          : rawStep;
        await assertTabIsActive(tabId, windowId);

        const areaRatio = step.capturedEnd / Math.max(step.total, 1);
        const areaProgress = Math.min(100, Math.max(1, Math.round(areaRatio * 100)));
        await setActionTitle(`${t("statusCapturingArea", [step.label], `Capturando ${step.label}`)} — ${t("statusStepProgress", [String(step.part), String(areaProgress)], `Trecho ${step.part} • ${areaProgress}% desta área`)}`);
        await delay(40);
        assertNotCancelled();

        const screenshot = await captureVisibleTabSafely(windowId, {
          format: "jpeg",
          quality
        });
        assertNotCancelled();

        const capture = await cropScreenshot(screenshot, step, quality);
        let ocrWords = [];
        if (settings.fullOcr) {
          assertNotCancelled();
          await setBadge("OCR", "#1D4ED8");
          await setActionTitle(t("statusOcrDetail", [step.label, String(step.part)], `${step.label} • trecho ${step.part}. Esta etapa pode demorar.`));
          try {
            ocrWords = await recognizeText(capture);
          } catch (error) {
            warnings.push(t("warningOcrFailed", [String(error?.message || error)], `O OCR falhou em um trecho: ${error?.message || error}`));
          }
          assertNotCancelled();
        }
        await addPdfPage(pdf, font, capture, step, ocrWords);
        pageCount += 1;
        await setBadge(String(Math.min(pageCount, 99)), "#1D4ED8");
      }
    }

    assertNotCancelled();
    await sendToTab(tabId, {
      type: "SALVA_SITE_STATUS",
      title: t("statusFinalizingPdf", undefined, "Finalizando o PDF…"),
      detail: pageCount === 1
        ? t("capturedPageSingular", undefined, "1 página capturada")
        : t("capturedPagesPlural", [String(pageCount)], `${pageCount} páginas capturadas`),
      progress: 100
    });
    const pdfBytes = await pdf.save({ useObjectStreams: true });
    assertNotCancelled();
    await restoreEmbeddedFrames("success");
    await sendToTab(tabId, { type: "SALVA_SITE_FINISH", outcome: "success" });
    preparedMain = false;
    await storeAndOpenResult(pdfBytes, {
      filename: safeFilename(preparation.title),
      pageCount,
      sourceTitle: preparation.title,
      warnings
    });
  } catch (error) {
    if (error instanceof CaptureCancelledError) {
      await restoreEmbeddedFrames("cancelled");
      if (preparedMain) {
        await sendToTab(tabId, {
          type: "SALVA_SITE_FINISH",
          outcome: "cancelled",
          message: t("captureCancelledToast", undefined, "Captura cancelada. Rolagem e foco originais restaurados.")
        }).catch(() => {});
      }
      return;
    }
    await restoreEmbeddedFrames("error");
    if (preparedMain) {
      await sendToTab(tabId, {
        type: "SALVA_SITE_FINISH",
        outcome: "error",
        message: error?.message || t("errorCaptureFailed", undefined, "A captura não pôde ser concluída.")
      }).catch(() => {});
    }
    throw error;
  } finally {
    captureCancelled = false;
    if (settings.fullOcr) await closeOcrDocument();
    await setBadge("").catch(() => {});
    await chrome.action.setTitle({ tabId, title: "" }).catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SALVA_SITE_CANCEL_CAPTURE") {
    if (activeCapture) captureCancelled = true;
    sendResponse({ cancelling: Boolean(activeCapture) });
    return undefined;
  }

  if (message?.type !== "SALVA_SITE_START_CAPTURE") return undefined;
  if (activeCapture) {
    sendResponse({ started: false, error: t("errorCaptureInProgress", undefined, "Já existe uma captura em andamento.") });
    return undefined;
  }

  activeCapture = captureTab(message.tabId, message.settings || {})
    .catch((error) => console.error("Salva Site:", error))
    .finally(() => { activeCapture = null; });
  sendResponse({ started: true });
  return undefined;
});
