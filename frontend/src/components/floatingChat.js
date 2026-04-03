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
import { esc, apiFetch } from '../utils.js';

const POLL_MS = 8000;
const LS_KEY = 'sh.floatingChat.collapsed';

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

function buildMaskedChatHtml(roomData, account) {
  const { chatLines } = buildChatStageLines({
    messages: Array.isArray(roomData?.chat_messages) ? roomData.chat_messages : [],
    data: roomData || {},
    state: { account: String(account || '').trim() },
    esc,
    t,
    isReplayView: false,
    getCurrentUiLang,
    getCharacterLocalizedName,
    getLocalizedCardName: getLocalizedCardNameFallback,
  });
  return chatLines;
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
      <div class="sh-fchat-msgs" role="log" aria-live="polite" aria-label="聊天訊息" tabindex="0"></div>
      <div class="sh-fchat-foot">
        <div class="sh-fchat-emoji-panel" hidden>
          <div class="sh-fchat-emoji-grid">${buildEmojiGridHtml()}</div>
        </div>
        <div class="sh-fchat-foot-row">
          <button class="sh-fchat-emoji-toggle" type="button" aria-label="表情符號" aria-expanded="false">😊</button>
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
    msgs:        wrap.querySelector('.sh-fchat-msgs'),
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
  let emojiOpen = false;
  let unread = 0;
  let isSending = false;
  let pollTimer = null;

  // ── scroll helpers ────────────────────────────────────────────────────────
  function isNearBottom() {
    const { scrollTop, scrollHeight, clientHeight } = el.msgs;
    return scrollHeight - scrollTop - clientHeight < 60;
  }
  function scrollToBottom() { el.msgs.scrollTop = el.msgs.scrollHeight; }

  // ── badge ─────────────────────────────────────────────────────────────────
  function updateBadge() {
    if (unread > 0) {
      el.badge.hidden = false;
      el.badge.textContent = unread > 99 ? '99+' : String(unread);
    } else {
      el.badge.hidden = true;
    }
  }

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
    unread = 0;
    updateBadge();
    localStorage.setItem(LS_KEY, 'false');
    scrollToBottom();
    el.input.focus();
  }

  function collapse() {
    collapsed = true;
    el.panel.hidden = true;
    el.toggleBtn.setAttribute('aria-expanded', 'false');
    setEmojiOpen(false);
    localStorage.setItem(LS_KEY, 'true');
  }

  // ── message rendering ─────────────────────────────────────────────────────
  function renderAllMessages(roomData) {
    const chatLines = buildMaskedChatHtml(roomData, account);
    if (!chatLines.length) {
      el.msgs.innerHTML = '<p class="sh-fchat-empty">尚無訊息</p>';
    } else {
      el.msgs.innerHTML = chatLines.join('');
      // Floating chat should be read-only for card tokens to avoid panel overlap issues.
      el.msgs.querySelectorAll('.chat-card-token').forEach((tokenEl) => {
        tokenEl.removeAttribute('role');
        tokenEl.removeAttribute('tabindex');
        tokenEl.removeAttribute('data-card-name');
        tokenEl.removeAttribute('data-card-type');
        tokenEl.removeAttribute('data-card-color');
        tokenEl.setAttribute('aria-disabled', 'true');
      });
    }
    scrollToBottom();
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
      unread += newMsgs.length;
      updateBadge();
    }
    const keepBottom = isNearBottom();
    renderAllMessages(result.data || {});
    if (!keepBottom) {
      const { scrollHeight, clientHeight } = el.msgs;
      el.msgs.scrollTop = Math.max(0, scrollHeight - clientHeight - 20);
    }
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
    isSending = true;
    el.sendBtn.disabled = true;
    try {
      const result = await callDispatch('send_chat', { room_id: roomId, account, message: text });
      if (result?.ok) {
        el.input.value = '';
        setEmojiOpen(false);
        const roomData = result?.data || {};
        const messages = Array.isArray(roomData?.chat_messages) ? roomData.chat_messages : [];
        if (messages.length) {
          const maxId = Math.max(...messages.map((m) => Number(m.id || 0)));
          lastSeenId = maxId;
        }
        renderAllMessages(roomData);
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

  // ── initialize ────────────────────────────────────────────────────────────
  renderAllMessages(initResult.data || {});
  if (!collapsed) expand();

  startPolling();
}
