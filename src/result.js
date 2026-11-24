const { t, applyI18n } = globalThis.SalvaSiteI18n;

const elements = {
  icon: document.querySelector("#state-icon"),
  iconSvg: document.querySelector("#state-icon-svg"),
  title: document.querySelector("#title"),
  description: document.querySelector("#description"),
  fileInfo: document.querySelector("#file-info"),
  filename: document.querySelector("#filename"),
  details: document.querySelector("#details"),
  warning: document.querySelector("#warning"),
  warningText: document.querySelector("#warning-text"),
  warningDismiss: document.querySelector("#warning-dismiss"),
  error: document.querySelector("#error"),
  errorText: document.querySelector("#error-text"),
  errorDismiss: document.querySelector("#error-dismiss"),
  downloadWrap: document.querySelector("#download-wrap"),
  download: document.querySelector("#download"),
  downloadLabel: document.querySelector("#download-label"),
  downloadDoneText: document.querySelector("#download-done-text"),
  downloadLive: document.querySelector("#download-live"),
  close: document.querySelector("#close")
};

let record = null;
let objectUrl = null;
let autoDownloadStarted = false;
let resetTimer = 0;

function humanFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setButtonState(nextState, progress = 0) {
  elements.downloadWrap.dataset.state = nextState;
  elements.downloadWrap.style.setProperty("--p", String(progress));
}

function showError(message) {
  elements.icon.classList.add("is-error");
  elements.iconSvg.replaceChildren();
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "M12 7v6M12 16.5h.01");
  elements.iconSvg.append(path);

  elements.title.textContent = t("resultErrorTitle", undefined, "Could not open the PDF");
  elements.description.textContent = t("resultErrorDescription", undefined, "The original page remains intact.");
  elements.errorText.textContent = message;
  elements.error.hidden = false;
  elements.download.disabled = true;
}

async function downloadPdf() {
  if (!record) return;
  clearTimeout(resetTimer);
  elements.error.hidden = true;
  elements.download.disabled = true;
  setButtonState("run", 0.35);
  elements.downloadLive.textContent = t("resultSavingButton", undefined, "Opening save dialog…");

  try {
    if (!objectUrl) objectUrl = URL.createObjectURL(record.blob);
    setButtonState("run", 0.72);
    await chrome.downloads.download({
      url: objectUrl,
      filename: record.filename,
      saveAs: true
    });
    setButtonState("fold", 1);
    elements.downloadLive.textContent = t("resultSavedNotice", undefined, "Saved to Downloads");

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    setTimeout(() => {
      setButtonState("done", 1);
    }, reducedMotion ? 40 : 280);

    resetTimer = setTimeout(() => {
      setButtonState("idle", 0);
      elements.downloadLabel.textContent = t("resultSaveAgainButton", undefined, "Save again");
      elements.download.disabled = false;
    }, reducedMotion ? 900 : 2200);
  } catch (error) {
    setButtonState("idle", 0);
    elements.download.disabled = false;
    elements.downloadLabel.textContent = t("resultRetrySaveButton", undefined, "Try saving again");
    if (!String(error?.message || error).toLowerCase().includes("canceled")) {
      elements.errorText.textContent = error?.message || t("resultDownloadFailed", undefined, "Download could not be started.");
      elements.error.hidden = false;
    }
  }
}

async function initialize() {
  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    showError(t("resultMissingId", undefined, "File identifier was not found."));
    return;
  }

  try {
    record = await SalvaSiteDB.get(id);
    if (!record?.blob) throw new Error(t("resultExpiredFile", undefined, "The temporary file no longer exists. Start a new capture."));

    elements.fileInfo.hidden = false;
    elements.filename.textContent = record.filename;
    const pageText = record.pageCount === 1
      ? t("resultPageSingular", undefined, "1 page")
      : t("resultPagesPlural", [String(record.pageCount)], `${record.pageCount} pages`);
    elements.details.textContent = t(
      "resultDetailsFormat",
      [pageText, humanFileSize(record.blob.size)],
      `${pageText} • ${humanFileSize(record.blob.size)}`
    );
    if (record.warnings?.length) {
      elements.warningText.textContent = t(
        "resultOcrWarning",
        undefined,
        "The PDF was created, but OCR could not recognize one or more parts. Images are still preserved normally."
      );
      elements.warning.hidden = false;
    }

    if (!autoDownloadStarted) {
      autoDownloadStarted = true;
      await downloadPdf();
    }
  } catch (error) {
    showError(error?.message || t("resultReadFailed", undefined, "The temporary file could not be read."));
  }
}

applyI18n();
elements.warningDismiss.setAttribute("aria-label", t("dismissAlertLabel", undefined, "Dismiss alert"));
elements.errorDismiss.setAttribute("aria-label", t("dismissAlertLabel", undefined, "Dismiss alert"));
elements.warningDismiss.addEventListener("click", () => { elements.warning.hidden = true; });
elements.errorDismiss.addEventListener("click", () => { elements.error.hidden = true; });
elements.download.addEventListener("click", downloadPdf);
elements.close.addEventListener("click", () => window.close());
window.addEventListener("beforeunload", () => {
  clearTimeout(resetTimer);
  if (objectUrl) URL.revokeObjectURL(objectUrl);
});

initialize();
