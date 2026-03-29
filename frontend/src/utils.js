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
