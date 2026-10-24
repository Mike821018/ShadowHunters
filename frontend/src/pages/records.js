import { t } from '../i18n.js';
import { apiFetch, esc } from '../utils.js';
import { positionOptionPopover, buildSettingsBadgeCodes, buildToggleBadge, buildTimeoutBadge } from './room/roomSettingsBadges.js';

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

// 2026-10-22 新增：聊天村廢村後保留的紀錄沒有陣營／勝負概念（room_kind === 'chat'），
// 不該顯示勝負徽章，改顯示跟大廳列表（lobby.js）同一個「聊天村」分類標籤，方便在
// 一般對戰紀錄裡一眼區分出來。沿用大廳已經有的 CSS class（room-type-tag／
// chat-room-tag，定義在 theme.css）跟 locale key（lobby.rooms.chat_tag），不用新增樣式。
function chatRoomTagCell() {
  return `<span class="room-type-tag chat-room-tag">${esc(t('lobby.rooms.chat_tag'))}</span>`;
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

// 2026-10-19 修正：這裡原本是解析後端拼接成人類可讀句子的 options 字串
// （例如「Initial Green Card / Badge Unique / all」），逐一比對固定的關鍵字
// 判斷要顯示哪個徽章代碼。這套判斷式跟房間頁村子資訊徽章列（villageSettingsBadges.js）
// 是完全分開維護的兩份邏輯，2026-10-15 villageSettingsBadges.js 補上 GM／R 兩個
// 徽章時，這裡完全沒有同步更新，導致 Mike 回報「對戰紀錄沒有把所有的徽章都
// 放上去」。現在後端 api_get_game_records 已經改成每筆紀錄都附上結構化的
// game_settings 欄位（跟單筆紀錄詳情 API 用的是同一套正規化邏輯），這裡直接
// 呼叫 roomSettingsBadges.js 共用的 buildSettingsBadgeCodes()／buildToggleBadge()／
// buildTimeoutBadge()——跟房間頁是同一份判讀清單，不用再自己解析文字，未來
// 要新增設定的徽章，只需要改 roomSettingsBadges.js 那份清單，這裡會自動跟著出現。
function renderOptionsCell(settings) {
  if (!settings) return '<span class="lighttxt">-</span>';
  const badgeHtml = buildSettingsBadgeCodes(settings).map((code) => buildToggleBadge(code)).join('');
  const timeoutHtml = buildTimeoutBadge(settings);
  return `<span class="records-option-wrap">${badgeHtml}${timeoutHtml}</span>`;
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

      positionOptionPopover(pop, source.getBoundingClientRect());

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
      <td><a href="${villageLink}" target="_blank" rel="noopener">${villageName}</a></td>
      <td>${endTimeText || '-'}</td>
      <td>${entry.player_count ?? '-'}</td>
      <td>${entry.room_kind === 'chat' ? chatRoomTagCell() : winnerCell(entry.winner_code)}</td>
      <td>${renderOptionsCell(entry.game_settings)}</td>
    `;
    tr.classList.add('room-row');
    tr.addEventListener('click', (event) => {
      // 2026-10-17 修正：Mike 要求查詢戰績／瀏覽紀錄點進房號時改用開新分頁，
      // 而不是在同一個分頁跳轉過去，方便一邊看列表一邊開多場復盤。這裡的 <a>
      // 本身已經是 target="_blank"，如果點到的是連結本身（或連結內的文字），
      // 交給瀏覽器原生行為處理即可，不要再額外呼叫一次 window.open()，否則會
      // 一次點擊開出兩個分頁；只有點到整列其他空白區域時才由這裡手動開新分頁。
      if (event.target instanceof Element && event.target.closest('a')) return;
      window.open(villageLink, '_blank', 'noopener');
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
    // 2026-10-22 新增：Mike 要求紀錄閱覽頁把「一般紀錄」跟「聊天村紀錄」拆成
    // 子分頁分開顯示，不要混在同一份列表裡。預設停在一般紀錄分頁（跟改版前的
    // 行為一致），切分頁時重置回第 1 頁再重新查詢。
    roomKind: 'game',
  };

  const searchInput = document.getElementById('recordsSearchInput');
  const searchButton = document.getElementById('recordsSearchButton');
  const searchClearButton = document.getElementById('recordsSearchClearButton');

  const loadPage = async () => {
    const params = new URLSearchParams();
    params.set('page', String(state.page));
    params.set('page_size', String(state.pageSize));
    if (state.search) params.set('search', state.search);
    params.set('room_kind', state.roomKind);
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

  // 2026-10-22 新增：一般／聊天村分頁按鈕。沿用身分登錄頁／頭像頁已經有的
  // .tab／.current 分頁樣式，不用另外加 CSS；點了哪個分頁就把 state.roomKind
  // 換成對應值，重置回第 1 頁重新查詢（跟搜尋／換頁共用同一份 loadPage）。
  const kindTabButtons = Array.from(document.querySelectorAll('.records-kind-tabs [data-room-kind]'));
  kindTabButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      const kind = button.getAttribute('data-room-kind') || 'game';
      if (kind === state.roomKind) return;
      state.roomKind = kind;
      state.page = 1;
      kindTabButtons.forEach((btn) => {
        const active = btn === button;
        btn.classList.toggle('current', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      await loadPage();
    });
  });

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
