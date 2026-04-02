export function bindChatControls({
  el,
  state,
  dispatch,
  renderState,
  goToLobbyPage,
  getLatestRoomSnapshot,
}) {
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
      if (event.key !== 'Enter') return;
      if (event.shiftKey) return;
      event.preventDefault();
      void sendChatMessage();
    });
  }
}
