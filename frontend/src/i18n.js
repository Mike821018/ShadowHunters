import zhDict from './locales/zh.js';
import enDict from './locales/en.js';
import jpDict from './locales/jp.js';

const SUPPORTED = ['zh', 'en', 'jp'];
const LANG_STORE_KEY = 'sh.lang';
const LANG_HTML = { zh: 'zh-Hant', en: 'en', jp: 'ja' };
const DICTS = { zh: zhDict, en: enDict, jp: jpDict };

let _dict = zhDict;
let _fallback = zhDict;

/**
 * Resolve language: URL param ?lang= > localStorage > browser language > 'zh'
 * @returns {string}
 */
export function resolveLang() {
  const url = new URLSearchParams(location.search).get('lang');
  if (url && SUPPORTED.includes(url)) return url;
  const stored = localStorage.getItem(LANG_STORE_KEY);
  if (stored && SUPPORTED.includes(stored)) return stored;
  const browser = (navigator.language || '').toLowerCase();
  if (browser.startsWith('ja')) return 'jp';
  if (browser.startsWith('zh')) return 'zh';
  if (browser.startsWith('en')) return 'en';
  return 'zh';
}

/**
 * Persist language choice and reload the page.
 * @param {string} lang
 */
export function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  localStorage.setItem(LANG_STORE_KEY, lang);
  window.location.reload();
}

/**
 * Load locale dictionary and update <html lang="...">.
 * Call once at app boot, before any rendering.
 * @returns {string} resolved language code
 */
export function initI18n() {
  const lang = resolveLang();
  _dict = DICTS[lang] ?? zhDict;
  _fallback = zhDict;
  document.documentElement.lang = LANG_HTML[lang] || lang;
  return lang;
}

/**
 * Get a nested value from an object by dot-notation key.
 * @param {object} obj
 * @param {string} key
 * @returns {string|undefined}
 */
function getNestedValue(obj, key) {
  return key.split('.').reduce((o, k) => (o != null && o[k] !== undefined ? o[k] : undefined), obj);
}

/**
 * Translate a key with optional interpolation params.
 * Falls back to zh dictionary, then to the raw key.
 * @param {string} key   dot-notation key, e.g. 'lobby.rooms.title'
 * @param {object} [params]  interpolation map, e.g. { n: 10, id: 42 }
 * @returns {string}
 */
export function t(key, params = {}) {
  let val = getNestedValue(_dict, key);
  if (val === undefined) val = getNestedValue(_fallback, key);
  if (val === undefined) val = key;
  if (typeof val === 'string' && Object.keys(params).length) {
    Object.entries(params).forEach(([k, v]) => {
      val = val.replaceAll(`{${k}}`, String(v));
    });
  }
  return String(val);
}

/**
 * Apply translations to all elements annotated with:
 *   data-i18n              → element.textContent
 *   data-i18n-placeholder  → element.placeholder
 *   data-i18n-title        → element.title
 *   data-i18n-aria         → element.setAttribute('aria-label', ...)
 * @param {Document|Element} [root=document]
 */
export function applyI18n(root = document) {
  const parseArgs = (el) => {
    const raw = el.getAttribute('data-i18n-args');
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  };

  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n, parseArgs(el));
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder, parseArgs(el));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle, parseArgs(el));
  });
  root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
    el.setAttribute('aria-label', t(el.dataset.i18nAria, parseArgs(el)));
  });
}

/**
 * Bind language-switcher dropdown ([data-lang-select]).
 * @param {string} currentLang
 * @param {Document|Element} [root=document]
 */
export function bindLangSwitcher(currentLang, root = document) {
  root.querySelectorAll('select[data-lang-select]').forEach((select) => {
    select.value = currentLang;
    select.addEventListener('change', () => {
      setLang(select.value);
    });
  });
}
