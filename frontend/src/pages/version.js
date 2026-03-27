import { t } from '../i18n.js';

const ISSUE_FILES = [
  { file: '../issue_list/issue_list_1.md', label: 'Issue List 1' },
  { file: '../issue_list/issue_list_2.md', label: 'Issue List 2' },
  { file: '../issue_list/issue_list_3.md', label: 'Issue List 3' },
  { file: '../issue_list/issue_list_4.md', label: 'Issue List 4' },
  { file: '../issue_list/issue_list_5.md', label: 'Issue List 5' },
];

export async function initVersionPage() {
  const list = document.getElementById('versionList');
  if (!list) return;

  list.innerHTML = '';
  ISSUE_FILES.forEach((item) => {
    const li = document.createElement('li');
    li.className = 'version-list-item';
    li.innerHTML = `<a href="${item.file}" target="_blank" rel="noopener noreferrer">${item.label}</a>`;
    list.appendChild(li);
  });

  if (!ISSUE_FILES.length) {
    const li = document.createElement('li');
    li.className = 'lighttxt';
    li.textContent = t('version.empty');
    list.appendChild(li);
  }
}
