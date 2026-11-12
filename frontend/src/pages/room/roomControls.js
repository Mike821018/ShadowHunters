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

  // 2026-11-11 新增：手機版快速選取玩家列點頭像時，先彈出完整卡片（跟點場地卡上
  // 玩家 token 一樣的 stageOccupantCardPopup）還是直接動作（原本行為），開關跟
  // 「二次確認」「自動結束回合」放在同一個設定區塊，方便一起管理。
  const applyQuickAvatarPopupFirstSetting = (enabled) => {
    state.quickAvatarPopupFirst = Boolean(enabled);
    persistSession(state);
    renderAutoRefreshControls({
      el,
      state,
      onToggleSkipTargetConfirm: applySkipTargetConfirmSetting,
      onToggleAutoEndTurn: applyAutoEndTurnSetting,
      onToggleQuickAvatarPopupFirst: applyQuickAvatarPopupFirstSetting,
    });
    toast(state.quickAvatarPopupFirst ? t('toast.quick_avatar_popup_first_on') : t('toast.quick_avatar_popup_first_off'));
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
      onToggleQuickAvatarPopupFirst: applyQuickAvatarPopupFirstSetting,
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

  // 2026-11-11 修正：Mike 要求「返回大廳」這類導覽按鈕要支援中鍵開新分頁、右鍵開
  // 瀏覽器選單——這本來就是 <a href> 連結的原生行為，<button> 完全沒有。room.html／
  // replay_room.html 已經把這顆按鈕換成 <a href="./lobby.html">（見那兩個檔案），
  // 這裡改成只在「單純左鍵點擊、沒有按住任何修飾鍵」時才 preventDefault 並走原本的
  // JS 導覽流程（清掉計時器/連線、呼叫 goToLobbyPage 讓它先存 session 再換頁）；
  // 中鍵、Ctrl/Cmd+左鍵、Shift+左鍵都放行不擋，讓瀏覽器原生在新分頁/新視窗開啟，
  // 這種情況不應該清掉目前這個分頁還在用的計時器跟連線。
  el.btnRoomBackLobby?.addEventListener('click', (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
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
