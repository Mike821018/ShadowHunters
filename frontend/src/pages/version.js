import { t } from '../i18n.js';

function escHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inlineFmt(text) {
  return text
    .replace(/\*\*(.+?)\*\*/g, (_, m) => `<strong>${m}</strong>`)
    .replace(/`(.+?)`/g, (_, m) => `<code>${escHtml(m)}</code>`);
}

function renderMarkdown(raw) {
  const lines = raw.split('\n');
  const parts = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith('#### ')) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h4>${inlineFmt(escHtml(line.slice(5)))}</h4>`);
    } else if (line.startsWith('### ')) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h3>${inlineFmt(escHtml(line.slice(4)))}</h3>`);
    } else if (line.startsWith('## ')) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h2>${inlineFmt(escHtml(line.slice(3)))}</h2>`);
    } else if (line.startsWith('# ')) {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<h1>${inlineFmt(escHtml(line.slice(2)))}</h1>`);
    } else if (/^- /.test(line)) {
      if (!inList) { parts.push('<ul>'); inList = true; }
      parts.push(`<li>${inlineFmt(escHtml(line.slice(2)))}</li>`);
    } else if (line.trim() === '') {
      if (inList) { parts.push('</ul>'); inList = false; }
    } else {
      if (inList) { parts.push('</ul>'); inList = false; }
      parts.push(`<p>${inlineFmt(escHtml(line))}</p>`);
    }
  }
  if (inList) parts.push('</ul>');
  return parts.join('\n');
}

export async function initVersionPage() {
  const content = document.getElementById('versionContent');
  if (!content) return;

  try {
    const resp = await fetch('/api/version_notes', { cache: 'no-store' });
    if (!resp.ok) {
      content.innerHTML = `<p class="lighttxt">${escHtml(t('version.empty'))}</p>`;
      return;
    }
    const text = (await resp.text()).trim();
    if (!text) {
      content.innerHTML = `<p class="lighttxt">${escHtml(t('version.empty'))}</p>`;
      return;
    }
    content.innerHTML = renderMarkdown(text);
  } catch {
    content.innerHTML = `<p class="lighttxt">${escHtml(t('version.empty'))}</p>`;
  }
}
