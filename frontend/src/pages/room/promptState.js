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
  // 2026-10-12 修正：綠卡選完目標後，後端會把 card_prompt 清成 null、改成用
  // green_confirm_prompt 等待目標玩家確認，但這裡原本在 card_prompt 是 null
  // 時會退回用 active_card（還沒被清掉、target 還是 'other'/'one'）重新算出
  // 一整批可點的玩家，導致選完目標後其他玩家卡片看起來還是能再點一次「使用
  // 綠卡」。後端 card_effect() 這時會因為 _pending_green_card 已存在而直接
  // no-op，所以不會真的造成重複效果，但畫面上不該再顯示成可以點選。只要已經
  // 有 green_confirm_prompt（代表目標已選定、正在等確認），這裡就不該再回報
  // 「可以選目標」。
  const hasPendingGreenConfirm = Boolean(dataSnapshot?.green_confirm_prompt);
  const target = String(cardPrompt?.target || activeCard?.target || '');
  let targetAccounts = Array.isArray(cardPrompt?.target_accounts)
    ? cardPrompt.target_accounts.map((value) => String(value || '').trim()).filter(Boolean)
    : [];

  if (!hasPendingGreenConfirm && targetAccounts.length === 0 && (target === 'other' || target === 'one')) {
    targetAccounts = Object.entries(dataSnapshot?.players || {})
      .filter(([account, p]) => Boolean(p?.alive) && (target !== 'other' || account !== selfAccount))
      .map(([account]) => String(account || '').trim())
      .filter(Boolean);
  }

  const name = String(cardPrompt?.name || activeCard?.name || '');

  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === currentAccount && selfStatus === 3 && !hasPendingGreenConfirm && (name || activeCard)),
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
    // 2026-10-17 修正：active 原本只看 roomStatus/sourceAccount/targetAccount，完全沒有
    // 排除「自己其實不是這次綠卡確認的目標」這種情況——這個 active 之前被房間畫面拿去
    // 判斷玩家列表卡片要不要閃爍（見 room.js 的 playerPromptTargets／playerPromptClass），
    // 導致不管是不是輪到自己、甚至自己根本不是這次效果的目標，只要房間裡任何人正在等待
    // 綠卡目標確認，所有人畫面上都會看到那張目標玩家卡片在閃爍。這裡額外把 isTarget 往外
    // 暴露出去，讓呼叫端可以自行判斷「這次閃爍跟我有沒有關係」，藉此只讓真正需要操作的
    // 目標玩家自己看到閃爍，其他人（包含出綠卡的人跟純粹旁觀的其他玩家）改成靜態高亮。
    active: Boolean(roomStatus === 2 && sourceAccount && targetAccount),
    isTarget,
    sourceAccount,
    targetAccount,
    cardName: String(prompt?.card_name || ''),
    waitingConfirm,
    canSetChoice,
    needsChoice,
    choice: String(prompt?.choice || ''),
  };
}
