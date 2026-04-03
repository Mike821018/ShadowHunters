import { HIGU_CHAT_EMOJIS, getEmojiAssetPath } from './chatEmoji.js';

export function bindChatControls({
  el,
  state,
  dispatch,
  renderState,
  goToLobbyPage,
  getLatestRoomSnapshot,
}) {
  const esc = (value) => String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const insertEmojiCode = (code) => {
    if (!(el.chatInput instanceof HTMLTextAreaElement)) return;
    const input = el.chatInput;
    const start = Number(input.selectionStart ?? input.value.length);
    const end = Number(input.selectionEnd ?? input.value.length);
    const prefix = input.value.slice(0, start);
    const suffix = input.value.slice(end);
    input.value = `${prefix}${code}${suffix}`;
    const nextPos = start + code.length;
    input.setSelectionRange(nextPos, nextPos);
    input.focus();
  };

  const setEmojiPanelOpen = (open) => {
    if (!(el.chatEmojiPanel instanceof HTMLElement)) return;
    if (!(el.chatEmojiToggle instanceof HTMLElement)) return;
    el.chatEmojiPanel.hidden = !open;
    el.chatEmojiToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) return;
    const firstBtn = el.chatEmojiPanel.querySelector('.chat-emoji-item');
    if (firstBtn instanceof HTMLButtonElement) firstBtn.focus();
  };

  const ensureEmojiPanel = () => {
    if (!(el.chatEmojiGrid instanceof HTMLElement)) return;
    if (el.chatEmojiGrid.dataset.bound === 'true') return;
    el.chatEmojiGrid.innerHTML = HIGU_CHAT_EMOJIS.map((emoji) => {
      const src = getEmojiAssetPath(emoji.filename);
      const title = `${emoji.code}`;
      return `<button class="chat-emoji-item" type="button" data-emoji-code="${esc(emoji.code)}" title="${esc(title)}"><img src="${src}" alt="${esc(emoji.code)}"><span>${esc(emoji.code)}</span></button>`;
    }).join('');
    el.chatEmojiGrid.dataset.bound = 'true';

    el.chatEmojiGrid.addEventListener('click', (event) => {
      const button = event.target instanceof HTMLElement ? event.target.closest('.chat-emoji-item') : null;
      if (!(button instanceof HTMLButtonElement)) return;
      const code = String(button.dataset.emojiCode || '').trim();
      if (!code) return;
      insertEmojiCode(code);
      setEmojiPanelOpen(false);
      if (el.chatEmojiToggle instanceof HTMLElement) el.chatEmojiToggle.focus();
    });
  };

  ensureEmojiPanel();

  if (el.chatEmojiToggle) {
    el.chatEmojiToggle.addEventListener('click', () => {
      const isOpen = !(el.chatEmojiPanel?.hidden ?? true);
      setEmojiPanelOpen(!isOpen);
    });
  }

  if (el.chatEmojiClose) {
    el.chatEmojiClose.addEventListener('click', () => {
      setEmojiPanelOpen(false);
      if (el.chatEmojiToggle instanceof HTMLElement) el.chatEmojiToggle.focus();
    });
  }

  if (el.chatEmojiPanel) {
    el.chatEmojiPanel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setEmojiPanelOpen(false);
      if (el.chatEmojiToggle instanceof HTMLElement) el.chatEmojiToggle.focus();
    });
  }

  document.addEventListener('mousedown', (event) => {
    if (!(el.chatEmojiPanel instanceof HTMLElement) || !(el.chatEmojiToggle instanceof HTMLElement)) return;
    if (el.chatEmojiPanel.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (el.chatEmojiPanel.contains(target)) return;
    if (el.chatEmojiToggle.contains(target)) return;
    setEmojiPanelOpen(false);
  });

  const sendChatMessage = async () => {
    if (String(state?.page || '') === 'replay-room') return;
    const latestRoomSnapshot = getLatestRoomSnapshot();
    const roomId = Number(state.roomId || latestRoomSnapshot?.room?.room_id || 0);
    const account = String(state.account || '').trim();
    const text = String(el.chatInput?.value || '').trim();
    if (!roomId || !account || !text) return;
    try {
      const data = await dispatch('send_chat', {
        room_id: roomId,
        account,
        message: text,
      });
      if (el.chatInput) el.chatInput.value = '';
      setEmojiPanelOpen(false);
      renderState(data);
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    }
  };

  if (el.chatSendButton) {
    el.chatSendButton.addEventListener('click', () => {
      void sendChatMessage();
    });
  }
  if (el.chatInput) {
    el.chatInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        setEmojiPanelOpen(false);
        return;
      }
      if (event.key !== 'Enter') return;
      if (event.shiftKey) return;
      event.preventDefault();
      void sendChatMessage();
    });
  }
}
