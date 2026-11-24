# Privacy Policy — Salva Site

*Last updated: 2026-11-24*

## English

**Salva Site** is an open-source Chromium browser extension designed to run **100% locally** on your device.

### 1. Data Collection
**Salva Site does not collect, store on external servers, transmit, sell, or share any personal data, browsing history, page content, screenshots, form entries, or generated PDFs.**

### 2. Local-Only Processing
- When you trigger a capture, screenshots (`chrome.tabs.captureVisibleTab`), DOM text extraction, form value extraction, optional local OCR (`tesseract.js` WebAssembly), and PDF generation (`pdf-lib`) all run exclusively inside your browser on your computer.
- Password inputs (`<input type="password">`) are explicitly excluded from the searchable text layer and remain visually masked.
- No remote scripts, analytics SDKs, telemetry, or external API calls exist anywhere in the extension.

### 3. Local Storage
- **Preferences (`chrome.storage.local`):** Stores only your local UI settings (`includePage`, `searchableText`, `fullOcr`, `imageQuality`).
- **Temporary PDFs (`IndexedDB`):** Stores the generated PDF temporarily in your browser profile solely to open the **Save As** dialog (`chrome.downloads.download`). Temporary entries are automatically deleted after **24 hours**.

### 4. Permissions
- Standard permissions (`activeTab`, `downloads`, `offscreen`, `scripting`, `storage`, `webNavigation`) operate strictly on the active tab when invoked by the user.
- `optional_host_permissions` (`https://*/*`, `http://*/*`) are **not** granted at install time; access to a specific cross-origin frame origin is requested **only** when you click **Allow capture** in the popup.

### 5. Contact
Questions or privacy reports can be submitted via GitHub Issues:
[https://github.com/ricarossetto/salva-site/issues](https://github.com/ricarossetto/salva-site/issues)

---

## Português (Brasil)

**Salva Site** é uma extensão de navegador de código aberto projetada para funcionar **100% localmente** no seu computador.

### 1. Coleta de Dados
**O Salva Site não coleta, não armazena em servidores externos, não transmite, não vende e não compartilha dados pessoais, histórico de navegação, conteúdo de páginas, capturas de tela, dados de formulários ou PDFs gerados.**

### 2. Processamento Exclusivamente Local
- Ao iniciar uma captura, as imagens da aba (`chrome.tabs.captureVisibleTab`), a leitura do texto da página, os valores preenchidos nos campos, o OCR local opcional (`tesseract.js` WebAssembly) e a montagem do PDF (`pdf-lib`) ocorrem inteiramente dentro do navegador, no seu computador.
- Campos de senha (`<input type="password">`) são explicitamente excluídos da camada de texto pesquisável e permanecem mascarados.
- A extensão não possui código remoto, telemetria, rastreadores ou chamadas a servidores externos.

### 3. Armazenamento Local
- **Preferências (`chrome.storage.local`):** Armazena apenas suas opções locais da interface (`includePage`, `searchableText`, `fullOcr`, `imageQuality`).
- **PDFs temporários (`IndexedDB`):** Guarda o PDF recém-gerado temporariamente no perfil do navegador apenas para abrir a janela de download (`chrome.downloads.download`), com limpeza automática após **24 horas**.

### 4. Permissões
- As permissões padrão (`activeTab`, `downloads`, `offscreen`, `scripting`, `storage`, `webNavigation`) atuam apenas na aba ativa quando acionadas pelo usuário.
- `optional_host_permissions` (`https://*/*`, `http://*/*`) **não** são concedidas na instalação; o acesso a uma origem incorporada externa só é solicitado quando você clica em **Permitir captura** no popup.

### 5. Contato
Dúvidas ou solicitações podem ser registradas via GitHub Issues:
[https://github.com/ricarossetto/salva-site/issues](https://github.com/ricarossetto/salva-site/issues)
