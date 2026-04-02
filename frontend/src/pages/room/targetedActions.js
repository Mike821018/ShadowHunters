export function createTargetedActionHandlers({
  state,
  dispatch,
  renderState,
  toast,
  t,
  goToLobbyPage,
  getStageNextStepBusy,
  setStageNextStepBusy,
  updateStageNextStepButtonState,
  getMoveAreaPromptState,
  getAttackPromptState,
  getAreaPromptState,
  getDrawablePileColors,
  openAreaChoiceDialog,
  maybeResolvePendingSteal,
}) {
  const moveToPromptArea = async (areaName) => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;
    const prompt = getMoveAreaPromptState(state);
    const normalizedAreaName = String(areaName || '').trim();
    if (!prompt.active || !normalizedAreaName || !prompt.areaNames.includes(normalizedAreaName)) return;

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: false,
        target: { kind: 'area', id: normalizedAreaName },
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

  const drawCardFromPile = async (color) => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;
    const drawablePileColors = getDrawablePileColors();
    if (!drawablePileColors.includes(color)) return;

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: true,
        action_type: color,
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

  const attackPlayerTarget = async (targetAccount) => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;

    const attackPrompt = getAttackPromptState(state);
    const normalizedTarget = String(targetAccount || '').trim();
    if (!attackPrompt.active || !normalizedTarget || !attackPrompt.targetAccounts.includes(normalizedTarget)) return;

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: true,
        target: { kind: 'player', id: normalizedTarget },
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

  const useWeirdWoodsOnTarget = async (targetAccount) => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;

    const areaPrompt = getAreaPromptState(state);
    const normalizedTarget = String(targetAccount || '').trim();
    if (!areaPrompt.active || !normalizedTarget || !areaPrompt.targetAccounts.includes(normalizedTarget)) return;

    const choice = await openAreaChoiceDialog();

    if (choice !== 'Hurt' && choice !== 'Heal') {
      toast(t('toast.area_choice_cancelled'));
      return;
    }

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: true,
        action_type: choice,
        target: { kind: 'player', id: normalizedTarget },
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

  const useErstwhileAltarOnTarget = async (targetAccount) => {
    if (!state.roomId || !state.account || getStageNextStepBusy()) return;

    const areaPrompt = getAreaPromptState(state);
    const normalizedTarget = String(targetAccount || '').trim();
    if (!areaPrompt.active || areaPrompt.kind !== 'altar' || !normalizedTarget || !areaPrompt.targetAccounts.includes(normalizedTarget)) return;

    setStageNextStepBusy(true);
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: true,
        target: { kind: 'player', id: normalizedTarget },
      });
      renderState(data);
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

  return {
    moveToPromptArea,
    drawCardFromPile,
    attackPlayerTarget,
    useWeirdWoodsOnTarget,
    useErstwhileAltarOnTarget,
  };
}
