(() => {
  if (globalThis.__SALVA_SITE_CONTENT_V1__) return;
  globalThis.__SALVA_SITE_CONTENT_V1__ = true;

  const PAGE_TARGET_ID = "__salva_site_page__";
  const MAX_CANDIDATES = 16;
  const MAX_CAPTURE_PARTS = 250;
  const TEXT_ITEM_LIMIT = 6000;

  let candidates = new Map();
  let embeds = new Map();
  let captureState = null;
  let highlightHost = null;
  let statusHost = null;
  let statusCard = null;
  let statusTitle = null;
  let statusDetail = null;
  let statusBar = null;
  let statusTrack = null;
  let statusCancel = null;
  let escapeKeyHandler = null;

  function t(key, substitutions, fallback = "") {
    try {
      const value = globalThis.chrome?.i18n?.getMessage?.(key, substitutions);
      if (value) return value;
    } catch {}
    return fallback || key;
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function settlePage(delay = 260) {
    await Promise.race([
      new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
      wait(140)
    ]);
    await wait(delay);
  }

  function isVisibleElement(element) {
    if (!(element instanceof Element)) return false;
    const style = getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return false;
    const rect = element.getBoundingClientRect();
    return rect.width >= 1 && rect.height >= 1 && element.getClientRects().length > 0;
  }

  function isScrollableElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element === document.body || element === document.documentElement || element === document.scrollingElement) return false;
    if (element.scrollHeight - element.clientHeight < 36) return false;
    if (element.clientWidth < 170 || element.clientHeight < 80) return false;
    const style = getComputedStyle(element);
    const acceptsVerticalScroll = /(auto|scroll|overlay)/.test(style.overflowY)
      || element instanceof HTMLTextAreaElement;
    return acceptsVerticalScroll && isVisibleElement(element);
  }

  function normalizeLabel(text) {
    return String(text || "")
      .replace(/\s+/g, " ")
      .replace(/[\u0000-\u001f]/g, "")
      .trim()
      .slice(0, 72);
  }

  function labelForElement(element, index) {
    const directLabel = normalizeLabel(
      element.getAttribute("aria-label")
      || element.getAttribute("title")
      || element.getAttribute("data-title")
    );
    if (directLabel) return directLabel;

    if (element instanceof HTMLTextAreaElement) {
      const associated = element.labels?.[0]?.innerText;
      return normalizeLabel(associated) || t("textFieldLabel", [String(index + 1)], `Campo de texto ${index + 1}`);
    }

    const container = element.closest("form, section, article, main, [role='dialog'], [role='region']");
    const heading = container?.querySelector(":scope > h1, :scope > h2, :scope > h3, :scope > header h1, :scope > header h2, :scope > header h3");
    const headingLabel = normalizeLabel(heading?.innerText);
    if (headingLabel) return headingLabel;

    const firstText = normalizeLabel(element.innerText);
    if (firstText) return firstText;
    return t("innerAreaLabel", [String(index + 1)], `Área interna ${index + 1}`);
  }

  function rectanglesNearlyEqual(a, b) {
    return Math.abs(a.left - b.left) < 5
      && Math.abs(a.top - b.top) < 5
      && Math.abs(a.width - b.width) < 8
      && Math.abs(a.height - b.height) < 8;
  }

  function analyzeScrollableAreas() {
    removeHighlight();
    candidates = new Map();

    const raw = [...document.querySelectorAll("*")]
      .filter(isScrollableElement)
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .sort((a, b) => (b.element.scrollHeight - b.element.clientHeight) - (a.element.scrollHeight - a.element.clientHeight));

    const deduplicated = [];
    for (const item of raw) {
      const duplicateIndex = deduplicated.findIndex((existing) => rectanglesNearlyEqual(existing.rect, item.rect));
      if (duplicateIndex === -1) {
        deduplicated.push(item);
      } else if (item.element.scrollHeight > deduplicated[duplicateIndex].element.scrollHeight) {
        deduplicated[duplicateIndex] = item;
      }
    }

    const result = deduplicated.slice(0, MAX_CANDIDATES).map(({ element }, index) => {
      const id = `area-${Date.now().toString(36)}-${index}`;
      candidates.set(id, element);
      return {
        id,
        label: labelForElement(element, index),
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
        estimatedParts: Math.max(1, Math.ceil(element.scrollHeight / Math.max(element.clientHeight, 1)))
      };
    });

    return result;
  }

  function analyzeCurrentDocument() {
    const root = document.scrollingElement || document.documentElement;
    const embedsMap = new Map();
    const embedList = [];

    if (window.top === window) {
      const rawEmbeds = [...document.querySelectorAll("embed[type='text/html'], iframe")];
      rawEmbeds.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        if (!isVisibleElement(element) || rect.width < 100 || rect.height < 80) return;
        const rawSrc = (element.getAttribute("src") || element.src || "").trim();
        let src = "";
        let origin = "";
        let host = "";
        if (rawSrc) {
          try {
            const parsed = new URL(rawSrc, location.href);
            src = parsed.href;
            origin = parsed.origin;
            host = parsed.host;
          } catch {}
        }
        const id = `embed-${index}`;
        embedsMap.set(id, element);
        embedList.push({
          id,
          index,
          tagName: element.tagName.toLowerCase(),
          src,
          origin,
          host,
          title: normalizeLabel(
            element.getAttribute("title")
            || element.getAttribute("aria-label")
            || element.getAttribute("name")
          ),
          clientWidth: element.clientWidth || Math.round(rect.width),
          clientHeight: element.clientHeight || Math.round(rect.height),
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
        });
      });
    }
    embeds = embedsMap;

    return {
      candidates: analyzeScrollableAreas(),
      page: {
        isTop: window.top === window,
        title: normalizeLabel(document.title),
        clientWidth: window.innerWidth,
        clientHeight: window.innerHeight,
        scrollHeight: Math.max(root.scrollHeight, document.documentElement.scrollHeight, document.body?.scrollHeight || 0),
        scrollTop: Math.max(0, window.scrollY || root.scrollTop || 0)
      },
      embeds: embedList
    };
  }

  function removeHighlight() {
    highlightHost?.remove();
    highlightHost = null;
  }

  function highlightCandidate(candidateId) {
    removeHighlight();
    if (!candidateId) return;
    const element = candidates.get(candidateId);
    if (!element?.isConnected) return;
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right);
    const bottom = Math.min(innerHeight, rect.bottom);
    if (right <= left || bottom <= top) return;

    highlightHost = document.createElement("div");
    Object.assign(highlightHost.style, {
      position: "fixed",
      zIndex: "2147483646",
      pointerEvents: "none",
      left: `${left}px`,
      top: `${top}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
      border: "3px solid #1682f4",
      borderRadius: "8px",
      background: "rgba(22, 130, 244, .08)",
      boxShadow: "0 0 0 9999px rgba(9, 22, 40, .08)"
    });
    document.documentElement.append(highlightHost);
  }

  function resolveEmbedElement(embedRef) {
    if (typeof embedRef === "string" && embeds.has(embedRef)) {
      return embeds.get(embedRef);
    }
    if (embedRef && typeof embedRef === "object") {
      if (embedRef.embedId && embeds.has(embedRef.embedId)) {
        return embeds.get(embedRef.embedId);
      }
      if (typeof embedRef.embedIndex === "number") {
        return document.querySelectorAll("embed[type='text/html'], iframe")[embedRef.embedIndex] || null;
      }
    }
    if (typeof embedRef === "number") {
      return document.querySelectorAll("embed[type='text/html'], iframe")[embedRef] || null;
    }
    return null;
  }

  function highlightEmbed(embedRef) {
    removeHighlight();
    const element = resolveEmbedElement(embedRef);
    if (!element?.isConnected) return;
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(innerWidth, rect.right);
    const bottom = Math.min(innerHeight, rect.bottom);
    if (right <= left || bottom <= top) return;

    highlightHost = document.createElement("div");
    Object.assign(highlightHost.style, {
      position: "fixed",
      zIndex: "2147483646",
      pointerEvents: "none",
      left: `${left}px`,
      top: `${top}px`,
      width: `${right - left}px`,
      height: `${bottom - top}px`,
      border: "3px solid #7b4dff",
      borderRadius: "8px",
      background: "rgba(123, 77, 255, .08)",
      boxShadow: "0 0 0 9999px rgba(9, 22, 40, .08)"
    });
    document.documentElement.append(highlightHost);
  }

  function createStatusOverlay() {
    statusHost?.remove();
    if (escapeKeyHandler) {
      window.removeEventListener("keydown", escapeKeyHandler, true);
      escapeKeyHandler = null;
    }
    statusHost = document.createElement("div");
    statusHost.setAttribute("data-salva-site-ui", "status");
    Object.assign(statusHost.style, {
      position: "fixed",
      inset: "0",
      zIndex: "2147483647",
      pointerEvents: "auto",
      background: "transparent"
    });
    const shadow = statusHost.attachShadow({ mode: "closed" });
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `
      <style>
        :host { all: initial; }
        * { box-sizing: border-box; }
        .card {
          position: fixed;
          right: 20px;
          bottom: 20px;
          width: min(352px, calc(100vw - 40px));
          display: grid;
          gap: 12px;
          padding: 14px 16px;
          border: 1px solid rgba(22, 21, 27, 0.14);
          border-radius: 14px;
          color: #16151B;
          background: #FFFFFF;
          box-shadow: 0 12px 32px -12px rgba(22, 21, 27, 0.24);
          font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
          --accent: #1D4ED8;
          --muted: #4B4954;
          --track: #E6E3DC;
          --btn-bg: #F5F3EE;
          --btn-line: rgba(22, 21, 27, 0.16);
        }
        @media (prefers-color-scheme: dark) {
          .card {
            color: #F3F1EC;
            background: #1A1C22;
            border-color: rgba(255, 255, 255, 0.14);
            box-shadow: 0 16px 36px -12px rgba(0, 0, 0, 0.55);
            --accent: #60A5FA;
            --muted: #C2C0C8;
            --track: #2E323E;
            --btn-bg: #23262F;
            --btn-line: rgba(255, 255, 255, 0.18);
          }
        }
        .top {
          display: grid;
          grid-template-columns: 32px 1fr auto;
          gap: 12px;
          align-items: center;
        }
        .mark {
          width: 32px;
          height: 32px;
          border-radius: 9px;
          display: grid;
          place-items: center;
          background: var(--accent);
          color: #FFFFFF;
        }
        @media (prefers-color-scheme: dark) {
          .mark { color: #0B0D12; }
        }
        .mark svg { width: 18px; height: 18px; display: block; }
        .copy { min-width: 0; }
        strong {
          display: block;
          font-size: 13px;
          font-weight: 650;
          line-height: 1.3;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        small {
          display: block;
          margin-top: 2px;
          color: var(--muted);
          font-size: 11.5px;
          line-height: 1.35;
          font-variant-numeric: tabular-nums;
        }
        .cancel {
          flex-shrink: 0;
          height: 30px;
          padding: 0 10px;
          border: 1px solid var(--btn-line);
          border-radius: 8px;
          background: var(--btn-bg);
          color: inherit;
          font: 600 11.5px/1 "Segoe UI", system-ui, -apple-system, sans-serif;
          cursor: pointer;
          transition: background-color 150ms ease-out, transform 120ms ease-out;
        }
        .cancel:hover:not(:disabled) { border-color: var(--accent); }
        .cancel:active:not(:disabled) { transform: scale(0.97); }
        .cancel:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .cancel:disabled { opacity: 0.55; cursor: wait; }
        .track {
          height: 4px;
          width: 100%;
          border-radius: 999px;
          background: var(--track);
          overflow: hidden;
        }
        .bar {
          width: 100%;
          height: 100%;
          border-radius: inherit;
          background: var(--accent);
          transform-origin: 0 50%;
          transform: scaleX(0.04);
          transition: transform 180ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @media (prefers-reduced-motion: reduce) {
          .cancel, .bar { transition-duration: 0.001ms !important; }
        }
      </style>
      <div class="card" role="status" aria-live="polite">
        <div class="top">
          <span class="mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
              <path d="M5 7.5h14M5 12h10.5M5 16.5h7.5"/>
            </svg>
          </span>
          <span class="copy"><strong></strong><small></small></span>
          <button class="cancel" type="button"></button>
        </div>
        <div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
          <div class="bar"></div>
        </div>
      </div>`;
    statusCard = wrapper.querySelector(".card");
    statusTitle = wrapper.querySelector("strong");
    statusDetail = wrapper.querySelector("small");
    statusBar = wrapper.querySelector(".bar");
    statusTrack = wrapper.querySelector(".track");
    statusCancel = wrapper.querySelector(".cancel");
    statusTitle.textContent = t("overlayPreparingTitle", undefined, "Preparando a captura…");
    statusDetail.textContent = t("overlayKeepTab", undefined, "Não troque de aba até terminar.");
    statusCancel.textContent = t("cancelCaptureButton", undefined, "Cancelar");
    statusTrack.setAttribute("aria-label", t("statusProgressAria", undefined, "Progresso da captura"));

    const triggerCancel = () => {
      if (!statusCancel || statusCancel.disabled) return;
      statusCancel.disabled = true;
      chrome.runtime.sendMessage({ type: "SALVA_SITE_CANCEL_CAPTURE" }).catch(() => {});
    };
    statusCancel.addEventListener("click", triggerCancel);
    escapeKeyHandler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        triggerCancel();
      }
    };
    window.addEventListener("keydown", escapeKeyHandler, true);

    shadow.append(wrapper);
    document.documentElement.append(statusHost);
  }

  function updateStatus(title, detail, progress) {
    if (!statusHost) createStatusOverlay();
    statusCard.style.visibility = "visible";
    statusTitle.textContent = title || t("overlayCapturingDefault", undefined, "Capturando…");
    statusDetail.textContent = detail || t("overlayKeepTab", undefined, "Não troque de aba até terminar.");
    if (typeof progress === "number" && Number.isFinite(progress)) {
      const clamped = Math.max(0, Math.min(100, Math.round(progress)));
      const ratio = Math.max(0.04, clamped / 100);
      statusBar.style.transform = `scaleX(${ratio.toFixed(3)})`;
      statusTrack.setAttribute("aria-valuenow", String(clamped));
    }
  }

  function setStatusCardVisible(visible) {
    if (statusCard) statusCard.style.visibility = visible ? "visible" : "hidden";
  }

  function showToast(message, isError = false) {
    const dark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches;
    const host = document.createElement("div");
    host.setAttribute("role", isError ? "alert" : "status");
    Object.assign(host.style, {
      position: "fixed",
      right: "20px",
      bottom: "20px",
      zIndex: "2147483647",
      maxWidth: "360px",
      padding: "12px 15px",
      borderRadius: "12px",
      border: isError
        ? (dark ? "1px solid rgba(248, 113, 113, 0.45)" : "1px solid rgba(185, 28, 28, 0.3)")
        : (dark ? "1px solid rgba(255, 255, 255, 0.16)" : "1px solid rgba(22, 21, 27, 0.14)"),
      color: isError ? (dark ? "#FEE2E2" : "#7F1D1D") : (dark ? "#F3F1EC" : "#16151B"),
      background: isError ? (dark ? "#3B181C" : "#FEF2F2") : (dark ? "#1A1C22" : "#FFFFFF"),
      boxShadow: dark ? "0 14px 34px rgba(0,0,0,.5)" : "0 12px 30px rgba(22,21,27,.16)",
      font: '600 12px/1.45 "Segoe UI", system-ui, sans-serif',
      pointerEvents: "none"
    });
    host.textContent = message;
    document.documentElement.append(host);
    setTimeout(() => host.remove(), 6500);
  }

  function rememberScrollPosition(records, element) {
    if (!(element instanceof HTMLElement) || records.has(element)) return;
    records.set(element, { left: element.scrollLeft, top: element.scrollTop });
  }

  function getScrollableAncestors(element) {
    const result = [];
    let parent = element?.parentElement;
    while (parent) {
      if (parent.scrollHeight > parent.clientHeight || parent.scrollWidth > parent.clientWidth) result.push(parent);
      parent = parent.parentElement;
    }
    return result;
  }

  function createPauseStyle() {
    const style = document.createElement("style");
    style.setAttribute("data-salva-site-ui", "pause");
    style.textContent = `
      *, *::before, *::after {
        scroll-behavior: auto !important;
        animation-play-state: paused !important;
        transition-duration: 0s !important;
        caret-color: transparent !important;
      }
    `;
    document.documentElement.append(style);
    return style;
  }

  function prepareCapture(settings) {
    if (captureState) restoreCapture({ silent: true });
    removeHighlight();

    const selected = (settings.candidateIds || [])
      .map((id) => ({ id, element: candidates.get(id) }))
      .filter((item) => item.element?.isConnected);

    const scrollRecords = new Map();
    for (const { element } of selected) {
      rememberScrollPosition(scrollRecords, element);
      getScrollableAncestors(element).forEach((ancestor) => rememberScrollPosition(scrollRecords, ancestor));
    }

    captureState = {
      settings,
      selected,
      scrollRecords,
      windowX: window.scrollX,
      windowY: window.scrollY,
      activeElement: document.activeElement,
      pauseStyle: createPauseStyle(),
      target: null
    };
    if (!settings.embeddedFrame) createStatusOverlay();

    return {
      title: document.title,
      url: location.href,
      candidates: selected.map(({ id, element }, index) => ({
        id,
        label: labelForElement(element, index),
        estimatedParts: Math.max(1, Math.ceil(element.scrollHeight / Math.max(element.clientHeight, 1)))
      }))
    };
  }

  async function bringElementIntoView(element) {
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    await settlePage(120);
  }

  async function positionEmbed(embedRef) {
    const element = resolveEmbedElement(embedRef);
    if (!element?.isConnected) throw new Error(t("errorEmbedMissing", undefined, "O formulário incorporado deixou de existir durante a captura."));
    element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
    await settlePage(160);
    const rect = element.getBoundingClientRect();
    return {
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  }

  async function beginTarget(targetId) {
    if (!captureState) throw new Error(t("errorNotPrepared", undefined, "A sessão de captura não foi preparada."));
    let element = null;
    let kind = "page";
    let label = t("mainPageTitle", undefined, "Página principal");

    if (targetId !== PAGE_TARGET_ID) {
      element = candidates.get(targetId);
      if (!element?.isConnected) throw new Error(t("errorAreaMissing", undefined, "Uma área rolável deixou de existir durante a captura."));
      kind = "element";
      const selectedIndex = captureState.selected.findIndex((item) => item.id === targetId);
      label = labelForElement(element, Math.max(0, selectedIndex));
      await bringElementIntoView(element);
      element.scrollTop = 0;
    } else {
      window.scrollTo({ left: 0, top: 0, behavior: "instant" });
    }

    captureState.target = {
      id: targetId,
      kind,
      element,
      label,
      lastEnd: 0,
      iteration: 0
    };
    await settlePage();
    return { label };
  }

  function intersects(rect, clip) {
    return rect.right > clip.left
      && rect.left < clip.left + clip.width
      && rect.bottom > clip.top
      && rect.top < clip.top + clip.height;
  }

  function collectTextItems(scope, clip) {
    const items = [];
    const root = scope instanceof Element ? scope : document.body;
    if (!root) return items;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode()) && items.length < TEXT_ITEM_LIMIT) {
      const parent = node.parentElement;
      if (!parent || parent.closest("script, style, noscript, template, [aria-hidden='true']")) continue;
      const style = getComputedStyle(parent);
      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const parentRect = parent.getBoundingClientRect();
      if (!intersects(parentRect, clip)) continue;

      const value = node.nodeValue || "";
      const wordPattern = /\S+/gu;
      let match;
      while ((match = wordPattern.exec(value)) && items.length < TEXT_ITEM_LIMIT) {
        const range = document.createRange();
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        for (const rect of range.getClientRects()) {
          if (rect.width > 0 && rect.height > 0 && intersects(rect, clip)) {
            items.push({
              text: match[0],
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height
            });
          }
        }
      }
    }

    const fields = root.querySelectorAll?.("input, textarea, select") || [];
    for (const field of fields) {
      if (items.length >= TEXT_ITEM_LIMIT || !isVisibleElement(field)) continue;
      const rect = field.getBoundingClientRect();
      if (!intersects(rect, clip)) continue;

      let value = "";
      if (field instanceof HTMLSelectElement) {
        value = [...field.selectedOptions].map((option) => option.textContent).join(" ");
      } else if (field instanceof HTMLInputElement && ["checkbox", "radio"].includes(field.type)) {
        value = field.checked
          ? t("fieldChecked", undefined, "marcado")
          : t("fieldUnchecked", undefined, "desmarcado");
      } else if (field instanceof HTMLInputElement && field.type === "password") {
        value = "";
      } else {
        value = field.value;
      }
      value = normalizeLabel(value);
      if (value) {
        items.push({
          text: value,
          left: rect.left + 8,
          top: rect.top + Math.max(2, rect.height * 0.22),
          width: Math.max(1, rect.width - 16),
          height: Math.max(8, rect.height * 0.55)
        });
      }
    }
    return items;
  }

  function hasVisualContent(scope, clip) {
    const root = scope instanceof Element ? scope : document.body;
    if (!root) return false;
    const visualElements = root.querySelectorAll("img, picture, canvas, svg, video, iframe, input, textarea, select, button, [role='img']");
    for (const element of visualElements) {
      if (isVisibleElement(element) && intersects(element.getBoundingClientRect(), clip)) return true;
    }
    return false;
  }

  async function nextCaptureStep() {
    const session = captureState;
    const target = session?.target;
    if (!session || !target) throw new Error(t("errorNoActiveArea", undefined, "Nenhuma área de captura está ativa."));
    if (target.iteration >= MAX_CAPTURE_PARTS) return { done: true, reason: "limit" };

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    if (viewport.width < 2 || viewport.height < 2) throw new Error(t("errorWindowTooSmall", undefined, "A janela do navegador está pequena demais para capturar."));

    if (target.kind === "page") {
      const root = document.scrollingElement || document.documentElement;
      const currentTotal = Math.max(root.scrollHeight, document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      if (target.iteration > 0 && target.lastEnd >= currentTotal - 1) return { done: true };

      window.scrollTo({ left: 0, top: target.lastEnd, behavior: "instant" });
      await settlePage();

      const total = Math.max(root.scrollHeight, document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      const actualTop = Math.max(0, window.scrollY || root.scrollTop || 0);
      const contentStart = Math.max(actualTop, target.lastEnd);
      const clipTop = contentStart - actualTop;
      const clipHeight = Math.min(viewport.height - clipTop, total - contentStart);
      if (clipHeight < 2) return { done: true };

      const clip = { left: 0, top: clipTop, width: viewport.width, height: clipHeight };
      const previousEnd = target.lastEnd;
      target.lastEnd = contentStart + clipHeight;
      target.iteration += 1;
      if (target.lastEnd <= previousEnd + 0.5 && target.iteration > 1) return { done: true, reason: "stalled" };

      const textItems = session.settings.searchableText ? collectTextItems(document.body, clip) : [];
      const isShortTrailingPiece = target.iteration > 1 && clip.height < viewport.height * 0.32;
      if (isShortTrailingPiece && textItems.length === 0 && !hasVisualContent(document.body, clip)) {
        target.lastEnd = total;
        return { done: true, reason: "empty-tail" };
      }

      return {
        done: false,
        targetId: target.id,
        label: target.label,
        part: target.iteration,
        clip,
        viewport,
        total,
        capturedEnd: target.lastEnd,
        textItems
      };
    }

    const element = target.element;
    if (!element?.isConnected) throw new Error("A área interna desapareceu durante a captura.");
    if (target.iteration > 0 && target.lastEnd >= element.scrollHeight - 1) return { done: true };

    element.scrollTop = target.lastEnd;
    await settlePage();

    let rect = element.getBoundingClientRect();
    if (rect.bottom < 80 || rect.top > viewport.height - 80) {
      await bringElementIntoView(element);
      rect = element.getBoundingClientRect();
    }

    const contentTop = rect.top + element.clientTop;
    const visibleTop = Math.max(0, contentTop);
    const visibleBottom = Math.min(viewport.height, contentTop + element.clientHeight);
    const visibleLeft = Math.max(0, rect.left);
    const visibleRight = Math.min(viewport.width, rect.right);
    if (visibleBottom - visibleTop < 2 || visibleRight - visibleLeft < 2) {
      throw new Error(t("errorAreaNotVisible", [target.label], `A área “${target.label}” não ficou visível para a captura.`));
    }

    const actualTop = element.scrollTop;
    const visibleContentStart = actualTop + Math.max(0, visibleTop - contentTop);
    const contentStart = Math.max(visibleContentStart, target.lastEnd);
    const clipTop = visibleTop + (contentStart - visibleContentStart);
    const total = element.scrollHeight;
    const visibleContentEnd = actualTop + Math.max(0, visibleBottom - contentTop);
    const contentEnd = Math.min(total, visibleContentEnd);
    const clipHeight = contentEnd - contentStart;
    if (clipHeight < 2) return { done: true, reason: "stalled" };

    const clip = {
      left: visibleLeft,
      top: clipTop,
      width: visibleRight - visibleLeft,
      height: clipHeight
    };
    const previousEnd = target.lastEnd;
    target.lastEnd = contentEnd;
    target.iteration += 1;
    if (target.lastEnd <= previousEnd + 0.5 && target.iteration > 1) return { done: true, reason: "stalled" };

    const textItems = session.settings.searchableText ? collectTextItems(element, clip) : [];
    const isShortTrailingPiece = target.iteration > 1 && clip.height < element.clientHeight * 0.32;
    if (isShortTrailingPiece && textItems.length === 0 && !hasVisualContent(element, clip)) {
      target.lastEnd = total;
      return { done: true, reason: "empty-tail" };
    }

    return {
      done: false,
      targetId: target.id,
      label: target.label,
      part: target.iteration,
      clip,
      viewport,
      total,
      capturedEnd: target.lastEnd,
      textItems
    };
  }

  async function restoreCapture({ outcome, message, silent } = {}) {
    const session = captureState;
    captureState = null;
    try {
      if (session) {
        for (const [element, position] of session.scrollRecords) {
          if (element?.isConnected) {
            element.scrollLeft = position.left;
            element.scrollTop = position.top;
          }
        }
        window.scrollTo({ left: session.windowX, top: session.windowY, behavior: "instant" });
        session.pauseStyle?.remove();
        if (session.activeElement instanceof HTMLElement && session.activeElement.isConnected) {
          session.activeElement.focus({ preventScroll: true });
        }
      }
    } finally {
      if (escapeKeyHandler) {
        window.removeEventListener("keydown", escapeKeyHandler, true);
        escapeKeyHandler = null;
      }
      statusHost?.remove();
      statusHost = null;
      statusCard = null;
      statusTitle = null;
      statusDetail = null;
      statusBar = null;
      statusTrack = null;
      statusCancel = null;
      removeHighlight();
    }

    if (!silent && message) showToast(message, outcome === "error");
    return { restored: true };
  }

  async function handleMessage(message) {
    switch (message?.type) {
      case "SALVA_SITE_PING":
        return { ok: true };
      case "SALVA_SITE_ANALYZE":
        return analyzeCurrentDocument();
      case "SALVA_SITE_HIGHLIGHT":
        highlightCandidate(message.candidateId);
        return { ok: true };
      case "SALVA_SITE_HIGHLIGHT_EMBED":
        highlightEmbed({ embedId: message.embedId, embedIndex: message.embedIndex });
        return { ok: true };
      case "SALVA_SITE_POSITION_EMBED":
        return positionEmbed({ embedId: message.embedId, embedIndex: message.embedIndex });
      case "SALVA_SITE_PREPARE":
        return prepareCapture(message.settings || {});
      case "SALVA_SITE_BEGIN_TARGET":
        return beginTarget(message.targetId);
      case "SALVA_SITE_NEXT_STEP":
        return nextCaptureStep();
      case "SALVA_SITE_STATUS":
        updateStatus(message.title, message.detail, message.progress);
        return { ok: true };
      case "SALVA_SITE_HIDE_STATUS":
        setStatusCardVisible(false);
        return { ok: true };
      case "SALVA_SITE_SHOW_STATUS":
        setStatusCardVisible(true);
        return { ok: true };
      case "SALVA_SITE_FINISH":
        return restoreCapture(message);
      default:
        return undefined;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message?.type?.startsWith("SALVA_SITE_")) return undefined;
    Promise.resolve(handleMessage(message)).then(
      (response) => sendResponse(response),
      (error) => sendResponse({ error: error?.message || String(error) })
    );
    return true;
  });
})();
