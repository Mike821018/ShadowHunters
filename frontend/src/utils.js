export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function getInitial(nameOrLabel) {
  const text = String(nameOrLabel || '').trim();
  if (!text) return '?';
  return text.slice(0, 1).toUpperCase();
}

export function normalizeVillageName(rawName) {
  return String(rawName || '').trim().replace(/村+$/u, '').trim();
}

export function withVillageSuffix(name) {
  const base = normalizeVillageName(name);
  return base ? `${base}村` : '';
}

export function countChars(text) {
  return Array.from(String(text || '')).length;
}

function getCharDisplayWidth(char) {
  const cp = char.codePointAt(0);
  if (cp == null) return 0;

  if (
    (cp >= 0x0300 && cp <= 0x036F)
    || (cp >= 0x1AB0 && cp <= 0x1AFF)
    || (cp >= 0x1DC0 && cp <= 0x1DFF)
    || (cp >= 0x20D0 && cp <= 0x20FF)
    || (cp >= 0xFE20 && cp <= 0xFE2F)
  ) {
    return 0;
  }

  if (
    cp >= 0x1100 && (
      cp <= 0x115F
      || cp === 0x2329
      || cp === 0x232A
      || (cp >= 0x2E80 && cp <= 0xA4CF && cp !== 0x303F)
      || (cp >= 0xAC00 && cp <= 0xD7A3)
      || (cp >= 0xF900 && cp <= 0xFAFF)
      || (cp >= 0xFE10 && cp <= 0xFE19)
      || (cp >= 0xFE30 && cp <= 0xFE6F)
      || (cp >= 0xFF00 && cp <= 0xFF60)
      || (cp >= 0xFFE0 && cp <= 0xFFE6)
      || (cp >= 0x1F300 && cp <= 0x1FAFF)
    )
  ) {
    return 2;
  }

  return 1;
}

export function countDisplayWidth(text) {
  let width = 0;
  for (const char of String(text || '')) {
    width += getCharDisplayWidth(char);
  }
  return width;
}

export function buildApiFetchOptions(options = {}) {
  const merged = { ...options };
  const headers = new Headers(options?.headers || {});
  if (!headers.has('ngrok-skip-browser-warning')) {
    headers.set('ngrok-skip-browser-warning', 'true');
  }
  merged.headers = headers;
  return merged;
}

export function apiFetch(input, options = {}) {
  return fetch(input, buildApiFetchOptions(options));
}

export function isValidAsciiCredential(text, { allowEmpty = false } = {}) {
  const value = String(text || '');
  if (!value) return allowEmpty;
  return /^[A-Za-z0-9!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/.test(value);
}
