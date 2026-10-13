let roomEventSource = null;
let roomFallbackPollTimer = null;

// 2026-10-09 修正：Mike 回報拿掉「自動更新秒數」設定後，主畫面（場地卡／骰子／
// 玩家卡片等）不會自動更新，但浮動聊天室照常會動；查證後發現浮動聊天室
// （floatingChat.js）本來就有自己獨立的 8 秒輪詢（跟這裡的 SSE 完全無關，從來
// 沒有依賴過這條即時連線），而主畫面在拿掉「自動更新秒數」那組輪詢設定之後，
// 現在完全只靠這條 SSE 連線更新——如果 SSE 連線在某些部署環境（例如透過
// Cloudflare Quick Tunnel 這類代理）沒有確實送達事件，主畫面就會整個停住不動，
// 跟浮動聊天室的行為不一致。
// 修正方式：幫主畫面補上一條跟浮動聊天室一樣的安靜背景輪詢，當作 SSE 的保險；
// 不在畫面上開放使用者調整（不恢復原本的「自動更新秒數」按鈕），純粹是內部
// 保底機制，跟 SSE 連線並存——SSE 正常工作時，輪詢只是偶爾重複抓到一樣的資料，
// renderState 本身有以 __clientRequestSeq 排序、不會讓舊資料蓋掉新資料；SSE
// 不工作時，主畫面仍然可以靠這條輪詢在幾秒內跟上最新狀態。
// 2026-10-10 修正：Mike 要求更新頻率再快一點，從 8 秒加快到 3 秒，跟下面
// floatingChat.js 的輪詢頻率保持一致。
const ROOM_FALLBACK_POLL_MS = 3000;

export function clearRoomEventSource() {
  if (roomEventSource) {
    try {
      roomEventSource.close();
    } catch (error) {
      // ignore: the connection may already be closed
    }
    roomEventSource = null;
  }
  if (roomFallbackPollTimer) {
    window.clearInterval(roomFallbackPollTimer);
    roomFallbackPollTimer = null;
  }
}

export function connectRoomEventStream({ state, dispatch, renderState, toast, t, goToLobbyPage }) {
  clearRoomEventSource();
  if (String(state?.page || '') === 'replay-room') return;
  const roomId = Number(state?.roomId || 0);
  if (!roomId) return;

  const fetchAndRender = async () => {
    if (!state.roomId) return;
    try {
      const latest = await dispatch('get_room_state', {
        room_id: state.roomId,
        account: state.account || undefined,
      }, { silent: true });
      renderState(latest);
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        clearRoomEventSource();
        toast(t('toast.village_gone'), 'error');
        goToLobbyPage();
        return;
      }
      console.error('Failed to sync room state', error);
    }
  };

  // 安靜的背景輪詢保底機制（見檔案開頭說明），不論 SSE 是否可用都會啟動。
  roomFallbackPollTimer = window.setInterval(fetchAndRender, ROOM_FALLBACK_POLL_MS);

  if (typeof window === 'undefined' || typeof window.EventSource !== 'function') return;

  const query = new URLSearchParams({ room_id: String(roomId) });
  if (state.account) query.set('account', String(state.account));

  const source = new EventSource(`/api/room_events?${query.toString()}`);
  roomEventSource = source;

  // The server pushes a lightweight "room_state_changed" ping whenever an
  // action mutates the room; fetch the authoritative full state and render
  // it, rather than trusting a state snapshot embedded in the event itself.
  source.addEventListener('room_state_changed', async (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'));
      const payloadRoomId = Number(payload?.room_id || 0);
      if (!payloadRoomId || payloadRoomId !== Number(state.roomId || 0)) return;
      await fetchAndRender();
    } catch (error) {
      console.error('Failed to parse room_state_changed event', error);
    }
  });

  source.addEventListener('room_closed', (event) => {
    try {
      const payload = JSON.parse(String(event?.data || '{}'));
      const payloadRoomId = Number(payload?.room_id || 0);
      if (payloadRoomId && payloadRoomId === Number(state.roomId || 0)) {
        clearRoomEventSource();
        toast(t('toast.village_gone'), 'error');
        goToLobbyPage();
      }
    } catch (error) {
      console.error('Failed to parse room_closed event', error);
    }
  });

  source.onerror = () => {
    // The browser retries the connection on its own (resuming from
    // Last-Event-ID); the background fallback poll above keeps the main
    // screen updating in the meantime regardless of SSE connection state.
  };
}
