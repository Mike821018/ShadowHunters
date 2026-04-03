export function selectAttackPromptState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
  const attackPrompt = dataSnapshot?.attack_prompt || null;
  const targetAccounts = Array.isArray(attackPrompt?.target_accounts)
    ? attackPrompt.target_accounts.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === currentAccount && selfStatus === 4),
    targetAccounts,
    force: Boolean(attackPrompt?.force),
  };
}

export function selectCounterAttackPromptState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
  const prompt = dataSnapshot?.counter_attack_prompt || null;
  const counterAccount = String(prompt?.counter_account || '').trim();
  const originalAccount = String(prompt?.original_account || '').trim();

  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === currentAccount && selfStatus === 5 && selfAccount === counterAccount && originalAccount),
    waitingCounter: Boolean(prompt?.waiting_counter),
    counterAccount,
    originalAccount,
  };
}

export function selectAreaPromptState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
  const areaPrompt = dataSnapshot?.area_prompt || null;
  const targetAccounts = Array.isArray(areaPrompt?.target_accounts)
    ? areaPrompt.target_accounts.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === currentAccount && selfStatus === 3 && areaPrompt?.area_name),
    kind: String(areaPrompt?.kind || ''),
    areaName: String(areaPrompt?.area_name || ''),
    targetAccounts,
    options: Array.isArray(areaPrompt?.options) ? areaPrompt.options : [],
  };
}

export function selectMoveAreaPromptState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
  const moveOptions = Array.isArray(dataSnapshot?.move_options)
    ? dataSnapshot.move_options.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  let compassOptions = Array.isArray(dataSnapshot?.compass_options)
    ? dataSnapshot.compass_options.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  if (compassOptions.length === 1) {
    compassOptions = [];
  }
  const areaNames = Array.from(new Set([...moveOptions, ...compassOptions]));

  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === currentAccount && selfStatus === 2 && areaNames.length > 0),
    areaNames,
  };
}

export function selectAbilityAreaPromptState(state, dataSnapshot, pendingAbilityActivation) {
  if (!pendingAbilityActivation || pendingAbilityActivation.targetType !== 'area') {
    return { active: false, areaNames: [] };
  }

  const selfAccount = String(state?.account || '').trim();
  const player = dataSnapshot?.players?.[selfAccount] || null;
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  if (!selfAccount || !player || roomStatus !== 2) {
    return { active: false, areaNames: [] };
  }

  const fields = Array.isArray(dataSnapshot?.fields) ? dataSnapshot.fields : [];
  const allFieldAreaNames = fields
    .map((field) => String(field?.name || '').trim())
    .filter(Boolean);
  const characterName = String(pendingAbilityActivation.character || '').trim();

  if (characterName === 'Emi') {
    const currentArea = String(player?.area || '').trim();
    const currentIndex = fields.findIndex((field) => String(field?.name || '').trim() === currentArea);
    if (currentIndex < 0) {
      return { active: true, areaNames: [] };
    }
    const n = fields.length;
    const areaNames = [-1, 1]
      .map((offset) => ((currentIndex + offset) % n + n) % n)
      .map((index) => String(fields[index]?.name || '').trim())
      .filter(Boolean);
    return { active: true, areaNames };
  }

  return { active: true, areaNames: allFieldAreaNames };
}

export function selectCardPromptState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
  const cardPrompt = dataSnapshot?.card_prompt || null;
  const activeCard = dataSnapshot?.active_card || null;
  const target = String(cardPrompt?.target || activeCard?.target || '');
  let targetAccounts = Array.isArray(cardPrompt?.target_accounts)
    ? cardPrompt.target_accounts.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (targetAccounts.length === 0 && (target === 'other' || target === 'one')) {
    targetAccounts = Object.entries(dataSnapshot?.players || {})
      .filter(([account, p]) => Boolean(p?.alive) && (target !== 'other' || account !== selfAccount))
      .map(([account]) => String(account || '').trim())
      .filter(Boolean);
  }

  const name = String(cardPrompt?.name || activeCard?.name || '');

  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === currentAccount && selfStatus === 3 && (name || activeCard)),
    name,
    target,
    targetAccounts,
  };
}

export function selectPendingStealState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const pendingSteal = dataSnapshot?.pending_steal || null;
  const chooserAccount = String(pendingSteal?.chooser_account || '').trim();
  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === chooserAccount && pendingSteal?.from_account && pendingSteal?.to_account),
    fromAccount: String(pendingSteal?.from_account || ''),
    toAccount: String(pendingSteal?.to_account || ''),
    chooserAccount,
    equipmentNames: Array.isArray(pendingSteal?.equipment_names) ? pendingSteal.equipment_names : [],
    source: String(pendingSteal?.source || ''),
  };
}

export function selectPendingKillLootState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
  const pending = dataSnapshot?.pending_kill_loot || null;
  const deathAccounts = Array.isArray(pending?.death_accounts)
    ? pending.death_accounts.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === currentAccount && selfStatus === 5 && deathAccounts.length > 0),
    deathAccounts,
    allowFull: Boolean(pending?.allow_full),
  };
}

export function selectEquipmentConfirmPromptState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  const activeCard = dataSnapshot?.active_card || null;
  const cardType = String(activeCard?.type || '').trim();
  const isCurrentPlayer = Boolean(selfAccount && selfAccount === currentAccount);
  const isEquipmentCard = cardType === 'Equipment';

  return {
    active: isCurrentPlayer && isEquipmentCard,
    canConfirm: isCurrentPlayer && isEquipmentCard,
  };
}

export function selectGreenConfirmPromptState(state, dataSnapshot) {
  const selfAccount = String(state?.account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const prompt = dataSnapshot?.green_confirm_prompt || null;
  const sourceAccount = String(prompt?.source_account || '').trim();
  const targetAccount = String(prompt?.target_account || '').trim();
  const isTarget = Boolean(selfAccount && selfAccount === targetAccount);
  const waitingConfirm = Boolean(isTarget && prompt?.waiting_confirm);
  const canSetChoice = Boolean(isTarget && prompt?.can_set_choice);
  const needsChoice = Boolean(canSetChoice && prompt?.needs_choice);
  return {
    active: Boolean(roomStatus === 2 && sourceAccount && targetAccount),
    sourceAccount,
    targetAccount,
    cardName: String(prompt?.card_name || ''),
    waitingConfirm,
    canSetChoice,
    needsChoice,
    choice: String(prompt?.choice || ''),
  };
}
