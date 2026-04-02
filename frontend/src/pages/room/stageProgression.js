export function createStageProgressionHandlers({
  el,
  state,
  dispatch,
  renderState,
  toast,
  t,
  goToLobbyPage,
  getLatestRoomSnapshot,
  getMoveAreaPromptState,
  getPendingStealState,
  getEquipmentConfirmPromptState,
  getGreenConfirmPromptState,
  getCardPromptState,
  getPendingDiceAction,
  clearPendingDiceAction,
  getDiceRollBusy,
  setDiceRollBusy,
  getDiceRollAnimating,
  getStageNextStepBusy,
  setStageNextStepBusy,
  updateStageNextStepButtonState,
  normalizeDiceValue,
  playDiceAnimation,
  waitDiceAnimationComplete,
  setPendingGreenCardChoice,
  confirmPendingGreenCard,
  confirmEquipment,
  useActiveCard,
  openGreenChoiceDialog,
}) {
  const rollDiceFromCenter = async () => {
    if (!state.roomId || getDiceRollBusy()) return;

    const dataSnapshot = getLatestRoomSnapshot();
    const selfAccount = String(state.account || '').trim();
    const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
    const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
    const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
    const movePrompt = getMoveAreaPromptState(state, dataSnapshot);
    const pendingDiceAction = getPendingDiceAction();
    const canRoll = Boolean(
      state.roomId
      && selfAccount
      && roomStatus === 2
      && (
        Boolean(pendingDiceAction)
        || (
          currentAccount === selfAccount
          && (
            (selfStatus === 2 && !movePrompt.active)
            || selfStatus === 5
          )
        )
      )
    );
    if (!canRoll) return;

    setDiceRollBusy(true);
    updateStageNextStepButtonState(state, dataSnapshot);
    try {
      if (pendingDiceAction?.execute) {
        const queuedAction = pendingDiceAction;
        const data = await queuedAction.execute();
        const finalD6 = normalizeDiceValue(data?.dice?.D6, 6);
        const finalD4 = normalizeDiceValue(data?.dice?.D4, 4);
        playDiceAnimation(finalD6, finalD4, queuedAction.mode || 'both');
        await waitDiceAnimationComplete();
        clearPendingDiceAction();
        renderState(data);
        toast(t(queuedAction.toastKey || 'toast.next_step_ok'));
        if (typeof queuedAction.afterRender === 'function') {
          await queuedAction.afterRender(data);
        }
        return;
      }

      const selfEquipment = Array.isArray(dataSnapshot?.players?.[selfAccount]?.equipment)
        ? dataSnapshot.players[selfAccount].equipment
        : [];
      const selfAtkType = Number(dataSnapshot?.players?.[selfAccount]?.self_atk_type || 1);
      const rollMode = selfStatus === 5 && (selfEquipment.includes('Masamune') || selfAtkType === 2) ? 'd4' : 'both';
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: false,
        target: { kind: 'none' },
      });
      const finalD6 = normalizeDiceValue(data?.dice?.D6, 6);
      const finalD4 = normalizeDiceValue(data?.dice?.D4, 4);
      playDiceAnimation(finalD6, finalD4, rollMode);

      await waitDiceAnimationComplete();

      renderState(data);
      toast(t('toast.next_step_ok'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      setDiceRollBusy(false);
      updateStageNextStepButtonState(state);
    }
  };

  const runStageNextStep = async () => {
    if (!state.roomId || !state.account || getStageNextStepBusy() || getDiceRollBusy() || getDiceRollAnimating()) return;

    const dataSnapshot = getLatestRoomSnapshot();
    const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
    const selfAccount = String(state.account || '').trim();
    const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
    const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
    const pendingSteal = getPendingStealState(state, dataSnapshot);
    const equipmentConfirm = getEquipmentConfirmPromptState(state, dataSnapshot);
    const greenConfirm = getGreenConfirmPromptState(state, dataSnapshot);
    const cardPrompt = getCardPromptState(state, dataSnapshot);

    if (greenConfirm.waitingConfirm) {
      if (greenConfirm.canSetChoice && greenConfirm.needsChoice) {
        const selected = await openGreenChoiceDialog({
          title: t('room.green_choice.title'),
          message: t('room.green_choice.message'),
          activateLabel: t('room.green_choice.activate'),
          skipLabel: t('room.green_choice.skip'),
          cancelLabel: t('room.area_choice.cancel'),
          currentChoice: greenConfirm.choice,
        });
        if (selected) {
          await setPendingGreenCardChoice(selected);
          await confirmPendingGreenCard();
        }
        return;
      }
      await confirmPendingGreenCard();
      return;
    }
    if (equipmentConfirm.canConfirm) {
      await confirmEquipment();
      return;
    }
    if (roomStatus !== 2 || !selfAccount || selfAccount !== currentAccount) return;
    if (greenConfirm.active) return;
    if (selfStatus === 2 || selfStatus === 5) {
      await rollDiceFromCenter();
      return;
    }
    if (selfStatus === 3) {
      if (pendingSteal.active) return;
      if (cardPrompt.active) {
        if (['self', 'others', 'all', 'area'].includes(cardPrompt.target)) {
          await useActiveCard({ kind: 'none' });
        }
        return;
      }
    }

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state, dataSnapshot);
    try {
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: false,
        target: { kind: 'none' },
      });
      renderState(data);
      toast(t('toast.next_step_ok'));
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
    rollDiceFromCenter,
    runStageNextStep,
  };
}