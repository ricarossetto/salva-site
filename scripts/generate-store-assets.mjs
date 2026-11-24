import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { PNG } from "pngjs";

const execFileAsync = promisify(execFile);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const distDir = path.join(rootDir, "dist");
const scenesDir = path.join(rootDir, "tmp", "store-scenes");
const uiCheckDir = path.join(rootDir, "tmp", "ui-check");
const assetsDir = path.join(rootDir, "store", "assets");

const browserCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
  "C:\\Program Files (x86)\\BraveSoftware\\Brave-Browser\\Application\\brave.exe"
];

async function findBrowser() {
  for (const candidate of browserCandidates) {
    try {
      await readFile(candidate);
      return candidate;
    } catch {}
  }
  throw new Error("No Chromium-based browser executable found for rendering store assets.");
}

function roundedRectangleContains(x, y, left, top, right, bottom, radius) {
  const centerX = Math.min(Math.max(x, left + radius), right - radius);
  const centerY = Math.min(Math.max(y, top + radius), bottom - radius);
  const dx = x - centerX;
  const dy = y - centerY;
  return dx * dx + dy * dy <= radius * radius;
}

function generateStoreIcon128() {
  const size = 128;
  const supersampling = 4;
  const highSize = size * supersampling;
  const high = new Uint8Array(highSize * highSize * 4);
  // 96x96 icon centered inside 128x128 canvas (16px transparent margin per CWS guide)
  const margin = highSize * 0.125;
  const inner = highSize - margin * 2;
  const radius = inner * 0.23;
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
        margin,
        margin,
        highSize - margin,
        highSize - margin,
        radius
      )) continue;

      const gradient = (y - margin) / inner;
      high[index] = Math.round(24 + 10 * gradient);
      high[index + 1] = Math.round(68 + 20 * gradient);
      high[index + 2] = Math.round(189 + 35 * gradient);
      high[index + 3] = 255;

      for (const line of lines) {
        const lineLeft = margin + inner * 0.23;
        const lineTop = margin + inner * line.y;
        const lineHeight = inner * 0.08;
        if (roundedRectangleContains(
          x + 0.5,
          y + 0.5,
          lineLeft,
          lineTop,
          lineLeft + inner * line.width,
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
      for (let sy = 0; sy < supersampling; sy += 1) {
        for (let sx = 0; sx < supersampling; sx += 1) {
          const srcIdx = (((y * supersampling + sy) * highSize) + (x * supersampling + sx)) * 4;
          for (let c = 0; c < 4; c += 1) totals[c] += high[srcIdx + c];
        }
      }
      const dstIdx = (y * size + x) * 4;
      for (let c = 0; c < 4; c += 1) {
        png.data[dstIdx + c] = Math.round(totals[c] / (supersampling * supersampling));
      }
    }
  }
  return PNG.sync.write(png);
}

function brandMarkSvg(size = 38, framed = false) {
  const stroke = framed ? ' stroke="rgba(255,255,255,0.28)" stroke-width="2"' : "";
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg-${size}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#1844BD"/>
          <stop offset="100%" stop-color="#2258E0"/>
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="116" height="116" rx="28" fill="url(#bg-${size})"${stroke}/>
      <rect x="29" y="39" width="69" height="10" rx="5" fill="#ffffff"/>
      <rect x="29" y="59" width="54" height="10" rx="5" fill="#ffffff"/>
      <rect x="29" y="79" width="38" height="10" rx="5" fill="#ffffff"/>
    </svg>
  `;
}

function checkSvg() {
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5.5 12.5 4 4 9-9.5"/></svg>`;
}

function baseSceneCss(width, height) {
  return `
    :root {
      color-scheme: light;
      font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      padding: 0;
      overflow: hidden;
      background: #F5F3EE;
      color: #16151B;
    }
  `;
}

function buildScreenshot1Html(lang) {
  const isPt = lang === "pt";
  const copy = isPt
    ? {
        headline: "Capture páginas inteiras, painéis roláveis e formulários preenchidos",
        badge: "100% Local • Sem Nuvem",
        tabTitle: "portal.exemplo.gov.br/avaliacao/ficha-tecnica",
        formHeader: "Ficha de Avaliação Técnica — Protocolo #2026-481",
        formSub: "Formulário web com painel interno rolável e documento incorporado",
        innerLabel: "Histórico de atendimento",
        field1Label: "Solicitante",
        field1Val: "Ana Paula Mendes",
        field2Label: "Situação",
        field2Val: "Aprovado para revisão final",
        field3Label: "Notas do parecer",
        field3Val: "Documentação conferida integralmente. Área rolável preservada na captura.",
        embedLabel: "Anexo técnico incorporado",
        embedVal: "Anexo B — Parecer complementar carregado em frame separado.",
        popupTagline: "PDF fiel ao que está preenchido",
        mainTitle: "Página principal",
        mainDesc: "Captura a rolagem externa de cima até embaixo",
        innerHeading: "Rolagens internas",
        innerSummary: "2 de 2 áreas selecionadas",
        uncheck: "Desmarcar",
        area1Title: "Histórico de atendimento",
        area1Meta: "640 × 198 px visíveis",
        area1Parts: "≈ 3 trechos",
        area2Title: "Anexo técnico incorporado",
        area2Meta: "640 × 140 px visíveis",
        area2Parts: "≈ 2 trechos",
        optionsTitle: "Qualidade e texto pesquisável",
        searchTitle: "Texto pesquisável inteligente",
        searchDesc: "Usa o texto do site e inclui os valores dos campos",
        cta: "Salvar como PDF",
        foot: "Mantenha esta aba visível durante a captura.<br>Nada será enviado para a internet.",
        pill1: "Preserva campos preenchidos",
        pill2: "Restaura rolagem e foco",
        pill3: "Zero envio para servidores"
      }
    : {
        headline: "Capture full pages, inner scrollbars & filled forms into local PDF",
        badge: "100% Local • No Cloud",
        tabTitle: "portal.example.org/forms/technical-review",
        formHeader: "Technical Review Form — Record #2026-481",
        formSub: "Web portal with scrollable inner panel and embedded document",
        innerLabel: "Case review notes",
        field1Label: "Applicant",
        field1Val: "Hannah Claire Brooks",
        field2Label: "Status",
        field2Val: "Approved for final review",
        field3Label: "Reviewer comments",
        field3Val: "All supporting records verified. Inner scrollable text stays intact in the PDF.",
        embedLabel: "Embedded supplemental form",
        embedVal: "Attachment B — Supplemental sheet inside a cross-origin frame.",
        popupTagline: "Faithful PDF of what is filled in",
        mainTitle: "Main page",
        mainDesc: "Captures outer scroll from top to bottom",
        innerHeading: "Inner scroll areas",
        innerSummary: "2 of 2 areas selected",
        uncheck: "Uncheck",
        area1Title: "Case review notes",
        area1Meta: "640 × 198 px visible",
        area1Parts: "≈ 3 parts",
        area2Title: "Embedded supplemental form",
        area2Meta: "640 × 140 px visible",
        area2Parts: "≈ 2 parts",
        optionsTitle: "Quality and searchable text",
        searchTitle: "Smart searchable text",
        searchDesc: "Uses page text and includes filled field values",
        cta: "Save as PDF",
        foot: "Keep this tab visible during capture.<br>Nothing is sent to the internet.",
        pill1: "Preserves filled form fields",
        pill2: "Restores scroll & focus",
        pill3: "Zero external requests"
      };

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${baseSceneCss(1280, 800)}
  body {
    background: #F5F3EE;
    padding: 36px 48px 32px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .headline {
    font-size: 26px;
    font-weight: 750;
    letter-spacing: -0.025em;
    color: #16151B;
    margin: 0;
  }
  .badge {
    flex-shrink: 0;
    padding: 8px 14px;
    border-radius: 999px;
    background: #FFFFFF;
    border: 1px solid rgba(22, 21, 27, 0.14);
    color: #1D4ED8;
    font-size: 13px;
    font-weight: 700;
  }
  .stage {
    display: grid;
    grid-template-columns: 764px 392px;
    gap: 28px;
    align-items: start;
    margin: auto 0;
  }
  .browser {
    background: #FFFFFF;
    border: 1px solid rgba(22, 21, 27, 0.12);
    border-radius: 16px;
    box-shadow: 0 18px 40px -24px rgba(22, 21, 27, 0.22);
    overflow: hidden;
  }
  .browser__bar {
    height: 44px;
    background: #ECEAE3;
    border-bottom: 1px solid rgba(22, 21, 27, 0.10);
    padding: 0 16px;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .dots { display: flex; gap: 7px; }
  .dots span { width: 10px; height: 10px; border-radius: 50%; }
  .dots span:nth-child(1) { background: #E56B6F; }
  .dots span:nth-child(2) { background: #E9B44C; }
  .dots span:nth-child(3) { background: #52B788; }
  .urlbar {
    flex: 1;
    height: 28px;
    border-radius: 8px;
    background: #FFFFFF;
    border: 1px solid rgba(22, 21, 27, 0.10);
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 12px;
    color: #4B4954;
  }
  .page {
    padding: 20px 24px 24px;
    background: #FAF9F6;
    display: grid;
    gap: 14px;
  }
  .page__hero {
    padding: 16px 20px;
    border-radius: 12px;
    background: #162447;
    color: #FFFFFF;
  }
  .page__hero h2 { margin: 0; font-size: 17px; font-weight: 700; }
  .page__hero p { margin: 4px 0 0; font-size: 12px; color: #D4E0F5; }
  .highlight-box {
    padding: 16px;
    border-radius: 12px;
    background: #FFFFFF;
    border: 2px solid #1D4ED8;
  }
  .highlight-box--embed {
    border-color: #6D28D9;
  }
  .box-tag {
    display: inline-block;
    margin-bottom: 10px;
    padding: 4px 10px;
    border-radius: 6px;
    background: #E8EEFC;
    color: #1E40AF;
    font-size: 11px;
    font-weight: 700;
  }
  .box-tag--embed {
    background: #EFE9FE;
    color: #5B21B6;
  }
  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 14px;
  }
  .field label {
    display: block;
    font-size: 11px;
    color: #4B4954;
    margin-bottom: 4px;
    font-weight: 600;
  }
  .field .input {
    padding: 8px 10px;
    border: 1px solid rgba(22, 21, 27, 0.14);
    border-radius: 8px;
    background: #FAF9F6;
    font-size: 12.5px;
    color: #16151B;
    font-weight: 500;
  }
  .field--full { grid-column: 1 / -1; }
  .embed-text {
    margin: 0;
    font-size: 12.5px;
    color: #4B4954;
    line-height: 1.45;
  }
  .popup {
    width: 392px;
    padding: 16px;
    border-radius: 16px;
    border: 1px solid rgba(22, 21, 27, 0.14);
    background: #F5F3EE;
    box-shadow: 0 22px 48px -20px rgba(22, 21, 27, 0.22);
    display: grid;
    gap: 12px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .brand h3 { margin: 0; font-size: 16px; font-weight: 700; letter-spacing: -0.02em; }
  .brand p { margin: 2px 0 0; color: #4B4954; font-size: 12px; }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }
  .choice--primary {
    padding: 12px;
    border: 1px solid rgba(22, 21, 27, 0.10);
    border-radius: 12px;
    background: #FFFFFF;
  }
  .chk {
    width: 20px;
    height: 20px;
    margin-top: 1px;
    border-radius: 6px;
    background: #1D4ED8;
    color: #FFFFFF;
    display: grid;
    place-items: center;
    flex-shrink: 0;
  }
  .choice strong { display: block; font-size: 13px; font-weight: 600; }
  .choice small { display: block; margin-top: 2px; color: #4B4954; font-size: 11.5px; }
  .sec-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding-top: 4px;
  }
  .sec-head h4 { margin: 0; font-size: 13px; font-weight: 650; }
  .sec-head p { margin: 2px 0 0; color: #4B4954; font-size: 11.5px; font-variant-numeric: tabular-nums; }
  .sec-head span { color: #1D4ED8; font-size: 11.5px; font-weight: 600; }
  .areas { display: grid; gap: 8px; }
  .area {
    display: flex;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border: 1px solid rgba(22, 21, 27, 0.12);
    border-radius: 12px;
    background: #FFFFFF;
  }
  .area__text { flex: 1; min-width: 0; }
  .area__text strong { display: block; font-size: 12.5px; font-weight: 600; }
  .area__text small { display: block; margin-top: 2px; color: #4B4954; font-size: 11px; font-variant-numeric: tabular-nums; }
  .area__pages { color: #4B4954; font-size: 11px; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .opts {
    border-radius: 12px;
    background: #FFFFFF;
    border: 1px solid rgba(22, 21, 27, 0.10);
    padding: 12px;
    display: grid;
    gap: 10px;
  }
  .opts__head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12.5px;
    font-weight: 600;
  }
  .opts__pm {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #16151B;
    color: #FFFFFF;
    display: grid;
    place-items: center;
    font-size: 13px;
    font-weight: 700;
    line-height: 1;
  }
  .opts__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .opts__row strong { display: block; font-size: 12.5px; font-weight: 600; }
  .opts__row small { display: block; margin-top: 2px; color: #4B4954; font-size: 11px; }
  .sw {
    width: 40px;
    height: 24px;
    border-radius: 999px;
    background: #1D4ED8;
    position: relative;
    flex-shrink: 0;
  }
  .sw::after {
    content: "";
    position: absolute;
    right: 3px;
    top: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: #FFFFFF;
  }
  .btn {
    height: 44px;
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 16px;
    border-radius: 12px;
    color: #FFFFFF;
    background: #1D4ED8;
    font-weight: 650;
    font-size: 13.5px;
  }
  .foot {
    margin: 0;
    color: #4B4954;
    font-size: 10.5px;
    line-height: 1.4;
    text-align: center;
  }
  .pills {
    display: flex;
    gap: 12px;
    align-items: center;
  }
  .pill {
    padding: 8px 14px;
    border-radius: 10px;
    background: #FFFFFF;
    border: 1px solid rgba(22, 21, 27, 0.12);
    font-size: 12.5px;
    font-weight: 600;
    color: #16151B;
  }
</style>
</head>
<body>
  <header class="topbar">
    <h1 class="headline">${copy.headline}</h1>
    <span class="badge">${copy.badge}</span>
  </header>

  <main class="stage">
    <section class="browser">
      <div class="browser__bar">
        <div class="dots"><span></span><span></span><span></span></div>
        <div class="urlbar">${copy.tabTitle}</div>
      </div>
      <div class="page">
        <div class="page__hero">
          <h2>${copy.formHeader}</h2>
          <p>${copy.formSub}</p>
        </div>

        <div class="highlight-box">
          <span class="box-tag">${copy.innerLabel}</span>
          <div class="form-grid">
            <div class="field">
              <label>${copy.field1Label}</label>
              <div class="input">${copy.field1Val}</div>
            </div>
            <div class="field">
              <label>${copy.field2Label}</label>
              <div class="input">${copy.field2Val}</div>
            </div>
            <div class="field field--full">
              <label>${copy.field3Label}</label>
              <div class="input">${copy.field3Val}</div>
            </div>
          </div>
        </div>

        <div class="highlight-box highlight-box--embed">
          <span class="box-tag box-tag--embed">${copy.embedLabel}</span>
          <p class="embed-text">${copy.embedVal}</p>
        </div>
      </div>
    </section>

    <aside class="popup">
      <div class="brand">
        ${brandMarkSvg(36)}
        <div>
          <h3>Salva Site</h3>
          <p>${copy.popupTagline}</p>
        </div>
      </div>

      <div class="choice choice--primary">
        <span class="chk">${checkSvg()}</span>
        <span>
          <strong>${copy.mainTitle}</strong>
          <small>${copy.mainDesc}</small>
        </span>
      </div>

      <div class="sec-head">
        <div>
          <h4>${copy.innerHeading}</h4>
          <p>${copy.innerSummary}</p>
        </div>
        <span>${copy.uncheck}</span>
      </div>

      <div class="areas">
        <div class="area">
          <span class="chk">${checkSvg()}</span>
          <span class="area__text">
            <strong>${copy.area1Title}</strong>
            <small>${copy.area1Meta}</small>
          </span>
          <span class="area__pages">${copy.area1Parts}</span>
        </div>
        <div class="area">
          <span class="chk">${checkSvg()}</span>
          <span class="area__text">
            <strong>${copy.area2Title}</strong>
            <small>${copy.area2Meta}</small>
          </span>
          <span class="area__pages">${copy.area2Parts}</span>
        </div>
      </div>

      <div class="opts">
        <div class="opts__head">
          <span>${copy.optionsTitle}</span>
          <span class="opts__pm">−</span>
        </div>
        <div class="opts__row">
          <div>
            <strong>${copy.searchTitle}</strong>
            <small>${copy.searchDesc}</small>
          </div>
          <span class="sw"></span>
        </div>
      </div>

      <div class="btn">
        <span>${copy.cta}</span>
        <span>→</span>
      </div>
      <p class="foot">${copy.foot}</p>
    </aside>
  </main>

  <footer class="pills">
    <span class="pill">✓ ${copy.pill1}</span>
    <span class="pill">✓ ${copy.pill2}</span>
    <span class="pill">✓ ${copy.pill3}</span>
  </footer>
</body>
</html>`;
}

function buildScreenshot2Html(lang) {
  const isPt = lang === "pt";
  const copy = isPt
    ? {
        headline: "PDFs pesquisáveis gerados inteiramente no seu computador",
        badge: "Código Aberto • MIT",
        heading: "Seu PDF está pronto",
        desc: "A janela para escolher onde salvar será aberta automaticamente.",
        fileLabel: "Arquivo",
        fileVal: "Ficha de Avaliação Técnica - 2026-11-24.pdf",
        contentLabel: "Conteúdo",
        contentVal: "7 páginas • 1.8 MB",
        btnSave: "Salvar PDF",
        btnClose: "Fechar esta aba",
        privacy: "O arquivo foi montado no seu computador.<br>Nenhum conteúdo foi enviado para um servidor.",
        cards: [
          {
            title: "Texto pesquisável + campos",
            body: "Incorpora o texto do DOM e os valores preenchidos em inputs, selects e textareas. Senhas ficam ocultas."
          },
          {
            title: "OCR local offline (PT + EN)",
            body: "Tesseract.js empacotado localmente para reconhecer imagens e gráficos sem internet."
          },
          {
            title: "Frames externos em 1 clique",
            body: "Solicita permissão por origem apenas quando um formulário incorporado externo é detectado."
          },
          {
            title: "Privacidade por design (MV3)",
            body: "Zero código remoto, zero telemetria e limpeza automática de dados temporários."
          }
        ]
      }
    : {
        headline: "Searchable PDFs built entirely on your machine",
        badge: "Open Source • MIT",
        heading: "Your PDF is ready",
        desc: "The save dialog will open automatically.",
        fileLabel: "File",
        fileVal: "Technical Review Form - 2026-11-24.pdf",
        contentLabel: "Content",
        contentVal: "7 pages • 1.8 MB",
        btnSave: "Save PDF",
        btnClose: "Close this tab",
        privacy: "The file was built on your computer. No content was sent to any server.",
        cards: [
          {
            title: "Searchable text + field values",
            body: "Embeds DOM text plus filled inputs, selects, and textareas into a searchable layer. Passwords stay masked."
          },
          {
            title: "Offline local OCR (EN + PT)",
            body: "Bundled Tesseract.js WebAssembly recognizes text inside images and canvas elements locally."
          },
          {
            title: "1-click cross-origin embeds",
            body: "Requests per-origin permission only when a cross-origin embedded form needs scrolling."
          },
          {
            title: "Private by design (MV3)",
            body: "Zero remote code, zero analytics, and automatic cleanup of temporary browser storage."
          }
        ]
      };

  const cardsHtml = copy.cards
    .map(
      (card) => `
      <div class="feature-card">
        <h3>${card.title}</h3>
        <p>${card.body}</p>
      </div>`
    )
    .join("");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${baseSceneCss(1280, 800)}
  body {
    background: #F5F3EE;
    padding: 36px 48px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .headline {
    margin: 0;
    font-size: 27px;
    font-weight: 750;
    letter-spacing: -0.025em;
    color: #16151B;
  }
  .badge {
    padding: 8px 14px;
    border-radius: 999px;
    background: #FFFFFF;
    border: 1px solid rgba(22, 21, 27, 0.14);
    color: #1D4ED8;
    font-size: 13px;
    font-weight: 700;
  }
  .grid {
    display: grid;
    grid-template-columns: 520px 1fr;
    gap: 36px;
    align-items: center;
    margin: auto 0;
  }
  .result-card {
    padding: 32px;
    border-radius: 16px;
    background: #FFFFFF;
    box-shadow: 0 0 0 1px rgba(22, 21, 27, 0.10), 0 18px 40px -24px rgba(22, 21, 27, 0.22);
  }
  .icon {
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    margin-bottom: 16px;
    border-radius: 12px;
    color: #FFFFFF;
    background: #0F766E;
  }
  .result-card h2 {
    margin: 0;
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.025em;
  }
  .description {
    margin: 8px 0 0;
    color: #4B4954;
    line-height: 1.5;
    font-size: 14px;
  }
  .file-info {
    display: grid;
    gap: 12px;
    margin-top: 20px;
    padding: 16px;
    border: 1px solid rgba(22, 21, 27, 0.10);
    border-radius: 12px;
    background: #ECEAE3;
  }
  .file-info small {
    display: block;
    color: #5C5966;
    font-size: 11px;
    font-weight: 600;
  }
  .file-info strong {
    display: block;
    margin-top: 2px;
    font-size: 13px;
    font-weight: 600;
    color: #16151B;
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }
  .btn-primary, .btn-secondary {
    height: 44px;
    padding: 0 18px;
    border-radius: 12px;
    font-weight: 650;
    font-size: 13.5px;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .btn-primary {
    min-width: 190px;
    justify-content: center;
    color: #FFFFFF;
    background: #1D4ED8;
  }
  .btn-secondary {
    border: 1px solid rgba(22, 21, 27, 0.18);
    color: #16151B;
    background: #FFFFFF;
  }
  .privacy {
    margin: 20px 0 0;
    color: #5C5966;
    font-size: 12px;
    line-height: 1.5;
  }
  .features {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .feature-card {
    padding: 22px;
    border-radius: 14px;
    background: #FFFFFF;
    border: 1px solid rgba(22, 21, 27, 0.10);
  }
  .feature-card h3 {
    margin: 0 0 8px;
    font-size: 15.5px;
    font-weight: 700;
    color: #16151B;
  }
  .feature-card p {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: #4B4954;
  }
</style>
</head>
<body>
  <header class="topbar">
    <h1 class="headline">${copy.headline}</h1>
    <span class="badge">${copy.badge}</span>
  </header>

  <main class="grid">
    <section class="result-card">
      <div class="icon">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5 9.5 17 19 7.5"/></svg>
      </div>
      <h2>${copy.heading}</h2>
      <p class="description">${copy.desc}</p>
      <div class="file-info">
        <div>
          <small>${copy.fileLabel}</small>
          <strong>${copy.fileVal}</strong>
        </div>
        <div>
          <small>${copy.contentLabel}</small>
          <strong>${copy.contentVal}</strong>
        </div>
      </div>
      <div class="actions">
        <div class="btn-primary">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4.5v11M7 11l5 5 5-5"/><path d="M5 19.5h14"/></svg>
          <span>${copy.btnSave}</span>
        </div>
        <div class="btn-secondary">${copy.btnClose}</div>
      </div>
      <p class="privacy">${copy.privacy}</p>
    </section>

    <section class="features">
      ${cardsHtml}
    </section>
  </main>
  <div></div>
</body>
</html>`;
}

function buildPromoSmallHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${baseSceneCss(440, 280)}
  body {
    background: linear-gradient(140deg, #0D1B3E 0%, #163A8A 60%, #1D4ED8 100%);
    color: #FFFFFF;
    padding: 26px 28px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .top {
    display: grid;
    gap: 12px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .head h1 {
    margin: 0;
    font-size: 30px;
    font-weight: 800;
    letter-spacing: -0.025em;
  }
  .sub {
    margin: 0;
    font-size: 16px;
    line-height: 1.4;
    color: #E7F0FF;
    font-weight: 500;
    max-width: 375px;
  }
  .chips {
    margin-top: auto;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .chip {
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(6, 18, 44, 0.44);
    border: 1px solid rgba(255, 255, 255, 0.34);
    font-size: 11.5px;
    font-weight: 700;
    color: #FFFFFF;
  }
</style>
</head>
<body>
  <div class="top">
    <div class="head">
      ${brandMarkSvg(52, true)}
      <h1>Salva Site</h1>
    </div>
    <p class="sub">Scrollable web pages &amp; filled forms saved to searchable local PDFs.</p>
  </div>
  <div class="chips">
    <span class="chip">100% Local</span>
    <span class="chip">Offline OCR</span>
    <span class="chip">EN + PT-BR</span>
  </div>
</body>
</html>`;
}

function buildPromoMarqueeHtml() {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  ${baseSceneCss(1400, 560)}
  body {
    background: linear-gradient(135deg, #0D1B3E 0%, #153782 55%, #1D4ED8 100%);
    color: #FFFFFF;
    padding: 58px 72px;
    display: grid;
    grid-template-columns: 1.15fr 0.85fr;
    gap: 54px;
    align-items: center;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 18px;
    margin-bottom: 22px;
  }
  .brand h1 {
    margin: 0;
    font-size: 52px;
    font-weight: 800;
    letter-spacing: -0.03em;
  }
  .lead {
    margin: 0 0 28px;
    font-size: 24px;
    line-height: 1.4;
    color: #E7F0FF;
    max-width: 660px;
  }
  .chips {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
  }
  .chip {
    padding: 10px 16px;
    border-radius: 999px;
    background: rgba(6, 18, 44, 0.44);
    border: 1px solid rgba(255, 255, 255, 0.34);
    font-size: 14px;
    font-weight: 700;
  }
  .mock-stack {
    position: relative;
    height: 410px;
  }
  .card {
    position: absolute;
    left: 0;
    top: 18px;
    width: 390px;
    padding: 20px;
    border-radius: 16px;
    background: #F5F3EE;
    color: #16151B;
    box-shadow: 0 26px 65px rgba(4, 15, 38, 0.45);
  }
  .card h2 { margin: 0 0 12px; font-size: 16px; font-weight: 700; }
  .item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 11px 12px;
    margin-bottom: 8px;
    border-radius: 11px;
    background: #FFFFFF;
    border: 1px solid rgba(22, 21, 27, 0.10);
    font-size: 13px;
    font-weight: 600;
  }
  .item span { color: #1D4ED8; font-size: 12px; font-weight: 600; }
  .cta {
    margin-top: 12px;
    height: 44px;
    padding: 0 16px;
    border-radius: 11px;
    background: #1D4ED8;
    color: #FFFFFF;
    font-size: 13.5px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .pdf-badge {
    position: absolute;
    right: 0;
    bottom: 12px;
    width: 268px;
    padding: 16px 20px;
    border-radius: 14px;
    background: #FFFFFF;
    color: #16151B;
    box-shadow: 0 20px 50px rgba(4, 15, 38, 0.42);
    border: 1px solid rgba(22, 21, 27, 0.12);
  }
  .pdf-badge strong { display: block; font-size: 15px; color: #0F766E; }
  .pdf-badge span { display: block; margin-top: 4px; font-size: 12px; color: #4B4954; }
</style>
</head>
<body>
  <section>
    <div class="brand">
      ${brandMarkSvg(68, true)}
      <h1>Salva Site</h1>
    </div>
    <p class="lead">Capture full pages, inner scrollbars, and filled forms into searchable local PDFs — with optional offline OCR.</p>
    <div class="chips">
      <span class="chip">✓ Zero Cloud Upload</span>
      <span class="chip">✓ Offline OCR (EN + PT)</span>
      <span class="chip">✓ Open Source MIT</span>
    </div>
  </section>

  <section class="mock-stack">
    <div class="card">
      <h2>Detected Scroll Areas</h2>
      <div class="item">Main page<span>Full scroll</span></div>
      <div class="item">Inner review panel<span>3 parts</span></div>
      <div class="item">Embedded form<span>2 parts</span></div>
      <div class="cta"><span>Save as PDF</span><span>→</span></div>
    </div>
    <div class="pdf-badge">
      <strong>✓ Searchable PDF ready</strong>
      <span>7 pages • 100% built locally</span>
    </div>
  </section>
</body>
</html>`;
}

async function renderScene(browserPath, htmlPath, outPath, width, height, userDataDir, options = {}) {
  const { stripAlpha = true, query = "", virtualTimeBudget = 0 } = options;
  const rawOut = path.join(userDataDir, "raw.png");
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    `--user-data-dir=${userDataDir}`,
    `--window-size=${width},${height}`,
    ...(virtualTimeBudget > 0 ? [`--virtual-time-budget=${virtualTimeBudget}`] : []),
    `--screenshot=${rawOut}`,
    `${pathToFileURL(htmlPath).href}${query}`
  ];
  await execFileAsync(browserPath, args, { timeout: 30000 });

  const decoded = PNG.sync.read(await readFile(rawOut));
  if (decoded.width !== width || decoded.height !== height) {
    throw new Error(`Unexpected rendered size for ${path.basename(outPath)}: ${decoded.width}x${decoded.height} (expected ${width}x${height}).`);
  }

  if (stripAlpha) {
    const rgbPng = new PNG({ width, height, colorType: 2 });
    decoded.data.copy(rgbPng.data);
    const rgbBuffer = PNG.sync.write(rgbPng, {
      colorType: 2,
      bgColor: { red: 255, green: 255, blue: 255 }
    });
    await writeFile(outPath, rgbBuffer);
    const ihdrWidth = rgbBuffer.readUInt32BE(16);
    const ihdrHeight = rgbBuffer.readUInt32BE(20);
    const bitDepth = rgbBuffer[24];
    const colorType = rgbBuffer[25];
    if (ihdrWidth !== width || ihdrHeight !== height || bitDepth !== 8 || colorType !== 2) {
      throw new Error(`Invalid PNG format for ${outPath}: ${ihdrWidth}x${ihdrHeight} depth=${bitDepth} colorType=${colorType}`);
    }
    console.log(`Generated ${path.relative(rootDir, outPath)} (${ihdrWidth}x${ihdrHeight}, 24-bit RGB colorType=${colorType})`);
  } else {
    await writeFile(outPath, await readFile(rawOut));
    console.log(`Generated preview ${path.relative(rootDir, outPath)} (${width}x${height})`);
  }
  await rm(rawOut, { force: true });
}

async function createRealUiPreviews(browserPath, tempUserData) {
  await mkdir(uiCheckDir, { recursive: true });
  const enMessages = JSON.parse(await readFile(path.join(distDir, "_locales", "en", "messages.json"), "utf8"));
  const popupHtml = await readFile(path.join(distDir, "popup.html"), "utf8");
  const resultHtml = await readFile(path.join(distDir, "result.html"), "utf8");

  const buildChromeMock = (mode) => `
    <script>
      window.__MESSAGES__ = ${JSON.stringify(enMessages)};
      window.chrome = {
        i18n: {
          getUILanguage: () => "en",
          getMessage: (key, subs) => {
            let msg = window.__MESSAGES__[key]?.message || "";
            if (!msg) return "";
            const list = Array.isArray(subs) ? subs : (subs !== undefined ? [subs] : []);
            list.forEach((val, idx) => { msg = msg.replaceAll("$" + (idx + 1), String(val)); });
            return msg;
          }
        },
        storage: {
          local: {
            get: async (defaults) => ({ ...defaults }),
            set: async () => {}
          }
        },
        permissions: {
          contains: async ({ origins }) => false,
          request: async () => true
        },
        downloads: {
          download: async () => 1
        },
        webNavigation: {
          getAllFrames: async () => [
            { frameId: 0, url: "https://portal.example.org/review" },
            { frameId: 12, url: "https://forms.example.org/embedded-sheet" }
          ]
        },
        tabs: {
          query: async () => [{ id: 1, url: "https://portal.example.org/review" }],
          sendMessage: async (_tabId, msg) => {
            if (msg.type === "SALVA_SITE_PING") return { ok: true };
            if (msg.type === "SALVA_SITE_ANALYZE") {
              return {
                candidates: [
                  { id: "area-1", label: "Case review notes", clientWidth: 640, clientHeight: 198, scrollHeight: 580, estimatedParts: 3 },
                  { id: "area-2", label: "Reviewer comments", clientWidth: 640, clientHeight: 140, scrollHeight: 320, estimatedParts: 2 }
                ],
                embeds: [
                  { id: "embed-0", index: 0, origin: "https://forms.example.org", rect: { width: 640, height: 320 } }
                ]
              };
            }
            return { ok: true };
          }
        },
        runtime: {
          sendMessage: async () => ({ started: true })
        }
      };
      document.documentElement.dataset.theme = "${mode}";
    </script>
  `;

  const dbMockScript = `
    <script>
      window.SalvaSiteDB = {
        get: async () => ({
          id: "demo",
          filename: "Technical Review Form - 2026-11-24.pdf",
          pageCount: 7,
          blob: new Blob([new Uint8Array(1024 * 1850)], { type: "application/pdf" }),
          warnings: ["OCR skipped one section."]
        })
      };
    </script>
  `;

  const distBaseHref = pathToFileURL(distDir + path.sep).href;
  const popupLightHtml = popupHtml
    .replace("<head>", `<head><base href="${distBaseHref}">`)
    .replace('<script src="i18n.js"></script>', `${buildChromeMock("light")}<script src="i18n.js"></script>`);
  const popupDarkOpenHtml = popupHtml
    .replace("<head>", `<head><base href="${distBaseHref}">`)
    .replace('<script src="i18n.js"></script>', `${buildChromeMock("dark")}<script src="i18n.js"></script>`)
    .replace(
      "</body>",
      `<script>
        (() => {
          const content = document.querySelector("#content");
          const openUi = () => {
            if (!content || content.hidden) return false;
            document.querySelector("#options-toggle")?.click();
            setTimeout(() => { document.querySelector("#quality-btn")?.click(); }, 340);
            return true;
          };
          if (!openUi()) {
            const obs = new MutationObserver(() => {
              if (openUi()) obs.disconnect();
            });
            obs.observe(content, { attributes: true, attributeFilter: ["hidden"] });
          }
        })();
      </script></body>`
    );

  const resultWithId = (theme) => resultHtml
    .replace("<head>", `<head><base href="${distBaseHref}">`)
    .replace('<script src="i18n.js"></script>', `${buildChromeMock(theme)}<script src="i18n.js"></script>`)
    .replace('<script src="result.js"></script>', `${dbMockScript}<script src="result.js"></script>`);

  const previewJobs = [
    { name: "popup-light-375.png", width: 375, height: 640, html: popupLightHtml, query: "", virtualTimeBudget: 400 },
    { name: "popup-dark-open-390.png", width: 390, height: 820, html: popupDarkOpenHtml, query: "", virtualTimeBudget: 1200 },
    { name: "result-light-800.png", width: 800, height: 620, html: resultWithId("light"), query: "?id=demo", virtualTimeBudget: 2600 },
    { name: "result-dark-800.png", width: 800, height: 620, html: resultWithId("dark"), query: "?id=demo", virtualTimeBudget: 800 }
  ];

  for (const job of previewJobs) {
    const htmlPath = path.join(uiCheckDir, `${job.name}.html`);
    const outPath = path.join(uiCheckDir, job.name);
    await writeFile(htmlPath, job.html, "utf8");
    await renderScene(browserPath, htmlPath, outPath, job.width, job.height, tempUserData, {
      stripAlpha: false,
      query: job.query,
      virtualTimeBudget: job.virtualTimeBudget
    });
  }
}

const browserPath = await findBrowser();
await mkdir(scenesDir, { recursive: true });
await mkdir(assetsDir, { recursive: true });

const tempUserData = await mkdtemp(path.join(os.tmpdir(), "salva-site-assets-"));
try {
  const jobs = [
    { name: "screenshot-1-popup-en.png", width: 1280, height: 800, html: buildScreenshot1Html("en") },
    { name: "screenshot-2-result-en.png", width: 1280, height: 800, html: buildScreenshot2Html("en") },
    { name: "screenshot-1-popup-pt.png", width: 1280, height: 800, html: buildScreenshot1Html("pt") },
    { name: "screenshot-2-result-pt.png", width: 1280, height: 800, html: buildScreenshot2Html("pt") },
    { name: "promo-small-440x280.png", width: 440, height: 280, html: buildPromoSmallHtml() },
    { name: "promo-marquee-1400x560.png", width: 1400, height: 560, html: buildPromoMarqueeHtml() }
  ];

  for (const job of jobs) {
    const htmlPath = path.join(scenesDir, `${job.name}.html`);
    const outPath = path.join(assetsDir, job.name);
    await writeFile(htmlPath, job.html, "utf8");
    await renderScene(browserPath, htmlPath, outPath, job.width, job.height, tempUserData, { stripAlpha: true });
  }

  const storeIconOut = path.join(assetsDir, "store-icon-128x128.png");
  const iconBuf = generateStoreIcon128();
  await writeFile(storeIconOut, iconBuf);
  console.log(`Generated ${path.relative(rootDir, storeIconOut)} (${iconBuf.readUInt32BE(16)}x${iconBuf.readUInt32BE(20)}, colorType=${iconBuf[25]})`);

  await createRealUiPreviews(browserPath, tempUserData);
} finally {
  await rm(tempUserData, { recursive: true, force: true });
}
