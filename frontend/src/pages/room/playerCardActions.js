import { countDisplayWidth } from '../../utils.js';

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
    canActivateStandbyAbility,
    startStandbyAbilityActivation,
    markEndTurnAbilityInteractionStarted,
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

  if (greenConfirm.active) {
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
    // 玩家已經點自己的卡片準備揭露身分：回合結束階段不能再被「自動結束回合」搶先結束。
    markEndTurnAbilityInteractionStarted?.();
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
    // 玩家已經點自己的卡片準備發動能力：回合結束階段不能再被「自動結束回合」搶先結束。
    markEndTurnAbilityInteractionStarted?.();
    await startSelfAbilityActivation();
    return;
  }

  // ability_timing===11（例如艾莉 Allie）：不限自己回合，隨時點自己的卡片都可以發動；
  // 不受「輪到自己回合」限制，所以不需要跟自動結束回合搶時機。
  if (isGameOngoing && isSelfCard && selfPlayer?.character_reveal && canActivateStandbyAbility(state, dataSnapshot)) {
    await startStandbyAbilityActivation();
    return;
  }

  if (isGameFinished && !isSelfCard && selfPlayer?.trip_display && selfPlayer.trip_display !== '-') {
    const targetPlayer = dataSnapshot?.players?.[targetAccount];
    if (!targetPlayer?.trip_display || targetPlayer.trip_display === '-') return;

    const submitRating = async (rating, comment = '') => {
      try {
        // silent: true — 這個呼叫自己在下面 catch 裡會判斷詳細原因、顯示對應的
        // 正確提示（例如「此玩家尚未登記 TRIP」），不需要 dispatch() 自己再跳一次
        // 籠統的「請求資料錯誤」，避免同一次失敗彈出兩個意思不一致的提示。
        await dispatch('submit_trip_rating', {
          room_id: state.roomId,
          account: state.account,
          target_account: targetAccount,
          rating,
          comment,
        }, { silent: true });
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
        const comment = String(el.ratingDialogComment.value || '');
        if (countDisplayWidth(comment.trim()) > 40) {
          el.ratingDialogComment.setCustomValidity(t('identity.trip_rating_comment_placeholder'));
          el.ratingDialogComment.reportValidity();
          el.ratingDialogComment.setCustomValidity('');
          return;
        }
        await submitRating(rating, comment);
        closeDialog();
      };
    }
    dialog.showModal();
  }
}
