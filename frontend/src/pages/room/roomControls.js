import { clearRoomEventSource } from './roomEventStream.js';

export function bindRoomControls({
  el,
  state,
  dispatch,
  renderState,
  toast,
  t,
  goToLobbyPage,
  persistSession,
  clearRoomAutoRefreshTimer,
  renderAutoRefreshControls,
}) {
  const applySkipTargetConfirmSetting = (enabled) => {
    state.skipTargetConfirm = Boolean(enabled);
    persistSession(state);
    renderAutoRefreshControls({
      el,
      state,
      onToggleSkipTargetConfirm: applySkipTargetConfirmSetting,
      onToggleAutoEndTurn: applyAutoEndTurnSetting,
    });
    toast(state.skipTargetConfirm ? t('toast.target_confirm_skip_off') : t('toast.target_confirm_skip_on'));
  };

  const applyAutoEndTurnSetting = (enabled) => {
    state.autoEndTurn = Boolean(enabled);
    persistSession(state);
    renderAutoRefreshControls({
      el,
      state,
      onToggleSkipTargetConfirm: applySkipTargetConfirmSetting,
      onToggleAutoEndTurn: applyAutoEndTurnSetting,
    });
    toast(state.autoEndTurn ? t('toast.auto_end_turn_on') : t('toast.auto_end_turn_off'));
  };

  const isReplayPage = String(state?.page || '') === 'replay-room';
  if (isReplayPage) {
    clearRoomAutoRefreshTimer();
    clearRoomEventSource();
    if (el.autoRefreshOptions) el.autoRefreshOptions.innerHTML = '';
  } else {
    renderAutoRefreshControls({
      el,
      state,
      onToggleSkipTargetConfirm: applySkipTargetConfirmSetting,
      onToggleAutoEndTurn: applyAutoEndTurnSetting,
    });
  }

  el.btnUseQuickPlayer?.addEventListener('click', () => {
    const v = el.quickPlayerTarget.value;
    if (!v) return;
    el.targetKind.value = 'player';
    el.targetId.value = v;
  });

  el.btnUseQuickArea?.addEventListener('click', () => {
    const v = el.quickAreaTarget.value;
    if (!v) return;
    el.targetKind.value = 'area';
    el.targetId.value = v;
  });

  el.btnRoomBackLobby?.addEventListener('click', () => {
    clearRoomAutoRefreshTimer();
    clearRoomEventSource();
    goToLobbyPage();
  });

  el.btnRoomRefresh?.addEventListener('click', async () => {
    if (!state.roomId) return;
    try {
      const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined });
      renderState(data);
      toast(t('toast.refreshed'));
    } catch (error) {
      if (error.code === 'ROOM_NOT_FOUND') goToLobbyPage();
    }
  });
}
