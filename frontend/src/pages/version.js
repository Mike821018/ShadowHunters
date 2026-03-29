import { t } from '../i18n.js';

const VERSION_FILES = [
  { file: '../VERSION.md', label: 'VERSION.md' },
];

export async function initVersionPage() {
  const list = document.getElementById('versionList');
  if (!list) return;

  list.innerHTML = '';
  VERSION_FILES.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'version-list-item';
    li.innerHTML = `<a href="${item.file}" target="_blank" rel="noopener noreferrer">${item.label}</a>`;
    list.appendChild(li);
  });

  if (!VERSION_FILES.length) {
    const li = document.createElement('li');
    li.className = 'lighttxt';
    li.textContent = t('version.empty');
    list.appendChild(li);
  }
}
