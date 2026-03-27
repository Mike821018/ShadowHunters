import { t } from '../i18n.js';

function winnerCell(winnerCode) {
  if (winnerCode === 'hunter') {
    return `<span class="records-winner records-winner-hunter">${t('records.winner_hunter')}</span>`;
  }
  if (winnerCode === 'shadow') {
    return `<span class="records-winner records-winner-shadow">${t('records.winner_shadow')}</span>`;
  }
  if (winnerCode === 'civilian') {
    return `<span class="records-winner records-winner-civilian">${t('records.winner_civilian')}</span>`;
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
    const recordId = entry.record_id || '';
    const villageLink = recordId ? `./room.html?recordId=${encodeURIComponent(recordId)}` : `./room.html?roomId=${encodeURIComponent(String(roomId))}`;
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

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json();
}

export async function initRecordsPage({ toast }) {
  try {
    const result = await fetchJson('/api/game_records?limit=200');
    renderRecordsTable(result.entries || []);
  } catch {
    renderRecordsTable([]);
    toast('Records load failed', 'error');
  }
}
