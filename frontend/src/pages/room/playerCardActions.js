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
    getCounterAttackPromptState,
    resolvePendingKillLoot,
    maybeResolvePendingSteal,
    useWeirdWoodsOnTarget,
    useErstwhileAltarOnTarget,
    useActiveCard,
    attackPlayerTarget,
    counterAttackPlayerTarget,
    openConfirmDialog,
    shouldSkipTargetConfirm,
    isAbilityPlayerTarget,
    selectAbilityPlayerTarget,
    canActivateSelfAbilityFromCard,
    startSelfAbilityActivation,
    canActivateStandbyAbility,
    startStandbyAbilityActivation,
    markEndTurnAbilityInteractionStarted,
    gmChangeCharacterForTarget,
    gmAdjustPlayerForTarget,
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
  const counterAttackPrompt = getCounterAttackPromptState(state, dataSnapshot);
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const isGameOngoing = roomStatus === 2;
  const isGameFinished = roomStatus === 3;
  const isSelfCard = targetAccount === state.account;
  const selfPlayer = dataSnapshot?.players?.[state.account];
  const hasNotRevealed = selfPlayer && !selfPlayer.character_reveal && selfPlayer.character;

  // 2026-10-20 新增：開局後、GM 按下「開始遊戲」放行前這段暫停期間，GM 點別人的卡片是「改角色」，不是下面那些攻擊/偷裝備等一般操作。放在最前面是因為這段期間回合流程還沒開始，下面這些 prompt 都不會 active，不會互相干擾。
  const isGmViewer = Boolean(selfPlayer?.is_gm);
  const awaitingGmRelease = Boolean(dataSnapshot?.room?.awaiting_gm_release);
  if (isGmViewer && awaitingGmRelease && !isSelfCard) {
    await gmChangeCharacterForTarget?.(targetAccount, dataSnapshot);
    return;
  }

  // 2026-10-20 新增：遊戲進行中（非 GM 開局暫停期間），GM 點別人的卡片是叫出「調整
  // 面板」（暴斃／調整血量／揭露／反揭露），同樣放在最前面、優先於下面一般的攻擊/偷
  // 裝備等 prompt 判斷——GM 本身不下場、不會進入這些 prompt，點卡片一律是要調整對方。
  if (isGmViewer && isGameOngoing && !isSelfCard) {
    await gmAdjustPlayerForTarget?.(targetAccount, dataSnapshot);
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

  // 2026-11-01 新增：Mike 要求反擊改成跟攻擊一樣的操作方式——點對方（原攻擊者）
  // 的頭像、二次確認是否要反擊，確認後直接自動丟骰；不想反擊則改用「下一步」
  // 按鈕的「跳過攻擊」(skip-attack phase) 跳過。不再需要靠中央骰子區塊的閃爍
  // 提示（Mike回報骰子閃爍不夠清楚，四面骰也沒辦法套用一樣的閃爍動畫，見
  // stageNextStepState.js 對應的修正）。
  if (counterAttackPrompt.active && counterAttackPrompt.originalAccount === String(targetAccount || '').trim()) {
    if (shouldConfirmTargetAction()) {
      const confirmed = await openConfirmDialog({
        title: t('room.confirm.title'),
        message: t('toast.counter_attack_target_confirm', { name: getTargetDisplayName(targetAccount) }),
        confirmLabel: t('room.confirm.confirm'),
        cancelLabel: t('room.confirm.cancel'),
      });
      if (!confirmed) return;
    }
    await counterAttackPlayerTarget(targetAccount);
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
    return;
  }

  // 2026-11-12 新增：純偵錯用的 log，只會出現在瀏覽器 console，玩家不會看到。
  // 上面這一長串判斷式只要有命中任何一種操作都會在各自的分支裡 return，執行
  // 到這裡代表這次點擊完全沒有命中任何東西（Mike 回報「有時候點玩家卡片沒
  // 反應，多點幾次就會成功」，懷疑是跟畫面刷新/推播卡在某個中間狀態的時間差
  // 有關）。把當下所有相關 prompt／目標清單的狀態印出來，下次重現時直接把
  // console 內容貼出來，就能比對出到底是哪個 prompt 在那個瞬間是不是 active、
  // 目標清單裡有沒有包含這次點的帳號。
  console.debug('[player-card-click] 點擊沒有命中任何操作', {
    targetAccount,
    account: state.account,
    roomStatus,
    isGameOngoing,
    isGameFinished,
    isSelfCard,
    isGmViewer,
    awaitingGmRelease,
    areaPrompt,
    cardPrompt,
    attackPrompt,
    counterAttackPrompt,
    greenConfirmActive: greenConfirm.active,
    pendingSteal,
    pendingKillLoot,
    pendingAbilityActivation,
  });
}
