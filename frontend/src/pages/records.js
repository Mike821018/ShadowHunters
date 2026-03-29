import { t } from '../i18n.js';
import { apiFetch } from '../utils.js';

function winnerBadge(camp, tokenLabel) {
  if (camp === 'hunter') {
    return `<span class="records-winner records-winner-hunter">${tokenLabel.hunter}</span>`;
  }
  if (camp === 'shadow') {
    return `<span class="records-winner records-winner-shadow">${tokenLabel.shadow}</span>`;
  }
  if (camp === 'civilian') {
    return `<span class="records-winner records-winner-civilian">${tokenLabel.civilian}</span>`;
  }
  return '';
}

function winnerCell(winnerCode) {
  const tokenLabel = {
    hunter: t('records.winner_hunter'),
    shadow: t('records.winner_shadow'),
    civilian: t('records.winner_civilian'),
  };
  const singleBadge = winnerBadge(winnerCode, tokenLabel);
  if (singleBadge) return singleBadge;
  const parts = String(winnerCode || '').split('_').filter(Boolean);
  if (parts.length >= 2) {
    const ordered = parts.filter((camp) => ['hunter', 'shadow', 'civilian'].includes(camp));
    if (ordered.length) {
      return `<span class="records-winner-group">${ordered.map((camp) => winnerBadge(camp, tokenLabel)).join('')}</span>`;
    }
  }
  return `<span class="lighttxt">-</span>`;
}

function formatDateTime(raw) {
  const dt = new Date(raw || '');
  if (Number.isNaN(dt.getTime())) return raw || '-';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  const ss = String(dt.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function renderRecordsTable(entries) {
  const tbody = document.getElementById('recordsTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!entries || !entries.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="lighttxt">${t('records.empty')}</td>`;
    tbody.appendChild(tr);
    return;
  }

  entries.forEach((entry) => {
    const roomId = entry.room_id ?? '-';
    const villageName = entry.village_name || `${roomId}${t('records.village_suffix')}`;
    const villageLink = `./replay_room.html?roomId=${encodeURIComponent(String(roomId))}`;
    const endTimeText = formatDateTime(entry.end_time);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${roomId}</td>
      <td><a href="${villageLink}">${villageName}</a></td>
      <td>${endTimeText || '-'}</td>
      <td>${entry.player_count ?? '-'}</td>
      <td>${winnerCell(entry.winner_code)}</td>
      <td>${entry.options || '-'}</td>
    `;
    tr.classList.add('room-row');
    tr.addEventListener('click', () => {
      window.location.href = villageLink;
    });
    tbody.appendChild(tr);
  });
}

function totalPages(pagination) {
  const total = Number(pagination?.total || 0);
  const pageSize = Number(pagination?.page_size || 20);
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

function updatePager(pagination, onPrev, onNext) {
  const info = document.getElementById('recordsPageInfo');
  const prev = document.getElementById('recordsPrevPage');
  const next = document.getElementById('recordsNextPage');
  const page = Number(pagination?.page || 1);
  const pages = totalPages(pagination);
  if (info) info.textContent = `${page} / ${pages}`;
  if (prev) {
    prev.disabled = page <= 1;
    prev.onclick = onPrev;
  }
  if (next) {
    next.disabled = page >= pages;
    next.onclick = onNext;
  }
}

async function fetchJson(url) {
  const response = await apiFetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function initRecordsPage({ toast }) {
  const state = {
    page: 1,
    pageSize: 20,
    limit: 500,
  };

  const loadPage = async () => {
    const params = new URLSearchParams();
    params.set('limit', String(state.limit));
    params.set('page', String(state.page));
    params.set('page_size', String(state.pageSize));
    const result = await fetchJson(`/api/game_records?${params.toString()}`);
    renderRecordsTable(result.entries || []);
    updatePager(
      result.pagination || { page: state.page, page_size: state.pageSize, total: 0 },
      async () => {
        state.page = Math.max(1, state.page - 1);
        await loadPage();
      },
      async () => {
        state.page += 1;
        await loadPage();
      },
    );
  };

  try {
    await loadPage();
  } catch {
    renderRecordsTable([]);
    updatePager({ page: 1, page_size: 20, total: 0 }, null, null);
    toast('Records load failed', 'error');
  }
}
