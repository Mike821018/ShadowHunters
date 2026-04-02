export function bindVillageControls({
  el,
  state,
  dispatch,
  renderState,
  setVillageInfoMessage,
  refreshRooms,
  goToLobbyPage,
  clearRoomAutoRefreshTimer,
  clearRoomAccount,
  persistSession,
  cardFlagsToExpansionMode,
  latestRoomSnapshotRef,
  toast,
  t,
}) {
  const leaveVillage = async () => {
    if (!state.roomId || !state.account) return;
    const leavingRoomId = state.roomId;
    await dispatch('leave_room', { room_id: state.roomId, account: state.account });
    clearRoomAutoRefreshTimer();
    clearRoomAccount(state, leavingRoomId);
    state.roomId = null;
    persistSession(state);
    setVillageInfoMessage(t('room.info.not_joined'));
    renderState({ players: {} });
    await refreshRooms();
    toast(t('toast.left_village'));
    goToLobbyPage();
  };

  const abolishVillage = async () => {
    if (!state.roomId || !state.account) return;
    const abolishRoomId = state.roomId;
    await dispatch('abolish_room', { room_id: state.roomId, account: state.account });
    clearRoomAutoRefreshTimer();
    clearRoomAccount(state, abolishRoomId);
    state.roomId = null;
    persistSession(state);
    setVillageInfoMessage(t('room.info.not_joined'));
    renderState({ players: {} });
    await refreshRooms();
    toast(t('toast.village_abolished'));
    goToLobbyPage();
  };

  const toggleReady = async () => {
    if (!state.roomId || !state.account) return;
    const data = await dispatch('toggle_ready', { room_id: state.roomId, account: state.account });
    renderState(data);
    if (Number(data?.room?.room_status || 0) === 2) {
      toast(t('toast.game_started'));
      return;
    }
    const self = data?.players?.[state.account];
    toast(self?.is_ready ? t('toast.ready_on') : t('toast.ready_off'));
  };

  const rollCallVillage = async () => {
    if (!state.roomId || !state.account) return;
    const data = await dispatch('roll_call', { room_id: state.roomId, account: state.account });
    renderState(data);
    toast(t('toast.roll_call_done'));
  };

  const updateVillageSettings = async (patch = {}) => {
    if (!state.roomId || !state.account) return;
    const roomInfo = latestRoomSnapshotRef()?.room || {};
    try {
      const data = await dispatch('update_room_settings', {
        room_id: state.roomId,
        account: state.account,
        expansion_mode: patch.expansion_mode ?? String(roomInfo.expansion_mode || 'all'),
        turn_timeout_minutes: patch.turn_timeout_minutes ?? Number(roomInfo.turn_timeout_minutes || 3),
        enable_initial_green_card: patch.enable_initial_green_card ?? Boolean(roomInfo.enable_initial_green_card),
      });
      renderState(data);
      toast(t('room.settings.updated'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    }
  };

  el.btnLeaveRoom?.addEventListener('click', leaveVillage);

  el.villageInfoList?.addEventListener('click', (event) => {
    const leaveTarget = event.target instanceof Element ? event.target.closest('#btnLeaveVillageInline') : null;
    if (leaveTarget) {
      leaveVillage();
      return;
    }
    const abolishTarget = event.target instanceof Element ? event.target.closest('#btnAbolishVillageInline') : null;
    if (abolishTarget) {
      abolishVillage();
      return;
    }
    const readyTarget = event.target instanceof Element ? event.target.closest('#btnToggleReadyInline') : null;
    if (readyTarget) {
      toggleReady();
      return;
    }
    const rollCallTarget = event.target instanceof Element ? event.target.closest('#btnRollCallInline') : null;
    if (rollCallTarget) {
      rollCallVillage();
      return;
    }
    const editSettingsTarget = event.target instanceof Element ? event.target.closest('#btnEditRoomSettingsInline') : null;
    if (editSettingsTarget) {
      const dialog = el.villageInfoList?.querySelector('#btnEditRoomSettingsDialog');
      if (dialog instanceof HTMLDialogElement) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', 'open');
        }
      }
      return;
    }
    const closeSettingsTarget = event.target instanceof Element ? event.target.closest('[data-close-village-settings]') : null;
    if (closeSettingsTarget) {
      const dialog = el.villageInfoList?.querySelector('#btnEditRoomSettingsDialog');
      if (dialog instanceof HTMLDialogElement && dialog.open) {
        dialog.close();
      }
    }
  });

  el.villageInfoList?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches('[data-setting-timeout-select]')) {
      return;
    }

    if (target.matches('[data-setting-initial-green-check]')) {
      return;
    }

    if (target.matches('[data-setting-basic-check], [data-setting-extend-check]')) {
      const basicCheck = el.villageInfoList?.querySelector('[data-setting-basic-check]');
      const extendCheck = el.villageInfoList?.querySelector('[data-setting-extend-check]');
      const useBasic = Boolean(basicCheck?.checked);
      const useExtend = Boolean(extendCheck?.checked);
      const nextMode = cardFlagsToExpansionMode(useBasic, useExtend);
      if (!nextMode) {
        target.checked = true;
        toast(t('lobby.create.expansion_mode_required'), 'error');
      }
    }
  });

  el.villageInfoList?.addEventListener('click', async (event) => {
    const saveSettingsTarget = event.target instanceof Element ? event.target.closest('[data-save-village-settings]') : null;
    if (!saveSettingsTarget) return;

    const dialog = el.villageInfoList?.querySelector('#btnEditRoomSettingsDialog');
    if (!(dialog instanceof HTMLDialogElement)) return;

    const timeoutSelect = dialog.querySelector('[data-setting-timeout-select]');
    const basicCheck = dialog.querySelector('[data-setting-basic-check]');
    const extendCheck = dialog.querySelector('[data-setting-extend-check]');
    const initialGreenCheck = dialog.querySelector('[data-setting-initial-green-check]');

    const turnTimeoutMinutes = Number.parseInt(String(timeoutSelect?.value || ''), 10);
    const useBasic = Boolean(basicCheck?.checked);
    const useExtend = Boolean(extendCheck?.checked);
    const expansionMode = cardFlagsToExpansionMode(useBasic, useExtend);

    if (!expansionMode) {
      toast(t('lobby.create.expansion_mode_required'), 'error');
      return;
    }
    if (![2, 3, 5, 10, 20, 30].includes(turnTimeoutMinutes)) {
      toast(t('room.settings.invalid_turn_timeout'), 'error');
      return;
    }

    await updateVillageSettings({
      expansion_mode: expansionMode,
      turn_timeout_minutes: turnTimeoutMinutes,
      enable_initial_green_card: Boolean(initialGreenCheck?.checked),
    });

    if (dialog.open) {
      dialog.close();
    }
  });
}
