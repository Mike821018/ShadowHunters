export function createAbilityActivationHandlers({
  state,
  dispatch,
  renderState,
  toast,
  t,
  goToLobbyPage,
  getPendingAbilityActivation,
  setPendingAbilityActivation,
  clearPendingAbilityActivation,
  getSelfAbilityState,
  canActivateSelfAbilityFromCard,
  getAbilityDiceAnimationMode,
  normalizeDiceValue,
  playDiceAnimation,
  waitDiceAnimationComplete,
  updateStageNextStepButtonState,
  setPendingDiceAction,
  getLatestRoomSnapshot,
  isAbilityPlayerTarget,
  getDiscardEquipmentOptions,
  openDiscardChoiceDialog,
  openConfirmDialog,
}) {
  const activateSelfAbility = async (target = { kind: 'none' }) => {
    if (!state.roomId || !state.account) return;
    const pendingAbilityActivation = getPendingAbilityActivation();
    const abilityCharacter = String(
      pendingAbilityActivation?.character
      || getSelfAbilityState(state)?.character
      || ''
    ).trim();
    const abilityDiceMode = getAbilityDiceAnimationMode(abilityCharacter);
    if (abilityDiceMode) {
      setPendingDiceAction({ labelKey: 'room.table_next_step.roll_damage_dice' });
      updateStageNextStepButtonState(state);
    }
    try {
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: true,
        target,
      });
      if (abilityDiceMode) {
        const finalD6 = normalizeDiceValue(data?.dice?.D6, 6);
        const finalD4 = normalizeDiceValue(data?.dice?.D4, 4);
        playDiceAnimation(finalD6, finalD4, abilityDiceMode);
        await waitDiceAnimationComplete();
      }
      clearPendingAbilityActivation();
      renderState(data);
      toast(t('toast.character_ability_activated'));
    } finally {
      if (abilityDiceMode) {
        setPendingDiceAction(null);
        updateStageNextStepButtonState(state);
      }
    }
  };

  const startSelfAbilityActivation = async () => {
    const abilityState = getSelfAbilityState(state);
    if (!abilityState || !canActivateSelfAbilityFromCard(state)) return;

    const confirmed = await openConfirmDialog({
      title: t('room.confirm.title'),
      message: t('toast.character_ability_confirm'),
      confirmLabel: t('room.confirm.confirm'),
      cancelLabel: t('room.confirm.cancel'),
    });
    if (!confirmed) {
      toast(t('toast.character_ability_cancelled'));
      return;
    }

    if (abilityState.targetType === 'self' || !abilityState.targetType) {
      try {
        await activateSelfAbility({ kind: 'none' });
      } catch (error) {
        if (error?.code === 'ROOM_NOT_FOUND') {
          goToLobbyPage();
          return;
        }
        console.error(error);
      }
      return;
    }

    if (abilityState.targetType === 'area') {
      setPendingAbilityActivation({
        account: abilityState.account,
        character: abilityState.character,
        timing: abilityState.timing,
        targetType: abilityState.targetType,
      });
      renderState(getLatestRoomSnapshot());
      toast(t('toast.character_ability_choose_area'));
      return;
    }

    if (abilityState.targetType === 'discard') {
      const discardOptions = getDiscardEquipmentOptions(getLatestRoomSnapshot());
      if (!discardOptions.length) {
        toast(t('toast.character_ability_not_supported'), 'error');
        return;
      }
      const discardChoice = await openDiscardChoiceDialog(discardOptions);
      if (!discardChoice) {
        toast(t('toast.character_ability_cancelled'));
        return;
      }
      try {
        await activateSelfAbility({ kind: 'discard', id: discardChoice });
      } catch (error) {
        if (error?.code === 'ROOM_NOT_FOUND') {
          goToLobbyPage();
          return;
        }
        console.error(error);
      }
      return;
    }

    if (isAbilityPlayerTarget(abilityState.targetType)) {
      setPendingAbilityActivation({
        account: abilityState.account,
        character: abilityState.character,
        timing: abilityState.timing,
        targetType: abilityState.targetType,
      });
      renderState(getLatestRoomSnapshot());
      toast(t('toast.character_ability_choose_player'));
      return;
    }

    toast(t('toast.character_ability_not_supported'), 'error');
  };

  const selectAbilityPlayerTarget = async (targetAccount) => {
    const pendingAbilityActivation = getPendingAbilityActivation();
    if (!pendingAbilityActivation || !state.roomId || !targetAccount) return;
    const abilityDiceMode = getAbilityDiceAnimationMode(pendingAbilityActivation.character);
    if (abilityDiceMode) {
      const selectedTarget = { kind: 'player', id: targetAccount };
      clearPendingAbilityActivation();
      setPendingDiceAction({
        labelKey: 'room.table_next_step.roll_damage_dice',
        mode: abilityDiceMode,
        toastKey: 'toast.character_ability_activated',
        highlightTargetAccounts: [String(targetAccount || '').trim()].filter(Boolean),
        highlightPromptClass: 'attack-target-prompt',
        execute: () => dispatch('next_step', {
          room_id: state.roomId,
          account: state.account || undefined,
          action: true,
          target: selectedTarget,
        }),
      });
      renderState(getLatestRoomSnapshot());
      return;
    }
    try {
      await activateSelfAbility({ kind: 'player', id: targetAccount });
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    }
  };

  const selectAbilityAreaTarget = async (areaName) => {
    const pendingAbilityActivation = getPendingAbilityActivation();
    if (!pendingAbilityActivation || !state.roomId || !areaName) return;
    try {
      await activateSelfAbility({ kind: 'area', id: areaName });
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    }
  };

  return {
    activateSelfAbility,
    startSelfAbilityActivation,
    selectAbilityPlayerTarget,
    selectAbilityAreaTarget,
  };
}
