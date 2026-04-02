import { AUTO_REFRESH_OPTIONS } from '../../constants.js';

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
  setRoomAutoRefreshTimer,
  renderAutoRefreshControls,
}) {
  const syncAutoRefreshTimer = () => {
    clearRoomAutoRefreshTimer();
    const seconds = Number(state.autoRefreshSeconds || 0);
    if (!seconds || !state.roomId) return;

    setRoomAutoRefreshTimer(window.setInterval(async () => {
      if (!state.roomId) return;
      try {
        const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined }, { silent: true });
        renderState(data);
      } catch (error) {
        if (error.code === 'ROOM_NOT_FOUND') {
          clearRoomAutoRefreshTimer();
          toast(t('toast.village_gone'), 'error');
          goToLobbyPage();
          return;
        }
        clearRoomAutoRefreshTimer();
        state.autoRefreshSeconds = 0;
        persistSession(state);
        renderAutoRefreshControls({
          el,
          state,
          onSelect: applyAutoRefreshSetting,
          onToggleSkipTargetConfirm: applySkipTargetConfirmSetting,
        });
        toast(t('toast.auto_fail'), 'error');
        console.error(error);
      }
    }, seconds * 1000));
  };

  const applyAutoRefreshSetting = async (seconds) => {
    state.autoRefreshSeconds = AUTO_REFRESH_OPTIONS.includes(seconds) ? seconds : 0;
    persistSession(state);
    renderAutoRefreshControls({
      el,
      state,
      onSelect: applyAutoRefreshSetting,
      onToggleSkipTargetConfirm: applySkipTargetConfirmSetting,
    });
    if (state.autoRefreshSeconds > 0) {
      // Issue 35.3: 點擊設定時立即刷新一次
      try {
        const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined }, { silent: true });
        renderState(data);
      } catch (error) {
        console.error('Immediate refresh failed:', error);
      }
    }
    syncAutoRefreshTimer();
    toast(state.autoRefreshSeconds === 0 ? t('toast.auto_off') : t('toast.auto_on', { n: state.autoRefreshSeconds }));
  };

  const applySkipTargetConfirmSetting = (enabled) => {
    state.skipTargetConfirm = Boolean(enabled);
    persistSession(state);
    renderAutoRefreshControls({
      el,
      state,
      onSelect: applyAutoRefreshSetting,
      onToggleSkipTargetConfirm: applySkipTargetConfirmSetting,
    });
    toast(state.skipTargetConfirm ? t('toast.target_confirm_skip_off') : t('toast.target_confirm_skip_on'));
  };

  const isReplayPage = String(state?.page || '') === 'replay-room';
  if (isReplayPage) {
    clearRoomAutoRefreshTimer();
    if (el.autoRefreshOptions) el.autoRefreshOptions.innerHTML = '';
  } else {
    renderAutoRefreshControls({
      el,
      state,
      onSelect: applyAutoRefreshSetting,
      onToggleSkipTargetConfirm: applySkipTargetConfirmSetting,
    });
    syncAutoRefreshTimer();
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
