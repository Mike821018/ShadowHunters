import { t } from '../i18n.js';
import { getCharacterLocalizedName, getCurrentUiLang } from '../characterInfo.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function campLabel(camp) {
  const normalized = String(camp || '').trim().toLowerCase();
  if (normalized === 'hunter') return t('records.winner_hunter');
  if (normalized === 'shadow') return t('records.winner_shadow');
  if (normalized === 'civilian' || normalized === 'neutral') return t('records.winner_civilian');
  return '-';
}

function roleBadgeClass(camp) {
  const normalized = String(camp || '').trim().toLowerCase();
  if (normalized === 'hunter') return 'hunter';
  if (normalized === 'shadow') return 'shadow';
  return 'civilian';
}

function renderPlayers(rows) {
  const body = document.getElementById('recordViewPlayers');
  if (!(body instanceof HTMLElement)) return;
  body.innerHTML = '';

  if (!Array.isArray(rows) || !rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6" class="lighttxt">-</td>';
    body.appendChild(tr);
    return;
  }

  const lang = getCurrentUiLang();
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    const roleName = getCharacterLocalizedName(row.character_name || '-', lang);
    const roleBadge = String(row.character_name || '?').trim().charAt(0).toUpperCase() || '?';
    const equipments = Array.isArray(row.cards_equipped) && row.cards_equipped.length ? row.cards_equipped.join(', ') : '-';
    tr.innerHTML = `
      <td>${escapeHtml(row.player_name || row.player_id || '-')}</td>
      <td><span class="damage-meter-badge ${roleBadgeClass(row.character_camp)}">${escapeHtml(roleBadge)}</span> ${escapeHtml(roleName)}</td>
      <td>${escapeHtml(campLabel(row.character_camp))}</td>
      <td>${row.is_alive ? escapeHtml(t('common.alive')) : escapeHtml(t('common.dead'))}</td>
      <td>${Number(row.final_hp ?? 0)}</td>
      <td>${escapeHtml(equipments)}</td>
    `;
    body.appendChild(tr);
  });
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return response.json();
}

export async function initRecordViewPage({ toast }) {
  const params = new URLSearchParams(window.location.search);
  const recordId = String(params.get('recordId') || '').trim();
  const title = document.getElementById('recordViewTitle');
  const meta = document.getElementById('recordViewMeta');

  if (!recordId) {
    if (meta) meta.textContent = 'recordId is required';
    renderPlayers([]);
    return;
  }

  try {
    const data = await fetchJson(`/api/game_record/${encodeURIComponent(recordId)}`);
    if (title) title.textContent = `${Number(data.room_id || 0)}${t('records.village_suffix')} - ${t('records.col_end_time')}`;
    if (meta) {
      const winners = Array.isArray(data.winner_players) ? data.winner_players.length : 0;
      meta.textContent = `${t('records.col_end_time')}: ${data.game_date || '-'} / ${t('records.col_winner')}: ${campLabel(data.winner_camp)} / ${t('records.col_player_count')}: ${Array.isArray(data.players) ? data.players.length : 0} / Winners: ${winners}`;
    }
    renderPlayers(data.players || []);
  } catch {
    if (meta) meta.textContent = 'Record load failed';
    renderPlayers([]);
    toast('Record load failed', 'error');
  }
}
