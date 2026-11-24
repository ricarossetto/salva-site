# Chrome Web Store Submission Guide — Salva Site v0.3.2

Ready-to-paste copy and verified paths for the [Chrome Web Store Developer Console](https://chrome.google.com/webstore/devconsole).

---

## 1. Package & Graphic Assets

- **Extension ZIP package:** `release/salva-site-v0.3.2.zip` (`manifest.json` at root, 30 files)
- **Store icon (`128x128` RGBA PNG):** `store/assets/store-icon-128x128.png`
- **Screenshots (`1280x800` 24-bit RGB PNG, no alpha):**
  - English: `store/assets/screenshot-1-popup-en.png`, `store/assets/screenshot-2-result-en.png`
  - Portuguese (Brazil): `store/assets/screenshot-1-popup-pt.png`, `store/assets/screenshot-2-result-pt.png`
- **Small promo tile (`440x280` 24-bit RGB PNG, no alpha):** `store/assets/promo-small-440x280.png`
- **Marquee promo tile (`1400x560` 24-bit RGB PNG, no alpha):** `store/assets/promo-marquee-1400x560.png`

---

## 2. Store Listing Tab

### General Fields
- **Category:** `Productivity` (`Produtividade`)
- **Default Language:** `English` (`en`) + localized listing `Portuguese (Brazil)` (`pt_BR`)
- **Official Website / Homepage URL:** `https://github.com/ricarossetto/salva-site`
- **Support URL:** `https://github.com/ricarossetto/salva-site/issues`
- **Privacy Policy URL:** `https://github.com/ricarossetto/salva-site/blob/main/PRIVACY.md`

### English (`en` — Default Listing)
- **Extension Name:** `Salva Site`
- **Summary (125 / 132 chars):**
  `Capture full pages, scrollable panels, and filled forms into searchable local PDFs — with optional offline OCR. 100% private.`
- **Detailed Description:**
```text
Salva Site captures full web pages, inner scrollable panels, embedded forms, and filled inputs into clean, searchable multi-page PDFs built 100% locally on your computer.

Why Salva Site?
Standard browser Print-to-PDF and regular full-page screenshot extensions often cut off internal scrollbars, clip embedded <embed> or <iframe> forms, or lose unsaved form inputs by forcing a reload. Salva Site captures the live rendered page step-by-step without reloading and restores your original scroll positions and focus when finished.

Key Features
• Main Page + Inner Scroll Areas: Automatically detects scrollable containers (panels, textareas, embedded frames) and highlights them on the page before capture.
• Preserves Filled Form Values: Captures text inputs, selects, textareas, checkboxes, and radio buttons exactly as filled in.
• Smart Searchable Text Layer: Embeds page text and visible field values into an invisible searchable PDF layer using bundled pdf-lib, fontkit, and Noto Sans. Password fields are never added to the text layer and remain visually masked.
• Optional Offline OCR (English & Portuguese): Built-in local Tesseract.js WebAssembly engine can recognize text inside images and <canvas> elements without any internet connection.
• 1-Click Cross-Origin Embed Support: Installs with zero broad host permissions and only requests per-origin access when you click "Allow capture" on an external embedded form.
• Cancel Anytime: In-page progress card includes a Cancel button (or press Esc) to stop capture immediately and restore the page.
• Open Source & Zero Cloud: MIT-licensed, zero remote code, zero analytics, and zero data leaves your computer.

Source code & privacy policy: https://github.com/ricarossetto/salva-site
```

### Portuguese — Brazil (`pt_BR` — Localized Listing)
- **Nome da extensão:** `Salva Site`
- **Resumo (118 / 132 chars):**
  `Salva páginas inteiras, painéis roláveis e formulários preenchidos em PDF pesquisável local, com OCR offline opcional.`
- **Descrição detalhada:**
```text
O Salva Site captura páginas web inteiras, painéis com rolagem interna, formulários incorporados e campos preenchidos em um PDF pesquisável gerado 100% localmente no seu computador.

Por que usar o Salva Site?
A impressão nativa do navegador e extensões comuns de print costumam cortar barras de rolagem internas, truncar formulários dentro de <embed> ou <iframe> e perder dados digitados ao recarregar a página. O Salva Site captura a aba aberta etapa por etapa sem recarregar o site e restaura sua rolagem e o foco originais ao final.

Principais recursos
• Página Principal + Rolagens Internas: Detecta automaticamente painéis roláveis, textareas e frames incorporados, destacando cada área na página antes da captura.
• Preserva Campos Preenchidos: Captura textos digitados, selects, textareas, caixas de marcação e opções exatamente como estão na tela.
• Camada Pesquisável Inteligente: Incorpora o texto do site e os valores preenchidos em uma camada pesquisável usando pdf-lib, fontkit e Noto Sans locais. Campos de senha permanecem mascarados e não entram na camada de texto.
• OCR Local Opcional (Português e Inglês): Motor Tesseract.js em WebAssembly embutido na extensão para reconhecer imagens e <canvas> totalmente offline.
• Formulários Incorporados em 1 Clique: Instala sem permissões amplas de sites e só pede autorização para uma origem externa específica quando você clica em "Permitir captura".
• Cancelamento a Qualquer Momento: Cartão discreto na página mostra o progresso e permite cancelar (ou apertar Esc) restaurando a página intacta.
• Código Aberto e Zero Nuvem: Licença MIT, zero código remoto, zero telemetria e nenhum dado sai do seu computador.

Código-fonte e política de privacidade: https://github.com/ricarossetto/salva-site
```

---

## 3. Privacy Practices Tab

### Single Purpose Description
```text
Captures the active web page, its internal scrollable panels, and authorized embedded frames into a searchable PDF assembled locally on the user's device.
```

### Remote Code
- **Are you using remote code?** `No, I am not using remote code`

### Permission Justifications

- **`activeTab`:**
```text
Used only when the user clicks the extension popup on the active tab to inject the scroll/DOM inspection script and capture visible viewport frames via chrome.tabs.captureVisibleTab to assemble the local PDF.
```

- **`downloads`:**
```text
Used on the local result page to open the browser Save As dialog (chrome.downloads.download) so the user can save the PDF generated locally from an in-memory Blob URL.
```

- **`offscreen`:**
```text
Creates a short-lived local offscreen document (offscreen.html) only when the user enables optional offline visual OCR, allowing bundled Tesseract.js WebAssembly workers to run without opening a visible extra tab.
```

- **`scripting`:**
```text
Injects the local content.js script on demand into the active tab (and into child frames only when already same-origin or explicitly permitted by the user) to analyze scrollable containers, step scroll positions, collect visible text coordinates, and restore original scroll and focus.
```

- **`storage`:**
```text
Stores only the user's local UI preferences (includeMainPage, searchableText, fullOcr, imageQuality) in chrome.storage.local. No browsing history or page content is persisted.
```

- **`webNavigation`:**
```text
Calls chrome.webNavigation.getAllFrames once when opening the popup to discover embedded child frames on the active tab so scrollable embedded forms can be listed or offered for one-click permission.
```

- **`optional_host_permissions` (`https://*/*`, `http://*/*`):**
```text
Not requested at install time. Requested dynamically via chrome.permissions.request strictly for a single specific origin only when the user clicks "Allow capture" next to a detected cross-origin embedded form, allowing content.js to scroll and capture inside that embedded frame.
```

### Data Usage Certifications
- Does this item collect or use user data? **No** — leave all data collection checkboxes **unchecked**.
- Certify all three compliance statements (does not sell data, does not use/transfer data for unrelated purposes, does not use/transfer for creditworthiness/lending) and set **Privacy Policy URL** to:
  `https://github.com/ricarossetto/salva-site/blob/main/PRIVACY.md`
