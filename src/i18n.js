(() => {
  function t(key, substitutions, fallback = "") {
    try {
      const value = globalThis.chrome?.i18n?.getMessage?.(key, substitutions);
      if (value) return value;
    } catch {}
    return fallback || key;
  }

  function applyI18n(root = document) {
    try {
      const uiLang = globalThis.chrome?.i18n?.getUILanguage?.();
      if (uiLang && document?.documentElement) {
        document.documentElement.lang = uiLang;
      }
    } catch {}

    const titleElement = document?.head?.querySelector("title[data-i18n]");
    const titleKey = document?.documentElement?.dataset?.i18nTitle || titleElement?.dataset?.i18n;
    if (titleKey) {
      const translatedTitle = t(titleKey, undefined, document.title);
      if (translatedTitle) document.title = translatedTitle;
    }

    for (const element of root.querySelectorAll("[data-i18n]")) {
      const key = element.dataset.i18n;
      if (!key) continue;
      const translated = t(key, undefined, element.textContent);
      if (translated) element.textContent = translated;
    }
  }

  globalThis.SalvaSiteI18n = { t, applyI18n };
})();
