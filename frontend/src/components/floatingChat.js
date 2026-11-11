/**
 * Floating Chat Window (Room page only)
 *
 * Displayed at the bottom-right corner of room.html.
 * Excluded from replay-room per design spec.
 * Collapsed by default; badge shows unread count when new messages arrive.
 * Features: collapsible panel, higu emoji picker, keyboard shortcuts.
 */

import { HIGU_CHAT_EMOJIS } from '../pages/room/chatEmoji.js';
import { buildChatStageLines } from '../pages/room/chatFormatter.js';
import { getCharacterLocalizedName, getCurrentUiLang } from '../characterInfo.js';
import { t } from '../i18n.js';
import { esc, apiFetch, countDisplayWidth } from '../utils.js';
import { registerFloatingPanel, notifyFloatingPanelOpened, notifyFloatingPanelClosed } from './floatingPanelGroup.js';

// 2026-10-10 修正：Mike 要求更新頻率再快一點，從 8 秒加快到 3 秒，跟房間主畫面
// 的背景保底輪詢（roomEventStream.js 的 ROOM_FALLBACK_POLL_MS）保持一致。
const POLL_MS = 3000;
const LS_KEY = 'sh.floatingChat.collapsed';
// 2026-10-24 修正：原本是「聊天／系統」二選一分頁，Mike 說想要的其實是各自獨立的
// 開關（可以同時都看、也可以各自關掉），改成兩把各自的開關狀態。
const LS_SHOW_CHAT_KEY = 'sh.floatingChat.showChat';
const LS_SHOW_SYSTEM_KEY = 'sh.floatingChat.showSystem';

// ─── helpers ────────────────────────────────────────────────────────────────

async function callDispatch(action, payload) {
  try {
    const resp = await apiFetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, payload }),
    });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

function getLocalizedCardNameFallback(cardNameEnglish) {
  const rawName = String(cardNameEnglish || '').trim();
  if (!rawName) return '';
  const key = `room.active_card.names.${rawName}`;
  const localized = t(key);
  return localized && localized !== key ? localized : rawName;
}

// 2026-10-24 新增：回傳 chatFormatter.js 整理好的聊天／系統訊息（含按時間順序
// 合併好、各自標好類型的 combinedLines），讓浮動聊天室可以用兩個獨立開關分別
// 顯示／隱藏聊天或系統訊息，不用再靠 mirrorToChat 把系統訊息硬塞進聊天清單。
function buildChatAndSystemLines(roomData, account, roomId) {
  return buildChatStageLines({
    messages: Array.isArray(roomData?.chat_messages) ? roomData.chat_messages : [],
    data: roomData || {},
    // 2026-11-11 修正：這裡原本沒有帶 roomId，導致 chatFormatter.js 的
    // getChatRoleHtml 在算「陣營猜測」徽號時，getCampGuessIndex 拿到的
    // roomId 永遠是 undefined（它的防呆判斷 roomId == null 時直接回傳 0 ＝
    // 「尚未猜測」），讓浮動聊天室（也就是玩家實際看到、唯一在房間頁顯示的
    // 聊天室）的「(???)」永遠不會跟著陣營猜測徽號變色或變成「(---)」。
    // 房間頁內嵌的聊天面板（chatFormatter 原本設計給 renderChatStage 用）
    // 現在已經統一隱藏、改用這個浮動聊天室，所以這裡才是真正需要修的地方。
    state: { account: String(account || '').trim(), roomId },
    esc,
    t,
    isReplayView: false,
    getCurrentUiLang,
    getCharacterLocalizedName,
    getLocalizedCardName: getLocalizedCardNameFallback,
  });
}

// ─── DOM construction ────────────────────────────────────────────────────────

function buildEmojiGridHtml() {
  return HIGU_CHAT_EMOJIS.map((e) =>
    `<button class="sh-fchat-emoji-item" type="button" data-code="${esc(e.code)}" title="${esc(e.code)}"><img src="/assets/emoji/higu/${esc(e.filename)}" alt="${esc(e.code)}" loading="lazy"></button>`
  ).join('');
}

function buildDOM() {
  const wrap = document.createElement('div');
  wrap.className = 'sh-floating-chat';
  wrap.setAttribute('role', 'complementary');
  wrap.setAttribute('aria-label', '浮動聊天室');
  wrap.innerHTML = `
    <div class="sh-fchat-panel" hidden>
      <div class="sh-fchat-header">
        <span class="sh-fchat-title">聊天室</span>
        <button class="sh-fchat-collapse-btn" type="button" aria-label="收合聊天室">−</button>
      </div>
      <div class="sh-fchat-tabs" role="group" aria-label="訊息篩選">
        <button class="sh-fchat-tab" type="button" aria-pressed="true" data-filter="chat">聊天<span class="sh-fchat-tab-badge" hidden aria-live="polite"></span></button>
        <button class="sh-fchat-tab" type="button" aria-pressed="true" data-filter="system">系統<span class="sh-fchat-tab-badge" hidden aria-live="polite"></span></button>
      </div>
      <div class="sh-fchat-msgs-wrap">
        <div class="sh-fchat-msgs" role="log" aria-live="polite" aria-label="聊天訊息" tabindex="0"></div>
        <button class="sh-fchat-scroll-bottom-btn" type="button" hidden></button>
      </div>
      <div class="sh-fchat-foot">
        <div class="sh-fchat-emoji-panel" hidden>
          <div class="sh-fchat-emoji-grid">${buildEmojiGridHtml()}</div>
        </div>
        <div class="sh-fchat-foot-row">
          <button class="sh-fchat-emoji-toggle" type="button" aria-label="表情符號" aria-expanded="false"><img src="/assets/emoji/higu/QB.jpg" alt="表情符號" class="sh-fchat-emoji-toggle-icon" /></button>
          <textarea class="sh-fchat-input" maxlength="200" rows="2" placeholder="輸入訊息…" aria-label="輸入聊天訊息"></textarea>
          <button class="sh-fchat-send" type="button">送出</button>
        </div>
      </div>
    </div>
    <button class="sh-fchat-toggle-btn" type="button" aria-expanded="false" aria-label="聊天室">
      <span class="sh-fchat-toggle-icon" aria-hidden="true">💬</span>
      <span class="sh-fchat-badge" hidden aria-live="polite" aria-atomic="true"></span>
    </button>
  `;
  document.body.appendChild(wrap);
  return {
    wrap,
    panel:       wrap.querySelector('.sh-fchat-panel'),
    title:       wrap.querySelector('.sh-fchat-title'),
    collapseBtn: wrap.querySelector('.sh-fchat-collapse-btn'),
    filterChatBtn:   wrap.querySelector('.sh-fchat-tab[data-filter="chat"]'),
    filterSystemBtn: wrap.querySelector('.sh-fchat-tab[data-filter="system"]'),
    filterChatBadge:   wrap.querySelector('.sh-fchat-tab[data-filter="chat"] .sh-fchat-tab-badge'),
    filterSystemBadge: wrap.querySelector('.sh-fchat-tab[data-filter="system"] .sh-fchat-tab-badge'),
    msgs:        wrap.querySelector('.sh-fchat-msgs'),
    scrollBottomBtn: wrap.querySelector('.sh-fchat-scroll-bottom-btn'),
    emojiPanel:  wrap.querySelector('.sh-fchat-emoji-panel'),
    emojiGrid:   wrap.querySelector('.sh-fchat-emoji-grid'),
    emojiToggle: wrap.querySelector('.sh-fchat-emoji-toggle'),
    input:       wrap.querySelector('.sh-fchat-input'),
    sendBtn:     wrap.querySelector('.sh-fchat-send'),
    toggleBtn:   wrap.querySelector('.sh-fchat-toggle-btn'),
    badge:       wrap.querySelector('.sh-fchat-badge'),
  };
}

// ─── main ────────────────────────────────────────────────────────────────────

export async function initFloatingChat({ state }) {
  // Only for the game room page; replay-room is excluded per spec
  if (state?.page !== 'room') return;

  const roomId = state.roomId;
  const account = String(state.account || '').trim();
  if (!roomId) return;

  // Load initial room state to seed message list
  const initResult = await callDispatch('get_room_state', {
    room_id: roomId,
    account: account || undefined,
  });
  if (!initResult?.ok) return;

  const initMessages = Array.isArray(initResult?.data?.chat_messages)
    ? initResult.data.chat_messages
    : [];
  let lastSeenId = initMessages.length
    ? Math.max(...initMessages.map((m) => Number(m.id || 0)))
    : 0;

  // ── build UI ──────────────────────────────────────────────────────────────
  const el = buildDOM();

  const roomName = String(initResult?.data?.room?.village_name || '').trim();
  if (roomName) el.title.textContent = `聊天室・${roomName}`;

  // Disable inputs for observers (no account in this room)
  if (!account) {
    el.input.disabled = true;
    el.input.placeholder = '（觀察者無法發言）';
    el.sendBtn.disabled = true;
    el.emojiToggle.disabled = true;
  }

  // ── state variables ───────────────────────────────────────────────────────
  let collapsed = localStorage.getItem(LS_KEY) !== 'false'; // default: collapsed
  // 2026-10-24 新增：聊天／系統各自獨立的顯示開關，預設都打開（混合顯示），
  // 關掉其中一個就只看另一種；各自記住使用者上次的開關狀態。
  let showChat = localStorage.getItem(LS_SHOW_CHAT_KEY) !== 'false';
  let showSystem = localStorage.getItem(LS_SHOW_SYSTEM_KEY) !== 'false';
  let lastRoomData = null;
  let emojiOpen = false;
  let unreadChat = 0;
  let unreadSystem = 0;
  let isSending = false;
  let pollTimer = null;

  // ── scroll helpers ────────────────────────────────────────────────────────
  function isNearBottom() {
    const { scrollTop, scrollHeight, clientHeight } = el.msgs;
    return scrollHeight - scrollTop - clientHeight < 60;
  }
  function scrollToBottom() { el.msgs.scrollTop = el.msgs.scrollHeight; }

  // 上滑看歷史訊息時，顯示「回到最新訊息」按鈕，讓使用者自己決定要不要跳回底部。
  function updateScrollBottomBtn() {
    if (!el.scrollBottomBtn) return;
    const nearBottom = isNearBottom();
    el.scrollBottomBtn.hidden = nearBottom;
    if (!el.scrollBottomBtn.textContent) el.scrollBottomBtn.textContent = t('room.chat.scroll_to_bottom');
  }
  el.msgs.addEventListener('scroll', updateScrollBottomBtn);
  el.scrollBottomBtn?.addEventListener('click', () => {
    scrollToBottom();
    updateScrollBottomBtn();
  });

  // ── badge ─────────────────────────────────────────────────────────────────
  function updateTabBadge(badgeEl, count) {
    if (!badgeEl) return;
    if (count > 0) {
      badgeEl.hidden = false;
      badgeEl.textContent = count > 99 ? '99+' : String(count);
    } else {
      badgeEl.hidden = true;
    }
  }

  function updateBadge() {
    const total = unreadChat + unreadSystem;
    if (total > 0) {
      el.badge.hidden = false;
      el.badge.textContent = total > 99 ? '99+' : String(total);
    } else {
      el.badge.hidden = true;
    }
    updateTabBadge(el.filterChatBadge, unreadChat);
    updateTabBadge(el.filterSystemBadge, unreadSystem);
  }

  // ── 聊天／系統顯示開關 ───────────────────────────────────────────────────────
  // is-off：該類型目前被關掉、不顯示；按鈕本身不互斥，兩個可以同時開、同時關，
  // 或各開一個——跟最早的「分頁二選一」不同，這裡是各自獨立的篩選開關。
  function applyFilterUi() {
    el.filterChatBtn?.classList.toggle('is-off', !showChat);
    el.filterSystemBtn?.classList.toggle('is-off', !showSystem);
    el.filterChatBtn?.setAttribute('aria-pressed', String(showChat));
    el.filterSystemBtn?.setAttribute('aria-pressed', String(showSystem));
  }
  applyFilterUi();

  function setFilter(key, nextShown) {
    if (key === 'chat') {
      if (showChat === nextShown) return;
      showChat = nextShown;
      localStorage.setItem(LS_SHOW_CHAT_KEY, String(showChat));
      if (showChat) { unreadChat = 0; updateBadge(); }
    } else {
      if (showSystem === nextShown) return;
      showSystem = nextShown;
      localStorage.setItem(LS_SHOW_SYSTEM_KEY, String(showSystem));
      if (showSystem) { unreadSystem = 0; updateBadge(); }
    }
    applyFilterUi();
    renderCurrentView({ forceScrollBottom: true });
  }
  el.filterChatBtn?.addEventListener('click', () => setFilter('chat', !showChat));
  el.filterSystemBtn?.addEventListener('click', () => setFilter('system', !showSystem));

  // ── emoji panel ───────────────────────────────────────────────────────────
  function setEmojiOpen(open) {
    emojiOpen = open;
    el.emojiPanel.hidden = !open;
    el.emojiToggle.setAttribute('aria-expanded', String(open));
    el.emojiToggle.classList.toggle('is-active', open);
  }

  el.emojiToggle.addEventListener('click', () => setEmojiOpen(!emojiOpen));

  el.emojiGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.sh-fchat-emoji-item');
    if (!btn) return;
    const code = btn.dataset.code;
    if (!code) return;
    const pos = el.input.selectionStart ?? el.input.value.length;
    const val = el.input.value;
    el.input.value = val.slice(0, pos) + code + val.slice(pos);
    el.input.selectionStart = el.input.selectionEnd = pos + code.length;
    el.input.focus();
  });

  // ── expand / collapse ─────────────────────────────────────────────────────
  function expand() {
    collapsed = false;
    el.panel.hidden = false;
    el.toggleBtn.setAttribute('aria-expanded', 'true');
    // 只清掉目前有打開顯示的類型；關掉的那個使用者還沒真的看到，未讀數保留，
    // 等之後重新打開那個開關時才清掉（見 setFilter）。
    if (showChat) unreadChat = 0;
    if (showSystem) unreadSystem = 0;
    updateBadge();
    localStorage.setItem(LS_KEY, 'false');
    notifyFloatingPanelOpened('chat');
    scrollToBottom();
    updateScrollBottomBtn();
    el.input.focus();
  }

  function collapse() {
    collapsed = true;
    el.panel.hidden = true;
    el.toggleBtn.setAttribute('aria-expanded', 'false');
    setEmojiOpen(false);
    localStorage.setItem(LS_KEY, 'true');
    // 聊天面板收合後，之前被它擋住而被往上推開的血量／玩家按鈕要歸位。
    notifyFloatingPanelClosed();
  }

  // 額外提供版面座標資訊，讓 floatingPanelGroup 判斷聊天面板展開時
  // 是否會擋到血量／玩家按鈕，需要的話把那些按鈕往上推開（見該檔案說明）。
  registerFloatingPanel('chat', collapse, {
    isOpen: () => !collapsed,
    getToggleEl: () => el.toggleBtn,
    getPanelEl: () => el.panel,
    applyOffset: (px) => { el.wrap.style.bottom = `${px}px`; },
    resetOffset: () => { el.wrap.style.bottom = ''; },
  });

  // ── message rendering ─────────────────────────────────────────────────────
  // 2026-10-24 修正：原本只取聊天訊息（含系統訊息鏡像）。後來一度改成聊天／系統
  // 二選一分頁，但 Mike 要的其實是各自獨立的開關——兩個都開時依原始時間順序合併
  // 顯示（combinedLines 已經照順序記錄好每筆訊息的類型），關掉其中一個就濾掉那一類；
  // 切換開關時用 lastRoomData 直接重繪，不用等下一次輪詢。
  function renderCurrentView({ forceScrollBottom = false } = {}) {
    if (!lastRoomData) return;
    const wasNearBottom = isNearBottom();
    const prevScrollTop = el.msgs.scrollTop;
    const { combinedLines } = buildChatAndSystemLines(lastRoomData, account, roomId);
    const lines = combinedLines
      .filter((entry) => (entry.type === 'system' ? showSystem : showChat))
      .map((entry) => entry.html);
    if (!showChat && !showSystem) {
      el.msgs.innerHTML = '<p class="sh-fchat-empty">目前已關閉聊天與系統訊息顯示</p>';
    } else if (!lines.length) {
      el.msgs.innerHTML = '<p class="sh-fchat-empty">尚無訊息</p>';
    } else {
      el.msgs.innerHTML = lines.join('');
    }
    // 只有原本就在底部附近（或被明確要求）才自動跟到最新訊息，
    // 否則保持使用者原本的捲動位置，避免上滑看歷史訊息時畫面被強制拉回底部。
    if (forceScrollBottom || wasNearBottom) {
      scrollToBottom();
    } else {
      el.msgs.scrollTop = prevScrollTop;
    }
    updateScrollBottomBtn();
  }

  function renderAllMessages(roomData, opts = {}) {
    lastRoomData = roomData;
    renderCurrentView(opts);
  }

  // ── polling ───────────────────────────────────────────────────────────────
  async function poll() {
    const result = await callDispatch('get_room_state', {
      room_id: roomId,
      account: account || undefined,
    });
    if (!result?.ok) {
      if (result?.error?.code === 'ROOM_NOT_FOUND') {
        stopPolling();
        el.wrap.remove();
      }
      return;
    }
    const messages = Array.isArray(result?.data?.chat_messages)
      ? result.data.chat_messages : [];
    if (!messages.length) return;
    const maxId = Math.max(...messages.map((m) => Number(m.id || 0)));
    if (maxId <= lastSeenId) return;
    const newMsgs = messages.filter((m) => Number(m.id || 0) > lastSeenId);
    lastSeenId = maxId;
    if (collapsed) {
      newMsgs.forEach((m) => {
        if (String(m?.type || 'chat').toLowerCase() === 'system') unreadSystem += 1;
        else unreadChat += 1;
      });
      updateBadge();
    }
    renderAllMessages(result.data || {});
    const name = String(result?.data?.room?.village_name || '').trim();
    if (name) el.title.textContent = `聊天室・${name}`;
  }

  function startPolling() { pollTimer = window.setInterval(poll, POLL_MS); }
  function stopPolling() {
    if (pollTimer) { window.clearInterval(pollTimer); pollTimer = null; }
  }

  // ── send ──────────────────────────────────────────────────────────────────
  async function sendMessage() {
    if (isSending || !account) return;
    const text = String(el.input.value || '').trim();
    if (!text) return;
    if (countDisplayWidth(text) > 200) {
      el.input.setCustomValidity(t('room.chat.placeholder'));
      el.input.reportValidity();
      el.input.setCustomValidity('');
      return;
    }
    isSending = true;
    el.sendBtn.disabled = true;
    try {
      const result = await callDispatch('send_chat', { room_id: roomId, account, message: text });
      if (result?.ok) {
        el.input.value = '';
        setEmojiOpen(false);
        // 自己送出聊天訊息時，若目前關掉了「聊天」顯示，自動打開，讓使用者看到剛送出的內容。
        if (!showChat) setFilter('chat', true);
        const roomData = result?.data || {};
        const messages = Array.isArray(roomData?.chat_messages) ? roomData.chat_messages : [];
        if (messages.length) {
          const maxId = Math.max(...messages.map((m) => Number(m.id || 0)));
          lastSeenId = maxId;
        }
        renderAllMessages(roomData, { forceScrollBottom: true });
      }
    } finally {
      isSending = false;
      if (account) el.sendBtn.disabled = false;
    }
  }

  // ── events ────────────────────────────────────────────────────────────────
  el.toggleBtn.addEventListener('click', () => (collapsed ? expand() : collapse()));
  el.collapseBtn.addEventListener('click', () => { collapse(); el.toggleBtn.focus(); });

  el.sendBtn.addEventListener('click', sendMessage);
  el.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });

  el.panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (emojiOpen) { setEmojiOpen(false); return; }
      collapse();
      el.toggleBtn.focus();
    }
  });

  // 2026-11-11 新增：村民卡片上的「陣營猜測」徽章用的是純前端 localStorage，
  // 點擊切換時故意不整個房間重繪（見 ui.js 的 advanceCampGuess），所以浮動
  // 聊天室原本接不到這個變更，要等到整個網頁重新整理、或剛好有新訊息進來
  // 觸發 poll() 重繪時，才會跟著顯示最新的猜測顏色。這裡訂閱 ui.js 發出的
  // 全域事件，猜測一變更就立刻用目前已經拿到的資料重繪一次（不用多打 API，
  // 也不用等下一輪輪詢）。
  window.addEventListener('sh:campGuessChanged', () => renderCurrentView());

  // ── initialize ────────────────────────────────────────────────────────────
  renderAllMessages(initResult.data || {}, { forceScrollBottom: true });
  if (!collapsed) expand();

  startPolling();
}
