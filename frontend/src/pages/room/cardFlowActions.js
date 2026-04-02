export function createCardFlowHandlers({
  state,
  dispatch,
  renderState,
  toast,
  t,
  goToLobbyPage,
  getStageNextStepBusy,
  setStageNextStepBusy,
  updateStageNextStepButtonState,
  getPendingStealState,
  getPendingKillLootState,
  openEquipmentChoiceDialog,
  localizeEquipmentOption,
  getLatestRoomSnapshot,
  getCardDiceAnimationMeta,
  setPendingDiceAction,
  openGreenChoiceDialog,
  openConfirmDialog,
}) {
  const maybeResolvePendingSteal = async (dataSnapshot) => {
    const pendingSteal = getPendingStealState(state, dataSnapshot);
    if (!pendingSteal.active || !pendingSteal.fromAccount || !pendingSteal.toAccount || !pendingSteal.equipmentNames.length) return;

    const fromPlayer = dataSnapshot?.players?.[pendingSteal.fromAccount];
    const equipmentName = await openEquipmentChoiceDialog({
      title: pendingSteal.source || t('room.equipment_choice.title'),
      message: t('room.equipment_choice.message', { name: fromPlayer?.name || pendingSteal.fromAccount }),
      options: pendingSteal.equipmentNames.map(localizeEquipmentOption),
      cancelLabel: t('room.area_choice.cancel'),
    });

    if (!equipmentName) {
      toast(t('toast.area_choice_cancelled'));
      return;
    }

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state, dataSnapshot);
    try {
      const data = await dispatch('steal_equipment', {
        room_id: state.roomId,
        account: state.account || undefined,
        from_account: pendingSteal.fromAccount,
        to_account: pendingSteal.toAccount,
        equipment_name: equipmentName,
      });
      renderState(data);
      toast(t('toast.steal_ok'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      setStageNextStepBusy(false);
      updateStageNextStepButtonState(state);
    }
  };

  const resolvePendingKillLoot = async (targetAccount, dataSnapshot = getLatestRoomSnapshot()) => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;
    const pendingKillLoot = getPendingKillLootState(state, dataSnapshot);
    const normalizedTarget = String(targetAccount || '').trim();
    if (!pendingKillLoot.active || !normalizedTarget || !pendingKillLoot.deathAccounts.includes(normalizedTarget)) return;

    const deadPlayer = dataSnapshot?.players?.[normalizedTarget] || null;
    const equipmentNames = Array.isArray(deadPlayer?.equipment)
      ? deadPlayer.equipment.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (!equipmentNames.length) return;

    let takeAll = false;
    let equipmentName = equipmentNames[0];

    if (pendingKillLoot.allowFull && equipmentNames.length > 1) {
      takeAll = await openConfirmDialog({
        title: t('room.confirm.title'),
        message: t('toast.loot_take_all_confirm'),
        confirmLabel: t('room.confirm.confirm'),
        cancelLabel: t('room.confirm.cancel'),
      });
    }

    if (!takeAll) {
      equipmentName = await openEquipmentChoiceDialog({
        title: t('room.equipment_choice.title'),
        message: t('room.equipment_choice.message', { name: deadPlayer?.name || normalizedTarget }),
        options: equipmentNames.map(localizeEquipmentOption),
        cancelLabel: t('room.area_choice.cancel'),
      });
      if (!equipmentName) {
        toast(t('toast.area_choice_cancelled'));
        return;
      }
    }

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state, dataSnapshot);
    try {
      const payload = {
        room_id: state.roomId,
        account: state.account || undefined,
        from_account: normalizedTarget,
        take_all: takeAll,
      };
      if (!takeAll) {
        payload.equipment_name = equipmentName;
      }
      const lootData = await dispatch('loot_from_kill', payload);
      renderState(lootData);

      const stillPending = Array.isArray(lootData?.pending_kill_loot?.death_accounts)
        && lootData.pending_kill_loot.death_accounts.length > 0;
      if (!stillPending) {
        const nextData = await dispatch('next_step', {
          room_id: state.roomId,
          account: state.account || undefined,
          action: false,
          target: { kind: 'none' },
        });
        renderState(nextData);
      }
      toast(t('toast.loot_ok'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      setStageNextStepBusy(false);
      updateStageNextStepButtonState(state);
    }
  };

  const useActiveCard = async (target = { kind: 'none' }) => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;

    const latestRoomSnapshot = getLatestRoomSnapshot();
    const activeCardName = String(latestRoomSnapshot?.active_card?.name || '').trim();
    const cardDiceMeta = getCardDiceAnimationMeta(activeCardName);
    const selfCamp = String(latestRoomSnapshot?.players?.[state.account || '']?.self_character_camp || '').trim();
    let optionalChoice = '';
    if (activeCardName === 'Diabolic Ritual' && selfCamp === 'Shadow') {
      const selected = await openGreenChoiceDialog({
        title: t('room.optional_card_choice.title'),
        message: t('room.optional_card_choice.message', { card: t('room.active_card.names.Diabolic Ritual') }),
        activateLabel: t('room.green_choice.activate'),
        skipLabel: t('room.green_choice.skip'),
        cancelLabel: t('room.area_choice.cancel'),
      });
      if (!selected) return;
      optionalChoice = selected;
    }

    const payload = {
      room_id: state.roomId,
      account: state.account || undefined,
      target,
    };
    if (optionalChoice) payload.choice = optionalChoice;

    if (cardDiceMeta) {
      setPendingDiceAction({
        labelKey: cardDiceMeta.labelKey,
        mode: cardDiceMeta.mode,
        toastKey: 'toast.card_effect_ok',
        execute: () => dispatch('card_effect', payload),
        afterRender: async (data) => {
          await maybeResolvePendingSteal(data);
        },
      });
      updateStageNextStepButtonState(state, latestRoomSnapshot);
      return;
    }

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('card_effect', payload);
      renderState(data);
      toast(t('toast.card_effect_ok'));
      await maybeResolvePendingSteal(data);
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      setStageNextStepBusy(false);
      updateStageNextStepButtonState(state);
    }
  };

  const setPendingGreenCardChoice = async (choice) => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;
    let normalizedChoice = String(choice || '').trim().toLowerCase();
    if (normalizedChoice === 'effect1') normalizedChoice = 'activate';
    if (normalizedChoice === 'effect2') normalizedChoice = 'skip';
    if (!['activate', 'skip'].includes(normalizedChoice)) return;
    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('set_green_card_choice', {
        room_id: state.roomId,
        account: state.account || undefined,
        choice: normalizedChoice,
      });
      renderState(data);
      toast(t('toast.green_choice_set'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      setStageNextStepBusy(false);
      updateStageNextStepButtonState(state);
    }
  };

  const confirmPendingGreenCard = async () => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;
    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('confirm_green_card', {
        room_id: state.roomId,
        account: state.account || undefined,
      });
      renderState(data);
      toast(t('toast.green_confirmed'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      setStageNextStepBusy(false);
      updateStageNextStepButtonState(state);
    }
  };

  const confirmEquipment = async () => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;
    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('confirm_equipment', {
        room_id: state.roomId,
        account: state.account || undefined,
      });
      renderState(data);
      toast(t('toast.equipment_equipped'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      setStageNextStepBusy(false);
      updateStageNextStepButtonState(state);
    }
  };

  return {
    maybeResolvePendingSteal,
    resolvePendingKillLoot,
    useActiveCard,
    setPendingGreenCardChoice,
    confirmPendingGreenCard,
    confirmEquipment,
  };
}