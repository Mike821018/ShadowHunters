export function isAbilityPlayerTarget(targetType) {
  return targetType === 'other' || targetType === 'one';
}

export function getSelfAbilityState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  if (!selfAccount) return null;
  const selfPlayer = dataSnapshot?.players?.[selfAccount];
  if (!selfPlayer?.self_character) return null;
  return {
    account: selfAccount,
    character: String(selfPlayer.self_character || ''),
    canUseAbility: Boolean(selfPlayer.self_can_use_ability),
    timing: Number(selfPlayer.self_character_ability_timing || 0),
    targetType: String(selfPlayer.self_character_ability_target || ''),
    status: Number(selfPlayer.status || 0),
    revealed: Boolean(selfPlayer.character_reveal),
    roomStatus: Number(dataSnapshot?.room?.room_status || 0),
    currentAccount: String(dataSnapshot?.turn?.current_account || '').trim(),
  };
}

export function canActivateSelfAbilityFromCard(state, dataSnapshot) {
  const abilityState = getSelfAbilityState(state, dataSnapshot);
  if (!abilityState) return false;
  if (abilityState.roomStatus !== 2) return false;
  if (abilityState.currentAccount !== abilityState.account) return false;
  if (!abilityState.revealed || !abilityState.canUseAbility) return false;

  if ([1, 2, 6].includes(abilityState.timing)) {
    return abilityState.status === abilityState.timing;
  }

  if (abilityState.timing === 8) {
    return abilityState.status === 1 || abilityState.status === 6;
  }

  return false;
}

export function getCurrentTurnPlayer(dataSnapshot) {
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  if (!currentAccount) return null;
  const player = dataSnapshot?.players?.[currentAccount];
  if (!player) return null;
  return { account: currentAccount, ...player };
}

export function isReplayViewState(state, dataSnapshot) {
  return String(state?.page || '') === 'replay-room' || Boolean(String(dataSnapshot?.room?.replay_notice || '').trim());
}

export function isRoomLayoutPage(state, dataSnapshot) {
  if (document.body?.classList?.contains('room-page')) return true;
  if ((document.body?.dataset?.page || '') === 'room') return true;
  return isReplayViewState(state, dataSnapshot);
}

export function showOccupantNamePopup({ name, anchorEl, getTimer, setTimer }) {
  const label = String(name || '').trim();
  if (!label || !(anchorEl instanceof HTMLElement)) return;
  let popup = document.getElementById('stageOccupantNamePopup');
  if (!(popup instanceof HTMLElement)) {
    popup = document.createElement('div');
    popup.id = 'stageOccupantNamePopup';
    popup.className = 'stage-occupant-name-popup';
    popup.setAttribute('role', 'status');
    popup.setAttribute('aria-live', 'polite');
    document.body.appendChild(popup);
  }

  popup.textContent = label;
  popup.hidden = false;

  const rect = anchorEl.getBoundingClientRect();
  const top = Math.max(8, Math.round(rect.top - 34));
  const left = Math.max(8, Math.round(rect.left + rect.width / 2));
  popup.style.top = `${top}px`;
  popup.style.left = `${left}px`;

  const timer = getTimer();
  if (timer) {
    window.clearTimeout(timer);
  }
  setTimer(window.setTimeout(() => {
    if (popup) popup.hidden = true;
    setTimer(null);
  }, 1200));
}

export function getDiscardEquipmentOptions(dataSnapshot, getLocalizedCardName) {
  const piles = dataSnapshot?.card_piles || {};
  return Object.entries(piles).flatMap(([color, pileInfo]) => {
    const discardCards = Array.isArray(pileInfo?.discard_cards) ? pileInfo.discard_cards : [];
    return discardCards
      .filter((card) => String(card?.type || '').trim() === 'Equipment')
      .map((card) => ({
        value: String(card?.id || '').trim(),
        label: `${getLocalizedCardName(String(card?.name || '').trim())} (${String(color || '').trim()})`,
      }))
      .filter((option) => option.value);
  });
}

export function getDrawablePileColors(dataSnapshot, state) {
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  if (roomStatus !== 2) return [];
  if (isReplayViewState(state, dataSnapshot)) return [];
  if (dataSnapshot?.pending_steal || dataSnapshot?.green_confirm_prompt) return [];
  const currentPlayer = getCurrentTurnPlayer(dataSnapshot);
  if (!currentPlayer || Number(currentPlayer.status || 0) !== 3) return [];
  if (dataSnapshot?.active_card) return [];
  const areaName = String(currentPlayer.area || '').trim();
  if (!areaName) return [];
  const fields = Array.isArray(dataSnapshot?.fields) ? dataSnapshot.fields : [];
  const field = fields.find((item) => item && String(item.name || '').trim() === areaName);
  if (!field?.is_draw) return [];
  const drawType = String(field.draw_type || '').trim();
  if (drawType === 'Any') return ['Green', 'White', 'Black'];
  if (['Green', 'White', 'Black'].includes(drawType)) return [drawType];
  return [];
}