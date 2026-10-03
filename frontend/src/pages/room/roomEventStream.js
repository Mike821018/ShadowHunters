let roomEventSource = null;

export function clearRoomEventSource() {
  if (roomEventSource) {
    try {
      roomEventSource.close();
    } catch (error) {
      // ignore: the connection may already be closed
    }
    roomEventSource = null;
  }
}

export function connectRoomEventStream({ state, dispatch, renderState, toast, t, goToLobbyPage }) {
  clearRoomEventSource();
  if (typeof window === 'undefined' || typeof window.EventSource !== 'function') return;
  if (String(state?.page || '') === 'replay-room') return;
  const roomId = Number(state?.roomId || 0);
  if (!roomId) return;

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
      console.error('Failed to sync room state from event stream', error);
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
    // Last-Event-ID), and the existing countdown-based refresh setting
    // still works as a manual fallback in the meantime, so there is
    // nothing else to do here.
  };
}
