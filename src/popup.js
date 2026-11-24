const { t, applyI18n } = globalThis.SalvaSiteI18n;

const QUALITY_OPTIONS = [
  { value: "92", labelKey: "qualityHigh", labelFallback: "High", detailKey: "qualityHighDetail", detailFallback: "92% • Sharpest text and forms" },
  { value: "84", labelKey: "qualityBalanced", labelFallback: "Balanced", detailKey: "qualityBalancedDetail", detailFallback: "84% • Balanced clarity and file size" },
  { value: "72", labelKey: "qualitySmaller", labelFallback: "Smaller file", detailKey: "qualitySmallerDetail", detailFallback: "72% • Compact PDF for long pages" }
];

const state = {
  tab: null,
  candidates: [],
  frames: [],
  pendingOrigins: [],
  settingsLoaded: false,
  selectedQuality: "92"
};

const elements = {
  scanState: document.querySelector("#scan-state"),
  scanMessage: document.querySelector("#scan-message"),
  content: document.querySelector("#content"),
  includePage: document.querySelector("#include-page"),
  searchableText: document.querySelector("#searchable-text"),
  fullOcr: document.querySelector("#full-ocr"),
  areas: document.querySelector("#areas"),
  areasSummary: document.querySelector("#areas-summary"),
  toggleAreas: document.querySelector("#toggle-areas"),
  externalEmbeds: document.querySelector("#external-embeds"),
  externalEmbedsList: document.querySelector("#external-embeds-list"),
  optionsItem: document.querySelector("#options-item"),
  optionsToggle: document.querySelector("#options-toggle"),
  optionsBody: document.querySelector("#options-body"),
  qualityPicker: document.querySelector("#quality-picker"),
  qualityBtn: document.querySelector("#quality-btn"),
  qualityListbox: document.querySelector("#quality-listbox"),
  qualityHighlight: document.querySelector("#quality-listbox .u031-hl"),
  qualityCurrentLabel: document.querySelector("#quality-current-label"),
  qualityCurrentDetail: document.querySelector("#quality-current-detail"),
  capture: document.querySelector("#capture"),
  captureLabel: document.querySelector("#capture-label"),
  error: document.querySelector("#error"),
  errorText: document.querySelector("#error-text"),
  errorDismiss: document.querySelector("#error-dismiss")
};

let qualityItems = [];
let qualityActiveIndex = 0;
let qualityTyped = "";
let qualityTypeTimer = 0;
let expandTimer = 0;

function createSvgCheck() {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m5.5 12.5 4 4 9-9.5");
  svg.append(path);
  return svg;
}

async function sendToFrame(message, frameId = 0) {
  return chrome.tabs.sendMessage(state.tab.id, message, { frameId });
}

function clearPageHighlight() {
  if (!state.tab?.id) return;
  sendToFrame({ type: "SALVA_SITE_HIGHLIGHT", candidateId: null }, 0).catch(() => {});
}

async function ensureFrameContentScript(frameId) {
  try {
    await sendToFrame({ type: "SALVA_SITE_PING" }, frameId);
    return true;
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: state.tab.id, frameIds: [frameId] },
        files: ["content.js"]
      });
      return true;
    } catch {
      return false;
    }
  }
}

function showError(message) {
  elements.errorText.textContent = message;
  elements.error.hidden = false;
}

function clearError() {
  elements.errorText.textContent = "";
  elements.error.hidden = true;
}

function selectedCandidateIds() {
  return [...elements.areas.querySelectorAll("input[data-candidate-id]:checked")]
    .map((input) => input.dataset.candidateId);
}

function selectedCandidates() {
  const ids = new Set(selectedCandidateIds());
  return state.candidates.filter((candidate) => ids.has(candidate.id));
}

function updateSummary() {
  const selected = selectedCandidateIds().length;
  const total = state.candidates.length;
  if (!total) {
    elements.areasSummary.textContent = t("areasEmptySummary", undefined, "No inner area found");
  } else if (total === 1) {
    elements.areasSummary.textContent = t(
      "areasSummarySingle",
      [String(selected), String(total)],
      `${selected} of ${total} area selected`
    );
  } else {
    elements.areasSummary.textContent = t(
      "areasSummaryPlural",
      [String(selected), String(total)],
      `${selected} of ${total} areas selected`
    );
  }
  elements.toggleAreas.hidden = total === 0;
  elements.toggleAreas.textContent = selected === total
    ? t("toggleUncheckAll", undefined, "Uncheck")
    : t("toggleCheckAll", undefined, "Select all");
  elements.capture.disabled = !elements.includePage.checked && selected === 0;
}

function persistSettings() {
  return chrome.storage.local.set({
    includePage: elements.includePage.checked,
    searchableText: elements.searchableText.checked,
    fullOcr: elements.fullOcr.checked,
    imageQuality: state.selectedQuality
  }).catch(() => {});
}

async function loadSettingsOnce() {
  if (state.settingsLoaded) return;
  const saved = await chrome.storage.local.get({
    includePage: true,
    searchableText: true,
    fullOcr: false,
    imageQuality: "92"
  });
  elements.includePage.checked = saved.includePage;
  elements.searchableText.checked = saved.searchableText;
  elements.fullOcr.checked = saved.fullOcr;
  setQualityValue(saved.imageQuality, false);
  state.settingsLoaded = true;
}

function bindSwitchPressEffect() {
  for (const row of document.querySelectorAll(".u433-sw-row")) {
    const input = row.querySelector("input");
    row.addEventListener("pointerdown", (event) => {
      if (event.button === 0) row.classList.add("is-press");
    });
    for (const eventName of ["pointerup", "pointerleave", "pointercancel"]) {
      row.addEventListener(eventName, () => row.classList.remove("is-press"));
    }
    input?.addEventListener("keydown", (event) => {
      if (event.key === " ") row.classList.add("is-press");
    });
    input?.addEventListener("keyup", () => row.classList.remove("is-press"));
  }
}

function setOptionsExpanded(open) {
  clearTimeout(expandTimer);
  elements.optionsItem.classList.toggle("open", open);
  elements.optionsToggle.setAttribute("aria-expanded", String(open));
  if (open) {
    expandTimer = setTimeout(() => {
      if (elements.optionsItem.classList.contains("open")) {
        elements.optionsItem.classList.add("is-expanded");
      }
    }, 280);
  } else {
    closeQualityListbox(false);
    elements.optionsItem.classList.remove("is-expanded");
  }
}

function updateQualityHighlight() {
  elements.qualityHighlight.style.setProperty("--i", String(qualityActiveIndex));
  if (qualityItems[qualityActiveIndex]) {
    elements.qualityListbox.setAttribute("aria-activedescendant", qualityItems[qualityActiveIndex].id);
  }
}

function openQualityListbox() {
  elements.qualityPicker.classList.add("is-open");
  elements.qualityBtn.setAttribute("aria-expanded", "true");
  elements.qualityListbox.classList.add("is-open");
  qualityActiveIndex = Math.max(0, QUALITY_OPTIONS.findIndex((opt) => opt.value === state.selectedQuality));
  updateQualityHighlight();
  elements.qualityListbox.focus({ preventScroll: true });
}

function closeQualityListbox(refocus) {
  elements.qualityPicker.classList.remove("is-open");
  elements.qualityBtn.setAttribute("aria-expanded", "false");
  elements.qualityListbox.classList.remove("is-open");
  if (refocus) elements.qualityBtn.focus({ preventScroll: true });
}

function setQualityValue(value, shouldPersist = true) {
  const index = Math.max(0, QUALITY_OPTIONS.findIndex((opt) => opt.value === String(value)));
  const option = QUALITY_OPTIONS[index];
  state.selectedQuality = option.value;
  qualityActiveIndex = index;

  const label = t(option.labelKey, undefined, option.labelFallback);
  const detail = t(option.detailKey, undefined, option.detailFallback);
  elements.qualityCurrentLabel.textContent = label;
  elements.qualityCurrentDetail.textContent = detail;

  qualityItems.forEach((li, itemIndex) => {
    li.setAttribute("aria-selected", String(itemIndex === index));
  });
  if (shouldPersist) persistSettings();
}

function initQualityListbox() {
  QUALITY_OPTIONS.forEach((opt, index) => {
    const li = document.createElement("li");
    li.className = "u031-o";
    li.id = `quality-opt-${opt.value}`;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", String(opt.value === state.selectedQuality));

    const copy = document.createElement("span");
    copy.className = "u031-o__copy";
    const title = document.createElement("b");
    title.textContent = t(opt.labelKey, undefined, opt.labelFallback);
    const detail = document.createElement("small");
    detail.className = "ux-num";
    detail.textContent = t(opt.detailKey, undefined, opt.detailFallback);
    copy.append(title, detail);

    const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    check.setAttribute("class", "u031-ck");
    check.setAttribute("viewBox", "0 0 18 18");
    check.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M4 9.5l3.5 3.5L14 6");
    check.append(path);

    li.append(copy, check);
    li.addEventListener("pointermove", () => {
      if (qualityActiveIndex !== index) {
        qualityActiveIndex = index;
        updateQualityHighlight();
      }
    });
    li.addEventListener("click", () => {
      setQualityValue(opt.value, true);
      closeQualityListbox(true);
    });

    elements.qualityListbox.append(li);
    qualityItems.push(li);
  });

  elements.qualityBtn.addEventListener("click", () => {
    if (elements.qualityListbox.classList.contains("is-open")) closeQualityListbox(true);
    else openQualityListbox();
  });

  elements.qualityBtn.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openQualityListbox();
    }
  });

  elements.qualityListbox.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      qualityActiveIndex = Math.min(qualityItems.length - 1, qualityActiveIndex + 1);
      updateQualityHighlight();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      qualityActiveIndex = Math.max(0, qualityActiveIndex - 1);
      updateQualityHighlight();
    } else if (event.key === "Home") {
      event.preventDefault();
      qualityActiveIndex = 0;
      updateQualityHighlight();
    } else if (event.key === "End") {
      event.preventDefault();
      qualityActiveIndex = qualityItems.length - 1;
      updateQualityHighlight();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setQualityValue(QUALITY_OPTIONS[qualityActiveIndex].value, true);
      closeQualityListbox(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeQualityListbox(true);
    } else if (event.key === "Tab") {
      closeQualityListbox(false);
    } else if (event.key.length === 1) {
      qualityTyped += event.key.toLowerCase();
      clearTimeout(qualityTypeTimer);
      qualityTypeTimer = setTimeout(() => { qualityTyped = ""; }, 600);
      const hit = QUALITY_OPTIONS.findIndex((opt) =>
        t(opt.labelKey, undefined, opt.labelFallback).toLowerCase().startsWith(qualityTyped)
        || opt.value.startsWith(qualityTyped)
      );
      if (hit >= 0) {
        qualityActiveIndex = hit;
        updateQualityHighlight();
      }
    }
  });

  elements.qualityListbox.addEventListener("blur", () => {
    setTimeout(() => {
      if (!elements.qualityPicker.contains(document.activeElement)) closeQualityListbox(false);
    }, 0);
  });

  document.addEventListener("pointerdown", (event) => {
    if (elements.qualityListbox.classList.contains("is-open") && !elements.qualityPicker.contains(event.target)) {
      closeQualityListbox(false);
    }
  });
}

function renderCandidates() {
  elements.areas.replaceChildren();

  if (!state.candidates.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = t("noScrollableAreas", undefined, "This page did not show other scrollbars.");
    elements.areas.append(empty);
    updateSummary();
    return;
  }

  for (const candidate of state.candidates) {
    const label = document.createElement("label");
    label.className = "u433-row area";
    label.dataset.candidateId = candidate.id;

    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "u433-in";
    input.checked = true;
    input.dataset.candidateId = candidate.id;
    input.addEventListener("change", updateSummary);

    const checkboxBox = document.createElement("span");
    checkboxBox.className = "u433-cb";
    checkboxBox.setAttribute("aria-hidden", "true");
    checkboxBox.append(createSvgCheck());

    const text = document.createElement("span");
    text.className = "area__text";
    const title = document.createElement("strong");
    title.textContent = candidate.label;
    const detail = document.createElement("small");
    detail.className = "ux-num";
    detail.textContent = t(
      "visiblePxDetail",
      [String(Math.round(candidate.clientWidth)), String(Math.round(candidate.clientHeight))],
      `${Math.round(candidate.clientWidth)} × ${Math.round(candidate.clientHeight)} px visible`
    );
    text.append(title, detail);

    const pages = document.createElement("span");
    pages.className = "area__pages ux-num";
    pages.textContent = candidate.estimatedParts === 1
      ? t("partSingle", [String(candidate.estimatedParts)], `≈ ${candidate.estimatedParts} part`)
      : t("partPlural", [String(candidate.estimatedParts)], `≈ ${candidate.estimatedParts} parts`);

    label.append(input, checkboxBox, text, pages);

    const showHighlight = () => {
      const message = candidate.kind === "frame"
        ? { type: "SALVA_SITE_HIGHLIGHT_EMBED", embedId: candidate.embedId, embedIndex: candidate.embedIndex }
        : { type: "SALVA_SITE_HIGHLIGHT", candidateId: candidate.id };
      sendToFrame(message, 0).catch(() => {});
    };

    label.addEventListener("mouseenter", showHighlight);
    label.addEventListener("focusin", showHighlight);
    label.addEventListener("mouseleave", clearPageHighlight);
    label.addEventListener("focusout", (event) => {
      if (!label.contains(event.relatedTarget)) clearPageHighlight();
    });

    elements.areas.append(label);
  }

  updateSummary();
}

function renderExternalEmbeds() {
  elements.externalEmbedsList.replaceChildren();
  if (!state.pendingOrigins.length) {
    elements.externalEmbeds.hidden = true;
    return;
  }

  elements.externalEmbeds.hidden = false;
  for (const item of state.pendingOrigins) {
    const row = document.createElement("div");
    row.className = "external-embed";

    const text = document.createElement("span");
    text.className = "external-embed__text";
    text.textContent = t(
      "externalEmbedHint",
      [item.host],
      `Embedded from ${item.host} — grant local access to scroll and capture it`
    );

    const allow = document.createElement("button");
    allow.className = "external-embed__allow";
    allow.type = "button";
    allow.textContent = t("allowCaptureButton", undefined, "Allow capture");

    const showHighlight = () => {
      sendToFrame({
        type: "SALVA_SITE_HIGHLIGHT_EMBED",
        embedId: item.embedId,
        embedIndex: item.embedIndex
      }, 0).catch(() => {});
    };

    row.addEventListener("mouseenter", showHighlight);
    row.addEventListener("focusin", showHighlight);
    row.addEventListener("mouseleave", clearPageHighlight);
    row.addEventListener("focusout", (event) => {
      if (!row.contains(event.relatedTarget)) clearPageHighlight();
    });

    allow.addEventListener("click", async () => {
      clearError();
      allow.disabled = true;
      try {
        const granted = await chrome.permissions.request({ origins: [`${item.origin}/*`] });
        if (granted) {
          clearPageHighlight();
          await analyzePage();
        } else {
          showError(t("permissionDeniedError", [item.host], `Access to ${item.host} was not granted.`));
          allow.disabled = false;
        }
      } catch (error) {
        showError(error?.message || t("permissionDeniedError", [item.host], `Access to ${item.host} was not granted.`));
        allow.disabled = false;
      }
    });

    row.append(text, allow);
    elements.externalEmbedsList.append(row);
  }
}

function findMatchingEmbedIndex(unusedEmbeds, frameUrl, frameOrigin, page) {
  let index = unusedEmbeds.findIndex((embed) => embed.src && embed.src === frameUrl);
  if (index >= 0) return index;

  if (page) {
    index = unusedEmbeds.findIndex((embed) =>
      embed.origin === frameOrigin
      && Math.abs(embed.clientWidth - page.clientWidth) < 12
      && Math.abs(embed.clientHeight - page.clientHeight) < 12
    );
    if (index >= 0) return index;
  }

  index = unusedEmbeds.findIndex((embed) => embed.origin === frameOrigin);
  if (index >= 0) return index;

  if (page) {
    index = unusedEmbeds.findIndex((embed) =>
      Math.abs(embed.clientWidth - page.clientWidth) < 12
      && Math.abs(embed.clientHeight - page.clientHeight) < 12
    );
    if (index >= 0) return index;
  }

  return unusedEmbeds.length === 1 ? 0 : -1;
}

async function analyzePage() {
  try {
    clearError();
    [state.tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!state.tab?.id || !/^https?:|^file:/.test(state.tab.url || "")) {
      throw new Error(t(
        "errorUnsupportedTab",
        undefined,
        "Open a regular website to capture. Internal browser pages do not allow extensions."
      ));
    }

    await loadSettingsOnce();
    const topReady = await ensureFrameContentScript(0);
    if (!topReady) {
      throw new Error(t("errorAnalyzeFailed", undefined, "Could not analyze this page."));
    }

    const response = await sendToFrame({ type: "SALVA_SITE_ANALYZE" }, 0);
    state.candidates = (response?.candidates || []).map((candidate) => ({
      ...candidate,
      kind: "element",
      frameId: 0
    }));
    state.pendingOrigins = [];

    const topOrigin = new URL(state.tab.url).origin;
    const allFrames = await chrome.webNavigation.getAllFrames({ tabId: state.tab.id });
    state.frames = (allFrames || []).filter((frame) => {
      if (frame.frameId === 0) return false;
      return /^https?:/i.test(frame.url || "");
    });

    const unusedEmbeds = [...(response?.embeds || [])];
    const pendingByOrigin = new Map();

    for (const frame of state.frames) {
      let frameOrigin = "";
      let hostname = "";
      try {
        const parsed = new URL(frame.url);
        frameOrigin = parsed.origin;
        hostname = parsed.hostname;
      } catch {
        continue;
      }

      const isSameOrigin = topOrigin !== "null" && frameOrigin === topOrigin;
      const hasAccess = isSameOrigin
        || await chrome.permissions.contains({ origins: [`${frameOrigin}/*`] }).catch(() => false);

      if (hasAccess) {
        const ready = await ensureFrameContentScript(frame.frameId);
        if (!ready) continue;

        let frameAnalysis;
        try {
          frameAnalysis = await sendToFrame({ type: "SALVA_SITE_ANALYZE" }, frame.frameId);
        } catch {
          continue;
        }

        const page = frameAnalysis?.page;
        if (!page || page.scrollHeight - page.clientHeight < 36) continue;

        const embedMatchIndex = findMatchingEmbedIndex(unusedEmbeds, frame.url, frameOrigin, page);
        if (embedMatchIndex < 0) continue;
        const [embed] = unusedEmbeds.splice(embedMatchIndex, 1);

        const label = embed.title
          || (page.title
            ? t("embeddedDocNamed", [page.title], `${page.title} (embedded)`)
            : t("embeddedFormHost", [hostname], `Embedded form (${hostname})`));

        state.candidates.push({
          id: `frame-${frame.frameId}-page`,
          kind: "frame",
          frameId: frame.frameId,
          embedId: embed.id,
          embedIndex: embed.index,
          label,
          clientWidth: page.clientWidth,
          clientHeight: page.clientHeight,
          scrollHeight: page.scrollHeight,
          estimatedParts: Math.max(1, Math.ceil(page.scrollHeight / Math.max(page.clientHeight, 1)))
        });
      } else if (!pendingByOrigin.has(frameOrigin)) {
        const embedMatch = unusedEmbeds.find((embed) =>
          embed.origin === frameOrigin
          && embed.rect.width >= 200
          && embed.rect.height >= 140
        );
        if (embedMatch) {
          pendingByOrigin.set(frameOrigin, {
            origin: frameOrigin,
            host: hostname,
            embedId: embedMatch.id,
            embedIndex: embedMatch.index
          });
        }
      }
    }

    state.pendingOrigins = [...pendingByOrigin.values()];
    renderCandidates();
    renderExternalEmbeds();
    elements.scanState.setAttribute("aria-busy", "false");
    elements.scanState.hidden = true;
    elements.content.hidden = false;
  } catch (error) {
    elements.scanState.setAttribute("aria-busy", "false");
    elements.scanState.replaceChildren();
    const alertBox = document.createElement("div");
    alertBox.className = "u072-a";
    alertBox.setAttribute("role", "alert");
    alertBox.style.setProperty("--c", "var(--ux-danger)");

    const iconWrap = document.createElement("span");
    iconWrap.className = "u072-ic";
    iconWrap.setAttribute("aria-hidden", "true");
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M8 4.5v4M8 11.2h.01");
    svg.append(p);
    iconWrap.append(svg);

    const text = document.createElement("p");
    text.className = "u072-tx";
    text.textContent = error?.message || t("errorAnalyzeFailed", undefined, "Could not analyze this page.");

    alertBox.append(iconWrap, text);
    elements.scanState.append(alertBox);
  }
}

elements.toggleAreas.addEventListener("click", () => {
  const inputs = [...elements.areas.querySelectorAll("input[data-candidate-id]")];
  const shouldCheck = inputs.some((input) => !input.checked);
  inputs.forEach((input) => { input.checked = shouldCheck; });
  updateSummary();
});

elements.includePage.addEventListener("change", () => {
  updateSummary();
  persistSettings();
});
elements.searchableText.addEventListener("change", persistSettings);
elements.fullOcr.addEventListener("change", persistSettings);

elements.optionsToggle.addEventListener("click", () => {
  setOptionsExpanded(!elements.optionsItem.classList.contains("open"));
});

elements.errorDismiss.setAttribute("aria-label", t("dismissAlertLabel", undefined, "Dismiss alert"));
elements.errorDismiss.addEventListener("click", clearError);

document.addEventListener("pointerleave", clearPageHighlight);
window.addEventListener("blur", clearPageHighlight);
window.addEventListener("pagehide", clearPageHighlight);

elements.capture.addEventListener("click", async () => {
  clearError();
  clearPageHighlight();
  elements.capture.disabled = true;
  elements.captureLabel.textContent = t("capturePreparing", undefined, "Preparing capture…");

  const selected = selectedCandidates();
  const settings = {
    includePage: elements.includePage.checked,
    candidateIds: selected.filter((candidate) => candidate.kind === "element").map((candidate) => candidate.id),
    frameTargets: selected.filter((candidate) => candidate.kind === "frame").map((candidate) => ({
      frameId: candidate.frameId,
      embedId: candidate.embedId,
      embedIndex: candidate.embedIndex,
      label: candidate.label
    })),
    searchableText: elements.searchableText.checked,
    fullOcr: elements.fullOcr.checked,
    imageQuality: Number(state.selectedQuality) || 92
  };

  await persistSettings();

  try {
    const response = await chrome.runtime.sendMessage({
      type: "SALVA_SITE_START_CAPTURE",
      tabId: state.tab.id,
      settings
    });
    if (!response?.started) throw new Error(response?.error || t("errorStartFailed", undefined, "Capture could not be started."));
    setTimeout(() => window.close(), 400);
  } catch (error) {
    showError(error?.message || t("errorStartGeneric", undefined, "Could not start capture."));
    elements.capture.disabled = false;
    elements.captureLabel.textContent = t("captureButton", undefined, "Save as PDF");
  }
});

applyI18n();
initQualityListbox();
bindSwitchPressEffect();
analyzePage();
