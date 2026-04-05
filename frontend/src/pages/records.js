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

function parseOptionBadges(rawOptions) {
  const text = String(rawOptions || '').trim();
  if (!text || text === '-') return { badges: [], extras: [] };
  const tokens = text.split('/').map((part) => String(part || '').trim()).filter(Boolean);
  const badgeSet = new Set();
  const extras = [];
  tokens.forEach((token) => {
    const normalized = token.toLowerCase();
    if (normalized === 'initial green card') {
      badgeSet.add('G');
      return;
    }
    if (normalized === 'neutral chaos mode' || normalized === 'neutral chaos' || normalized === '中立大亂鬥' || normalized === '中立大乱闘') {
      badgeSet.add('C');
      return;
    }
    if (normalized === 'all') {
      badgeSet.add('B');
      badgeSet.add('E');
      return;
    }
    if (normalized === 'no_extend') {
      badgeSet.add('B');
      return;
    }
    if (normalized === 'expansion_only') {
      badgeSet.add('E');
      return;
    }
    extras.push(token);
  });
  return { badges: Array.from(badgeSet), extras };
}

function optionBadgeMeta(code) {
  if (code === 'G') {
    return {
      className: 'records-option-badge records-option-badge-green',
      title: t('records.badge_green_title'),
      desc: t('records.badge_green_desc'),
    };
  }
  if (code === 'C') {
    return {
      className: 'records-option-badge records-option-badge-neutral',
      title: t('records.badge_neutral_chaos_title'),
      desc: t('records.badge_neutral_chaos_desc'),
    };
  }
  if (code === 'B') {
    return {
      className: 'records-option-badge records-option-badge-blue',
      title: t('records.badge_basic_title'),
      desc: t('records.badge_basic_desc'),
    };
  }
  if (code === 'E') {
    return {
      className: 'records-option-badge records-option-badge-blue',
      title: t('records.badge_extend_title'),
      desc: t('records.badge_extend_desc'),
    };
  }
  return {
    className: 'records-option-badge',
    title: code,
    desc: code,
  };
}

function renderOptionsCell(rawOptions) {
  const { badges, extras } = parseOptionBadges(rawOptions);
  if (!badges.length && !extras.length) return '<span class="lighttxt">-</span>';
  const badgeHtml = badges.map((code) => {
    const meta = optionBadgeMeta(code);
    return `<button type="button" class="${meta.className}" data-option-badge="${code}" data-option-title="${meta.title}" data-option-desc="${meta.desc}" aria-label="${meta.title}" title="${meta.title}">${code}</button>`;
  }).join('');
  const extrasHtml = extras.map((token) => `<span class="records-option-extra">${token}</span>`).join('');
  return `<span class="records-option-wrap">${badgeHtml}${extrasHtml}</span>`;
}

function bindOptionBadgePopover(host) {
  if (!host) return;
  host.querySelectorAll('[data-option-badge]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = event.currentTarget;
      if (!(source instanceof HTMLElement)) return;
      const existing = document.getElementById('recordsOptionPopover');
      if (existing) existing.remove();

      const title = String(source.getAttribute('data-option-title') || '').trim();
      const desc = String(source.getAttribute('data-option-desc') || '').trim();
      const pop = document.createElement('div');
      pop.id = 'recordsOptionPopover';
      pop.className = 'records-option-popover';
      pop.innerHTML = `<strong>${title}</strong><p>${desc}</p>`;
      document.body.appendChild(pop);

      const rect = source.getBoundingClientRect();
      pop.style.left = `${Math.max(8, rect.left + (rect.width / 2))}px`;
      pop.style.top = `${Math.max(8, rect.bottom + 8)}px`;

      window.setTimeout(() => {
        const close = (ev) => {
          const target = ev.target;
          if (target instanceof Element && (target.closest('#recordsOptionPopover') || target.closest('[data-option-badge]'))) return;
          pop.remove();
          window.removeEventListener('click', close, true);
        };
        window.addEventListener('click', close, true);
      }, 0);
    });
  });
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
      <td>${renderOptionsCell(entry.options)}</td>
    `;
    tr.classList.add('room-row');
    tr.addEventListener('click', () => {
      window.location.href = villageLink;
    });
    bindOptionBadgePopover(tr);
    tbody.appendChild(tr);
  });
}

function totalPages(pagination) {
  const total = Number(pagination?.total || 0);
  const pageSize = Number(pagination?.page_size || 20);
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

function updatePager(pagination, state, onPrev, onNext, onJump) {
  const info = document.getElementById('recordsPageInfo');
  const prev = document.getElementById('recordsPrevPage');
  const next = document.getElementById('recordsNextPage');
  const pageInput = document.getElementById('recordsPageInput');
  const page = Number(pagination?.page || 1);
  const pages = totalPages(pagination);
  if (info) info.textContent = `${page} / ${pages}`;
  if (pageInput) {
    pageInput.value = String(page);
    pageInput.max = String(pages);
    pageInput.onchange = () => {
      const nextPage = Math.max(1, Math.min(pages, Number(pageInput.value || page) || page));
      state.page = nextPage;
      onJump?.();
    };
  }
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
    search: '',
  };

  const searchInput = document.getElementById('recordsSearchInput');
  const searchButton = document.getElementById('recordsSearchButton');
  const searchClearButton = document.getElementById('recordsSearchClearButton');

  const loadPage = async () => {
    const params = new URLSearchParams();
    params.set('page', String(state.page));
    params.set('page_size', String(state.pageSize));
    if (state.search) params.set('search', state.search);
    const result = await fetchJson(`/api/game_records?${params.toString()}`);
    renderRecordsTable(result.entries || []);
    updatePager(
      result.pagination || { page: state.page, page_size: state.pageSize, total: 0 },
      state,
      async () => {
        state.page = Math.max(1, state.page - 1);
        await loadPage();
      },
      async () => {
        state.page += 1;
        await loadPage();
      },
      async () => {
        await loadPage();
      },
    );
  };

  const submitSearch = async () => {
    state.search = String(searchInput?.value || '').trim();
    state.page = 1;
    await loadPage();
  };

  searchButton?.addEventListener('click', submitSearch);
  searchClearButton?.addEventListener('click', async () => {
    if (searchInput) searchInput.value = '';
    state.search = '';
    state.page = 1;
    await loadPage();
  });
  searchInput?.addEventListener('keydown', async (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    await submitSearch();
  });

  try {
    await loadPage();
  } catch {
    renderRecordsTable([]);
    updatePager({ page: 1, page_size: 20, total: 0 }, null, null);
    toast('Records load failed', 'error');
  }
}
