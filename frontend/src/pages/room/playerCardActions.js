export async function handlePlayerCardClick(targetAccount, ctx) {
  const {
    state,
    el,
    t,
    toast,
    dispatch,
    renderState,
    goToLobbyPage,
    getLatestRoomSnapshot,
    getPendingAbilityActivation,
    clearPendingAbilityActivation,
    getAreaPromptState,
    getCardPromptState,
    getGreenConfirmPromptState,
    getPendingStealState,
    getPendingKillLootState,
    getAttackPromptState,
    resolvePendingKillLoot,
    maybeResolvePendingSteal,
    useWeirdWoodsOnTarget,
    useErstwhileAltarOnTarget,
    useActiveCard,
    attackPlayerTarget,
    openConfirmDialog,
    shouldSkipTargetConfirm,
    isAbilityPlayerTarget,
    selectAbilityPlayerTarget,
    canActivateSelfAbilityFromCard,
    startSelfAbilityActivation,
  } = ctx;

  const getTargetDisplayName = (account) => {
    const normalized = String(account || '').trim();
    const player = getLatestRoomSnapshot()?.players?.[normalized];
    return player?.name || normalized;
  };

  const shouldConfirmTargetAction = () => !Boolean(shouldSkipTargetConfirm?.());

  if (!state.roomId || !state.account) return;

  const dataSnapshot = getLatestRoomSnapshot();
  const areaPrompt = getAreaPromptState(state, dataSnapshot);
  const cardPrompt = getCardPromptState(state, dataSnapshot);
  const greenConfirm = getGreenConfirmPromptState(state, dataSnapshot);
  const pendingSteal = getPendingStealState(state, dataSnapshot);
  const pendingKillLoot = getPendingKillLootState(state, dataSnapshot);
  const attackPrompt = getAttackPromptState(state, dataSnapshot);
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const isGameOngoing = roomStatus === 2;
  const isGameFinished = roomStatus === 3;
  const isSelfCard = targetAccount === state.account;
  const selfPlayer = dataSnapshot?.players?.[state.account];
  const hasNotRevealed = selfPlayer && !selfPlayer.character_reveal && selfPlayer.character;

  if (greenConfirm.active) {
    return;
  }

  if (pendingKillLoot.active && pendingKillLoot.deathAccounts.includes(String(targetAccount || '').trim())) {
    await resolvePendingKillLoot(targetAccount, dataSnapshot);
    return;
  }

  if (pendingSteal.active && pendingSteal.fromAccount === String(targetAccount || '').trim()) {
    await maybeResolvePendingSteal(dataSnapshot);
    return;
  }

  if (areaPrompt.active && areaPrompt.targetAccounts.includes(String(targetAccount || '').trim())) {
    if (areaPrompt.kind === 'weird-woods') {
      await useWeirdWoodsOnTarget(targetAccount);
    } else if (areaPrompt.kind === 'altar') {
      await useErstwhileAltarOnTarget(targetAccount);
    }
    return;
  }

  if (cardPrompt.active && cardPrompt.targetAccounts.includes(String(targetAccount || '').trim())) {
    if (shouldConfirmTargetAction()) {
      const confirmed = await openConfirmDialog({
        title: t('room.confirm.title'),
        message: t('toast.card_target_confirm', { name: getTargetDisplayName(targetAccount) }),
        confirmLabel: t('room.confirm.confirm'),
        cancelLabel: t('room.confirm.cancel'),
      });
      if (!confirmed) return;
    }
    await useActiveCard({ kind: 'player', id: targetAccount });
    return;
  }

  if (attackPrompt.active && attackPrompt.targetAccounts.includes(String(targetAccount || '').trim())) {
    if (shouldConfirmTargetAction()) {
      const confirmed = await openConfirmDialog({
        title: t('room.confirm.title'),
        message: t('toast.attack_target_confirm', { name: getTargetDisplayName(targetAccount) }),
        confirmLabel: t('room.confirm.confirm'),
        cancelLabel: t('room.confirm.cancel'),
      });
      if (!confirmed) return;
    }
    await attackPlayerTarget(targetAccount);
    return;
  }

  const pendingAbilityActivation = getPendingAbilityActivation();
  if (pendingAbilityActivation && isGameOngoing) {
    if (isSelfCard) {
      clearPendingAbilityActivation();
      toast(t('toast.character_ability_cancelled'));
      return;
    }
    if (isAbilityPlayerTarget(pendingAbilityActivation.targetType)) {
      await selectAbilityPlayerTarget(targetAccount);
    }
    return;
  }

  if (isGameOngoing && isSelfCard && hasNotRevealed) {
    const confirmed = await openConfirmDialog({
      title: t('room.confirm.title'),
      message: t('toast.reveal_character_confirm'),
      confirmLabel: t('room.confirm.confirm'),
      cancelLabel: t('room.confirm.cancel'),
    });
    if (!confirmed) return;
    try {
      const data = await dispatch('reveal_character', {
        room_id: state.roomId,
        account: state.account,
      });
      renderState(data);
      toast(t('toast.character_revealed'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    }
    return;
  }

  if (isGameOngoing && isSelfCard && selfPlayer?.character_reveal && canActivateSelfAbilityFromCard(state, dataSnapshot)) {
    await startSelfAbilityActivation();
    return;
  }

  if (isGameFinished && !isSelfCard && selfPlayer?.trip_display && selfPlayer.trip_display !== '-') {
    const targetPlayer = dataSnapshot?.players?.[targetAccount];
    if (!targetPlayer?.trip_display || targetPlayer.trip_display === '-') return;

    const submitRating = async (rating, comment = '') => {
      try {
        await dispatch('submit_trip_rating', {
          room_id: state.roomId,
          account: state.account,
          target_account: targetAccount,
          rating,
          comment,
        });
        toast(t('toast.trip_rating_saved'));
      } catch (error) {
        const detail = String(error?.message || error?.detail || '').toLowerCase();
        let ratingErrMsg;
        if (detail.includes('not registered') || detail.includes('must have registered') || detail.includes('both players')) {
          ratingErrMsg = t('toast.trip_rating_not_registered');
        } else if (detail.includes('already rated')) {
          ratingErrMsg = t('toast.trip_rating_already_rated');
        } else if (detail.includes('rating limit')) {
          ratingErrMsg = t('toast.trip_rating_limit');
        } else {
          ratingErrMsg = error.message || t('toast.trip_rating_failed');
        }
        toast(ratingErrMsg, 'error');
      }
    };

    const dialog = el.ratingDialog;
    if (!(dialog instanceof HTMLDialogElement) || !(el.ratingDialogComment instanceof HTMLTextAreaElement)) {
      const positive = await openConfirmDialog({
        title: t('room.rating.title'),
        message: t('room.rating.fallback_message'),
        confirmLabel: t('room.rating.positive'),
        cancelLabel: t('room.rating.negative'),
      });
      await submitRating(positive ? 1 : -1, '');
      return;
    }

    if (el.ratingDialogTitle) el.ratingDialogTitle.textContent = t('room.rating.title');
    if (el.ratingDialogMessage) el.ratingDialogMessage.textContent = t('room.rating.message', { name: targetPlayer.name || targetAccount });
    el.ratingDialogComment.value = '';
    el.ratingDialogComment.placeholder = t('identity.trip_rating_comment_placeholder');
    const positiveInput = dialog.querySelector('input[name="tripRatingValue"][value="1"]');
    if (positiveInput instanceof HTMLInputElement) positiveInput.checked = true;

    const closeDialog = () => {
      if (dialog.open) dialog.close();
    };

    if (el.ratingDialogCancel instanceof HTMLButtonElement) {
      el.ratingDialogCancel.onclick = closeDialog;
    }
    if (el.ratingDialogSubmit instanceof HTMLButtonElement) {
      el.ratingDialogSubmit.onclick = async () => {
        const selected = dialog.querySelector('input[name="tripRatingValue"]:checked');
        const rating = selected instanceof HTMLInputElement ? Number(selected.value || 1) : 1;
        await submitRating(rating, el.ratingDialogComment.value || '');
        closeDialog();
      };
    }
    dialog.showModal();
  }
}
