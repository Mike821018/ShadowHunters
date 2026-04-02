export function createStageNextStepStateHandlers({
  t,
  getLatestRoomSnapshot,
  getDrawablePileColors,
  getPendingStealState,
  getPendingKillLootState,
  getEquipmentConfirmPromptState,
  getGreenConfirmPromptState,
  getCardPromptState,
  getAttackPromptState,
  getMoveAreaPromptState,
  getPendingDiceAction,
  getDiceRollBusy,
  getDiceRollAnimating,
  getStageNextStepBusy,
  getPendingAbilityActivation,
  getTableDiceElements,
  getStageNextStepButton,
}) {
  function updateStagePilePromptState(dataSnapshot = null) {
    const snapshot = dataSnapshot || getLatestRoomSnapshot?.() || null;
    const root = document;
    const drawableColors = new Set(getDrawablePileColors(snapshot, null).map((value) => String(value || '').toLowerCase()));
    root.querySelectorAll('.table-stage [data-pile-type][data-card-color]').forEach((cardEl) => {
      const pileType = String(cardEl.getAttribute('data-pile-type') || '').toLowerCase();
      const colorKey = String(cardEl.getAttribute('data-card-color') || '').toLowerCase();
      const isPrompt = pileType === 'deck' && drawableColors.has(colorKey);
      cardEl.classList.toggle('is-draw-prompt', isPrompt);
      if (isPrompt) {
        cardEl.setAttribute('role', 'button');
        cardEl.setAttribute('tabindex', '0');
        cardEl.setAttribute('aria-label', `抽取${colorKey}牌庫`);
      } else {
        cardEl.removeAttribute('role');
        cardEl.removeAttribute('tabindex');
        cardEl.removeAttribute('aria-label');
      }
    });
  }

  function updateStageNextStepButtonState(state, dataSnapshot = null) {
    const snapshot = dataSnapshot || getLatestRoomSnapshot?.() || null;
    const button = getStageNextStepButton();
    const { badgeWrap } = getTableDiceElements();

    const hasRoom = Boolean(state?.roomId);
    const selfAccount = String(state?.account || '').trim();
    const roomStatus = Number(snapshot?.room?.room_status || 0);
    const currentAccount = String(snapshot?.turn?.current_account || '').trim();
    const selfStatus = Number(snapshot?.players?.[selfAccount]?.status || 0);
    const pendingSteal = getPendingStealState(state, snapshot);
    const pendingKillLoot = getPendingKillLootState(state, snapshot);
    const equipmentConfirm = getEquipmentConfirmPromptState(state, snapshot);
    const greenConfirm = getGreenConfirmPromptState(state, snapshot);
    const cardPrompt = getCardPromptState(state, snapshot);
    const attackPrompt = getAttackPromptState(state, snapshot);
    const movePrompt = getMoveAreaPromptState(state, snapshot);
    const pendingDiceAction = getPendingDiceAction();
    const diceRollBusy = getDiceRollBusy();
    const diceRollAnimating = getDiceRollAnimating();
    const stageNextStepBusy = getStageNextStepBusy();
    const activeCardName = String(snapshot?.active_card?.name || snapshot?.active_card_display?.name || '').trim();
    const status5RollLabelKey = activeCardName === 'Blessing'
      ? 'room.table_next_step.roll_heal_dice'
      : 'room.table_next_step.roll_damage_dice';

    let disabled = false;
    let label = t('room.table_next_step.default');
    let phase = '';

    if (!hasRoom || !selfAccount) {
      disabled = true;
      label = t('room.table_next_step.not_joined');
    } else if (roomStatus === 3) {
      disabled = true;
      label = t('room.table_next_step.game_ended');
    } else if (roomStatus !== 2) {
      disabled = true;
      label = t('room.table_next_step.wait_start');
    } else if (greenConfirm.waitingConfirm) {
      label = t('room.table_next_step.confirm_card');
      phase = 'turn-start';
    } else if (selfAccount !== currentAccount) {
      disabled = true;
      label = t('room.table_next_step.wait_turn');
    } else if (diceRollBusy || diceRollAnimating || stageNextStepBusy) {
      disabled = true;
      label = t('room.table_next_step.busy');
    } else if (pendingDiceAction) {
      disabled = true;
      label = t(pendingDiceAction.labelKey || 'room.table_next_step.roll_move_dice');
    } else if (equipmentConfirm.active) {
      label = t('room.table_next_step.equip');
      phase = 'equip';
    } else if (greenConfirm.active) {
      disabled = true;
      label = greenConfirm.needsChoice ? t('room.table_next_step.choose_effect') : t('room.table_next_step.wait_target_confirm');
    } else if (selfStatus === 1) {
      if (getPendingAbilityActivation()) {
        disabled = true;
        label = t('room.table_next_step.choose_target');
      } else {
        label = t('room.table_next_step.turn_start');
        phase = 'turn-start';
      }
    } else if (selfStatus === 2) {
      disabled = true;
      label = t('room.table_next_step.roll_move_dice');
    } else if (pendingKillLoot.active) {
      disabled = true;
      label = t('room.table_next_step.choose_equipment');
    } else if (selfStatus === 5) {
      disabled = true;
      label = t(status5RollLabelKey);
    } else if (selfStatus === 3) {
      if (pendingSteal.active) {
        disabled = true;
        label = t('room.table_next_step.choose_equipment');
      } else if (cardPrompt.active) {
        if (['self', 'others', 'all', 'area'].includes(cardPrompt.target)) {
          label = t('room.table_next_step.use_card');
          phase = 'use-card';
        } else {
          disabled = true;
          label = t('room.table_next_step.choose_target');
        }
      } else {
        label = t('room.table_next_step.skip_area');
        phase = 'skip-area';
      }
    } else if (selfStatus === 4) {
      label = t('room.table_next_step.skip_attack');
      if (attackPrompt.force && attackPrompt.targetAccounts.length > 0) {
        disabled = true;
      }
    } else if (selfStatus === 6) {
      label = t('room.table_next_step.end_turn');
    } else {
      const phaseLabel = t(`status.${selfStatus}`) || t('common.unknown');
      label = t('room.table_next_step.next_phase', { phase: phaseLabel });
    }

    if (button) {
      button.textContent = label;
      button.disabled = disabled;
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      button.setAttribute('aria-label', label);
      if (phase) button.setAttribute('data-phase', phase);
      else button.removeAttribute('data-phase');
    }

    const shouldPromptRoll = Boolean(
      hasRoom
      && selfAccount
      && roomStatus === 2
      && selfAccount === currentAccount
      && (Boolean(pendingDiceAction) || selfStatus === 5 || (selfStatus === 2 && !movePrompt.active))
      && !diceRollBusy
      && !diceRollAnimating
      && !stageNextStepBusy
    );
    badgeWrap?.classList.toggle('is-roll-prompt', shouldPromptRoll);
    if (badgeWrap) {
      const labelKey = pendingDiceAction?.labelKey
        || (selfStatus === 5 ? status5RollLabelKey : 'room.table_next_step.roll_move_dice');
      const labelText = t(labelKey);
      const rollPromptLabel = `可${labelText}，請點擊骰子`;
      const idleLabel = labelText;
      badgeWrap.setAttribute('aria-disabled', shouldPromptRoll ? 'false' : 'true');
      badgeWrap.setAttribute('aria-label', shouldPromptRoll ? rollPromptLabel : idleLabel);
    }

    updateStagePilePromptState(snapshot);
  }

  return {
    updateStagePilePromptState,
    updateStageNextStepButtonState,
  };
}
