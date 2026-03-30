import { AUTO_REFRESH_OPTIONS, DAMAGE_ROLE_MARKERS, DAMAGE_TRACK_VALUES, PLAYER_COLOR_HEX } from '../constants.js';
import { getCharacterLocalizedName, getCurrentUiLang } from '../characterInfo.js';
import { t } from '../i18n.js';
import { clearRoomAccount } from '../session.js';
import { apiFetch } from '../utils.js';

let roomAutoRefreshTimer = null;
let roomEventSource = null;
let roomEventConnected = false;
let activeFieldSlot = null;
let activeFieldNumber = null;
let fieldDetailOutsideHandlerBound = false;
let activeCardDetailOutsideHandlerBound = false;
let activeCardDialogAnchor = null;
let latestRoomSnapshot = null;
let diceRollAnimating = false;
let diceRollBusy = false;
let stageNextStepBusy = false;
let pendingAbilityActivation = null;
let pendingDiceAction = null;
let diceRollInterval = null;
let diceRollTimeout = null;
let occupantNamePopupTimer = null;

function formatReplayDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return raw;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const mm = String(parsed.getMinutes()).padStart(2, '0');
  const ss = String(parsed.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function mergeReplayChatMessages(finalState, record) {
  const finalStateMessages = Array.isArray(finalState?.chat_messages) ? finalState.chat_messages : [];
  const recordMessages = Array.isArray(record?.chat_messages) ? record.chat_messages : [];
  const merged = [];
  const seen = new Set();

  [...finalStateMessages, ...recordMessages].forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const key = [
      String(row.id || ''),
      String(row.type || ''),
      String(row.account || ''),
      String(row.name || ''),
      String(row.text || ''),
      String(row.timestamp || ''),
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(row);
  });

  merged.sort((a, b) => {
    const ta = Number(a?.timestamp || 0);
    const tb = Number(b?.timestamp || 0);
    if (ta !== tb) return ta - tb;
    const ia = Number(a?.id || 0);
    const ib = Number(b?.id || 0);
    return ia - ib;
  });

  return merged;
}

function buildReplayRoomState(record) {
  const finalState = record && typeof record.final_state === 'object' ? record.final_state : null;
  const mergedReplayMessages = mergeReplayChatMessages(finalState, record);
  const legacyPlayers = Array.isArray(record?.players) ? record.players : [];
  const legacyRoleByAccount = {};
  const legacyRoleByJoinOrder = {};
  const replayRoleByName = {};
  const replayRoleByAccount = {};
  legacyPlayers.forEach((p, idx) => {
    const account = String(p?.player_id || `player_${idx + 1}`).trim();
    const playerName = String(p?.player_name || '').trim();
    const roleName = String(p?.character_name || '').trim();
    const roleCamp = String(p?.character_camp || '').trim().toLowerCase();
    if (!account) return;
    legacyRoleByAccount[account] = {
      character: roleName,
      camp: roleCamp,
    };
    if (roleName) {
      replayRoleByAccount[account] = roleName;
    }
    if (playerName && roleName) {
      replayRoleByName[playerName] = roleName;
    }
    legacyRoleByJoinOrder[idx + 1] = {
      character: roleName,
      camp: roleCamp,
    };
  });
  const finalStatePlayers = finalState?.players;
  const hasStructuredFinalStatePlayers = (
    finalState
    && finalState.room
    && finalStatePlayers
    && typeof finalStatePlayers === 'object'
    && !Array.isArray(finalStatePlayers)
    && Object.keys(finalStatePlayers).length > 0
  );

  if (hasStructuredFinalStatePlayers) {
    const replayWinners = Array.isArray(record?.winner_players) && record.winner_players.length
      ? record.winner_players
      : (Array.isArray(finalState?.winners) ? finalState.winners : []);
    const winnerSet = new Set(replayWinners.map((value) => String(value || '').trim()).filter(Boolean));
    const serializedPlayers = {};
    Object.entries(finalStatePlayers || {}).forEach(([account, p], idx) => {
      const key = String(account || '').trim() || `player_${idx + 1}`;
      const joinOrder = Number(p?.join_order || idx + 1);
      const legacyRole = legacyRoleByAccount[key] || legacyRoleByJoinOrder[joinOrder] || legacyRoleByJoinOrder[idx + 1] || {};
      const resolvedCharacter = String(p?.character || p?.character_name || legacyRole.character || '').trim();
      const resolvedCamp = String(p?.character_camp || p?.camp || legacyRole.camp || '').trim().toLowerCase();
      serializedPlayers[key] = {
        account: key,
        trip_display: String(p?.trip_display || '-'),
        name: String(p?.name || key),
        join_order: Number(p?.join_order || idx + 1),
        avatar_no: Number(p?.avatar_no || 1),
        color: String(p?.color || 'white'),
        is_ready: Boolean(p?.is_ready),
        alive: Boolean(p?.alive),
        status: Number(p?.status || 0),
        damage: Number(p?.damage ?? 0),
        hp: Number(p?.hp ?? 0),
        invulnerability_source: String(p?.invulnerability_source || ''),
        zone: Number(p?.zone || 0),
        area: p?.area ? String(p.area) : null,
        is_village_manager: false,
        // Replay should reveal final roles even if they were hidden mid-game.
        character_reveal: true,
        character: resolvedCharacter,
        character_name: resolvedCharacter,
        character_camp: resolvedCamp,
        can_use_ability: p?.can_use_ability == null ? null : Boolean(p.can_use_ability),
        ability_status: String(p?.ability_status || ''),
        character_ability_timing: Number(p?.character_ability_timing || 0),
        character_ability_target: String(p?.character_ability_target || ''),
        self_character: null,
        self_character_camp: null,
        self_can_use_ability: null,
        self_character_ability_timing: null,
        self_character_ability_target: null,
        is_invulnerable: Boolean(p?.is_invulnerable),
        invulnerability_sources: [],
        equipment: Array.isArray(p?.equipment) ? p.equipment : [],
        replay_winner: winnerSet.has(key),
        boomed: Boolean(p?.boomed),
      };
    });

    return {
      room: {
        room_id: Number(finalState?.room?.room_id || record?.room_id || 0),
        room_name: String(finalState?.room?.room_name || record?.game_settings?.room_name || `${Number(record?.room_id || 0)}村`),
        room_status: 3,
        player_count: Object.keys(serializedPlayers).length,
        max_players: Number(finalState?.room?.max_players || 8),
        room_comment: String(finalState?.room?.room_comment || record?.game_settings?.room_comment || '-'),
        replay_notice: `歷史回放：${formatReplayDateTime(record?.game_date)}`,
        is_chat_room: false,
      },
      turn: {
        current_trip_display: String(finalState?.turn?.current_trip_display || '-'),
        current_account: finalState?.turn?.current_account ? String(finalState.turn.current_account) : null,
        status: Number(finalState?.turn?.status || 0),
      },
      action_order: Array.isArray(finalState?.action_order) ? finalState.action_order : Object.keys(serializedPlayers),
      move_options: [],
      compass_options: [],
      pending_kill_loot: null,
      pending_steal: null,
      winners: replayWinners,
      area_prompt: null,
      card_prompt: null,
      green_confirm_prompt: null,
      attack_prompt: null,
      active_card_display: null,
      active_card: null,
      dice: {
        D6: Number(finalState?.dice?.D6 || 1),
        D4: Number(finalState?.dice?.D4 || 1),
      },
      fields: Array.isArray(finalState?.fields) ? finalState.fields : [],
      card_piles: finalState?.card_piles && typeof finalState.card_piles === 'object' ? finalState.card_piles : {},
      replay_role_by_name: replayRoleByName,
      replay_role_by_account: replayRoleByAccount,
      players: serializedPlayers,
      chat_messages: mergedReplayMessages,
    };
  }

  const players = legacyPlayers;
  const winnerSet = new Set(Array.isArray(record?.winner_players) ? record.winner_players.map((value) => String(value || '').trim()) : []);
  const colorPool = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'purple', 'orange'];

  const serializedPlayers = {};
  players.forEach((p, idx) => {
    const account = String(p?.player_id || `player_${idx + 1}`).trim();
    serializedPlayers[account] = {
      account,
      trip_display: String(p?.trip_display || '-'),
      name: String(p?.player_name || account),
      join_order: idx + 1,
      avatar_no: Number(p?.avatar_no || 1),
      color: colorPool[idx % colorPool.length],
      is_ready: false,
      alive: Boolean(p?.is_alive),
      status: 0,
      damage: Number(p?.damage_taken ?? 0),
      hp: Number((Number(p?.final_hp ?? 0) || 0) + (Number(p?.damage_taken ?? 0) || 0)),
      invulnerability_source: '',
      zone: 0,
      area: null,
      is_village_manager: false,
      character_reveal: true,
      character: String(p?.character_name || ''),
      character_name: String(p?.character_name || ''),
      character_camp: String(p?.character_camp || '').toLowerCase(),
      self_character: null,
      self_character_camp: null,
      self_can_use_ability: null,
      self_character_ability_timing: null,
      self_character_ability_target: null,
      is_invulnerable: false,
      invulnerability_sources: [],
      equipment: Array.isArray(p?.cards_equipped) ? p.cards_equipped : [],
      replay_winner: winnerSet.has(account),
      boomed: Boolean(p?.boomed),
    };
  });

  return {
    room: {
      room_id: Number(record?.room_id || 0),
      room_name: String(record?.game_settings?.room_name || `${Number(record?.room_id || 0)}村`),
      room_status: 3,
      player_count: players.length,
      max_players: 8,
      room_comment: String(record?.game_settings?.room_comment || '-'),
      replay_notice: `歷史回放：${formatReplayDateTime(record?.game_date)}`,
      is_chat_room: false,
    },
    turn: {
      current_trip_display: '-',
      current_account: null,
      status: 0,
    },
    action_order: Object.keys(serializedPlayers),
    move_options: [],
    compass_options: [],
    pending_kill_loot: null,
    pending_steal: null,
    winners: Array.isArray(record?.winner_players) ? record.winner_players : [],
    area_prompt: null,
    card_prompt: null,
    green_confirm_prompt: null,
    attack_prompt: null,
    active_card_display: null,
    active_card: null,
    dice: { D6: 1, D4: 1 },
    fields: [],
    card_piles: {},
    replay_role_by_name: replayRoleByName,
    replay_role_by_account: replayRoleByAccount,
    players: serializedPlayers,
    chat_messages: mergedReplayMessages,
  };
}

function setPendingDiceAction(action) {
  pendingDiceAction = action || null;
  if (latestRoomSnapshot) renderState(latestRoomSnapshot);
}

const DICE_ANIMATION_DURATION_MS = 900;
const DICE_ANIMATION_TICK_MS = 70;

function normalizeDiceValue(value, sides) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(sides, Math.round(n)));
}

function getTableDiceElements() {
  const root = document;
  const d6El = root.getElementById('stageDiceD6');
  const d4El = root.getElementById('stageDiceD4');
  const badgeWrap = root.querySelector('.stage-center-badges');
  return { d6El, d4El, badgeWrap };
}

function setTableDiceDisplay(d6, d4) {
  const { d6El, d4El } = getTableDiceElements();
  if (!d6El || !d4El) return;
  d6El.textContent = String(d6);
  d4El.textContent = String(d4);
  d6El.setAttribute('aria-label', `六面骰 ${d6}`);
  d4El.parentElement?.setAttribute('aria-label', `四面骰 ${d4}`);
}

function getTableDiceDisplay() {
  const { d6El, d4El } = getTableDiceElements();
  const currentD6 = normalizeDiceValue(d6El?.textContent, 6);
  const currentD4 = normalizeDiceValue(d4El?.textContent, 4);
  return { currentD6, currentD4 };
}

function clearDiceAnimation() {
  if (diceRollInterval) {
    window.clearInterval(diceRollInterval);
    diceRollInterval = null;
  }
  if (diceRollTimeout) {
    window.clearTimeout(diceRollTimeout);
    diceRollTimeout = null;
  }
  diceRollAnimating = false;
  const { badgeWrap } = getTableDiceElements();
  badgeWrap?.classList.remove('is-rolling');
}

function waitDiceAnimationComplete() {
  return new Promise((resolve) => {
    window.setTimeout(resolve, DICE_ANIMATION_DURATION_MS);
  });
}

function playDiceAnimation(finalD6, finalD4, mode = 'both') {
  clearDiceAnimation();
  diceRollAnimating = true;
  const { badgeWrap } = getTableDiceElements();
  badgeWrap?.classList.add('is-rolling');
  const { currentD6, currentD4 } = getTableDiceDisplay();
  const animateD6 = mode === 'both' || mode === 'd6';
  const animateD4 = mode === 'both' || mode === 'd4';

  diceRollInterval = window.setInterval(() => {
    const randomD6 = animateD6 ? 1 + Math.floor(Math.random() * 6) : currentD6;
    const randomD4 = animateD4 ? 1 + Math.floor(Math.random() * 4) : currentD4;
    setTableDiceDisplay(randomD6, randomD4);
  }, DICE_ANIMATION_TICK_MS);

  diceRollTimeout = window.setTimeout(() => {
    clearDiceAnimation();
    const displayD6 = animateD6 ? finalD6 : currentD6;
    const displayD4 = animateD4 ? finalD4 : currentD4;
    setTableDiceDisplay(displayD6, displayD4);
  }, DICE_ANIMATION_DURATION_MS);
}

function getAbilityDiceAnimationMode(characterName) {
  const normalized = String(characterName || '').trim();
  if (normalized === 'Franklin') return 'd6';
  if (normalized === 'George') return 'd4';
  return '';
}

function getCardDiceAnimationMeta(cardName) {
  const normalized = String(cardName || '').trim();
  if (normalized === 'Blessing') {
    return { labelKey: 'room.table_next_step.roll_heal_dice', mode: 'd6' };
  }
  if (normalized === 'Spiritual Doll') {
    return { labelKey: 'room.table_next_step.roll_damage_dice', mode: 'd6' };
  }
  if (normalized === 'Dynamite') {
    return { labelKey: 'room.table_next_step.roll_area_dice', mode: 'both' };
  }
  return null;
}

function getStageNextStepButton() {
  return document.getElementById('stageNextStepButton');
}

const EQUIPMENT_CARD_COLORS = {
  Talisman: 'white',
  'Fortune Brooch': 'white',
  'Mystic Compass': 'white',
  'Holy Robe': 'white',
  'Silver Rosary': 'white',
  'Spear of Longinus': 'white',
  Chainsaw: 'black',
  'Butcher Knife': 'black',
  'Rusted Broad Axe': 'black',
  Masamune: 'black',
  'Machine Gun': 'black',
  Handgun: 'black',
};

const EQUIPMENT_CARD_ICONS = {
  Talisman: '🔮',
  'Fortune Brooch': '💠',
  'Mystic Compass': '🧭',
  'Holy Robe': '🧥',
  'Silver Rosary': '📿',
  'Spear of Longinus': '🗡️',
  Chainsaw: '⚙️',
  'Butcher Knife': '🔪',
  'Rusted Broad Axe': '🪓',
  Masamune: '⚔️',
  'Machine Gun': '🔫',
  Handgun: '🎯',
};

function getLocalizedCardName(cardNameEnglish) {
  const rawName = String(cardNameEnglish || '').trim();
  if (!rawName) return '';
  const key = `room.active_card.names.${rawName}`;
  const localized = t(key);
  return localized && localized !== key ? localized : rawName;
}

function localizeEquipmentOption(option) {
  const rawName = String(option || '').trim();
  if (!rawName) {
    return { value: '', label: '' };
  }
  return {
    value: rawName,
    label: getLocalizedCardName(rawName),
  };
}

function getEquipmentDisplayLabel(equipmentName) {
  const rawName = String(equipmentName || '').trim();
  if (!rawName) return '';
  const icon = EQUIPMENT_CARD_ICONS[rawName] || '🎴';
  const localizedName = getLocalizedCardName(rawName);
  return `${icon} ${localizedName}`;
}

function positionCardInfoDialog(dialogEl, anchorEl) {
  if (!(dialogEl instanceof HTMLDialogElement) || !(anchorEl instanceof HTMLElement)) return;
  const rect = anchorEl.getBoundingClientRect();
  const panelWidth = Math.min(300, window.innerWidth - 24);
  let left = rect.right + 12;
  let top = rect.top - 8;
  if (left + panelWidth > window.innerWidth - 12) {
    left = Math.max(12, rect.left - panelWidth - 12);
  }
  const estimatedHeight = 190;
  if (top + estimatedHeight > window.innerHeight - 12) {
    top = Math.max(12, window.innerHeight - estimatedHeight - 12);
  }
  dialogEl.style.left = `${Math.round(left)}px`;
  dialogEl.style.top = `${Math.round(top)}px`;
}

function closeCardInfoDialog() {
  const dialogEl = document.getElementById('activeCardDialog');
  if (!(dialogEl instanceof HTMLDialogElement) || !dialogEl.open) return;
  activeCardDialogAnchor = null;
  dialogEl.close();
}

function showCardInfoDialog({ cardNameEnglish, cardType = 'Action', cardColor = '', anchorEl = null } = {}) {
  const dialogEl = document.getElementById('activeCardDialog');
  const nameEl = document.getElementById('activeCardDialogName');
  const typeEl = document.getElementById('activeCardDialogType');
  const descEl = document.getElementById('activeCardDialogDesc');
  const rawName = String(cardNameEnglish || '').trim();
  if (!rawName) return;

  const displayName = getLocalizedCardName(rawName) || t('room.active_card.hidden');
  let typeText = '';
  if (String(cardType || '').trim().toLowerCase() === 'equipment') {
    typeText = t('room.active_card.type_equipment');
  } else {
    typeText = t('room.active_card.type_action');
  }
  const normalizedColor = String(cardColor || '').trim().toLowerCase();
  if (normalizedColor) {
    const colorKey = normalizedColor === 'green' ? 'color_green' : normalizedColor === 'white' ? 'color_white' : normalizedColor === 'black' ? 'color_black' : '';
    if (colorKey) typeText = [t(`room.active_card.${colorKey}`), typeText].filter(Boolean).join(' · ');
  }
  const descKey = `room.active_card.desc.${rawName}`;
  const description = t(descKey);
  const descText = description && description !== descKey ? description : t('room.active_card.no_desc');

  if (!(dialogEl instanceof HTMLDialogElement)) {
    window.alert(`${displayName}\n${typeText}\n\n${descText}`);
    return;
  }

  if (nameEl instanceof HTMLElement) nameEl.textContent = displayName;
  if (typeEl instanceof HTMLElement) typeEl.textContent = typeText;
  if (descEl instanceof HTMLElement) descEl.textContent = descText;
  activeCardDialogAnchor = anchorEl instanceof HTMLElement ? anchorEl : null;
  if (!dialogEl.open) dialogEl.show();
  if (activeCardDialogAnchor) positionCardInfoDialog(dialogEl, activeCardDialogAnchor);
}

function openEquipmentCardDialog(equipmentName, anchorEl = null) {
  const rawName = String(equipmentName || '').trim();
  if (!rawName) return;
  showCardInfoDialog({
    cardNameEnglish: rawName,
    cardType: 'Equipment',
    cardColor: EQUIPMENT_CARD_COLORS[rawName] || '',
    anchorEl,
  });
}

function openInvulnerabilityInfoDialog(source, anchorEl = null) {
  const dialogEl = document.getElementById('activeCardDialog');
  const nameEl = document.getElementById('activeCardDialogName');
  const typeEl = document.getElementById('activeCardDialogType');
  const descEl = document.getElementById('activeCardDialogDesc');

  const normalized = String(source || '').trim();
  const normalizedKey = normalized.toLowerCase();
  let sourceName = '';
  let sourceDesc = '';
  if (normalizedKey === 'guardian angel' || normalizedKey === 'guardian_angel') {
    sourceName = getLocalizedCardName('Guardian Angel');
    sourceDesc = t('room.invulnerability_source.guardian_angel_desc');
  } else if (normalizedKey === 'gregor' || normalizedKey === 'gregor ability' || normalizedKey === 'character ability') {
    sourceName = t('room.invulnerability_source.Gregor');
    sourceDesc = t('room.invulnerability_source.gregor_desc');
  } else {
    sourceName = normalized || t('room.invulnerability_source.unknown');
    sourceDesc = t('room.invulnerability_source.unknown_desc');
  }

  if (!(dialogEl instanceof HTMLDialogElement)) {
    window.alert(t('room.invulnerability_source.message', { name: sourceName, source: sourceDesc }));
    return;
  }

  if (nameEl instanceof HTMLElement) nameEl.textContent = sourceName;
  if (typeEl instanceof HTMLElement) typeEl.textContent = t('room.invulnerability_source.title');
  if (descEl instanceof HTMLElement) descEl.textContent = sourceDesc;
  activeCardDialogAnchor = anchorEl instanceof HTMLElement ? anchorEl : null;
  if (!dialogEl.open) dialogEl.show();
  if (activeCardDialogAnchor) positionCardInfoDialog(dialogEl, activeCardDialogAnchor);
}

function clearPendingAbilityActivation() {
  pendingAbilityActivation = null;
}

function isAbilityPlayerTarget(targetType) {
  return targetType === 'other' || targetType === 'one';
}

function getSelfAbilityState(state, dataSnapshot = latestRoomSnapshot) {
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

function canActivateSelfAbilityFromCard(state, dataSnapshot = latestRoomSnapshot) {
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

function getCurrentTurnPlayer(dataSnapshot = latestRoomSnapshot) {
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  if (!currentAccount) return null;
  const player = dataSnapshot?.players?.[currentAccount];
  if (!player) return null;
  return { account: currentAccount, ...player };
}

function isReplayViewState(state, dataSnapshot = latestRoomSnapshot) {
  return String(state?.page || '') === 'replay-room' || Boolean(String(dataSnapshot?.room?.replay_notice || '').trim());
}

function isPreviewLayoutPage(state = null, dataSnapshot = latestRoomSnapshot) {
  if (document.body?.classList?.contains('room-preview-page')) return true;
  if ((document.body?.dataset?.page || '') === 'room-preview') return true;
  return isReplayViewState(state, dataSnapshot);
}

function showOccupantNamePopup(name, anchorEl) {
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

  if (occupantNamePopupTimer) {
    window.clearTimeout(occupantNamePopupTimer);
  }
  occupantNamePopupTimer = window.setTimeout(() => {
    if (popup) popup.hidden = true;
    occupantNamePopupTimer = null;
  }, 1200);
}

function getDiscardEquipmentOptions(dataSnapshot = latestRoomSnapshot) {
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

function getDrawablePileColors(dataSnapshot = latestRoomSnapshot, state = null) {
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

function getAttackPromptState(state, dataSnapshot = latestRoomSnapshot) {
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

function getAreaPromptState(state, dataSnapshot = latestRoomSnapshot) {
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

function getMoveAreaPromptState(state, dataSnapshot = latestRoomSnapshot) {
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
  // Mystic Compass should only prompt area selection after 2 valid options (or 6 from roll 7), not after first roll
  if (compassOptions.length === 1) {
    compassOptions = [];
  }
  const areaNames = Array.from(new Set([...moveOptions, ...compassOptions]));

  return {
    active: Boolean(selfAccount && roomStatus === 2 && selfAccount === currentAccount && selfStatus === 2 && areaNames.length > 0),
    areaNames,
  };
}

function getAbilityAreaPromptState(state, dataSnapshot = latestRoomSnapshot) {
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

  // Emi ability can only target adjacent areas.
  if (characterName === 'Emi') {
    const currentArea = String(player?.area || '').trim();
    const currentIndex = fields.findIndex((field) => String(field?.name || '').trim() === currentArea);
    if (currentIndex < 0) {
      return { active: true, areaNames: [] };
    }
    const areaNames = [currentIndex - 1, currentIndex + 1]
      .filter((index) => index >= 0 && index < fields.length)
      .map((index) => String(fields[index]?.name || '').trim())
      .filter(Boolean);
    return { active: true, areaNames };
  }

  return { active: true, areaNames: allFieldAreaNames };
}

function getCardPromptState(state, dataSnapshot = latestRoomSnapshot) {
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

function getPendingStealState(state, dataSnapshot = latestRoomSnapshot) {
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

function getPendingKillLootState(state, dataSnapshot = latestRoomSnapshot) {
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

function getEquipmentConfirmPromptState(state, dataSnapshot = latestRoomSnapshot) {
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

function getGreenConfirmPromptState(state, dataSnapshot = latestRoomSnapshot) {
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

function updateStagePilePromptState(dataSnapshot = latestRoomSnapshot) {
  const root = document;
  const drawableColors = new Set(getDrawablePileColors(dataSnapshot, null).map((value) => String(value || '').toLowerCase()));
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

function updateStageNextStepButtonState(state, dataSnapshot = latestRoomSnapshot) {
  const button = getStageNextStepButton();
  const { badgeWrap } = getTableDiceElements();

  const hasRoom = Boolean(state?.roomId);
  const selfAccount = String(state?.account || '').trim();
  const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
  const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
  const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
  const drawablePileColors = getDrawablePileColors(dataSnapshot, state);
  const pendingSteal = getPendingStealState(state, dataSnapshot);
  const pendingKillLoot = getPendingKillLootState(state, dataSnapshot);
  const equipmentConfirm = getEquipmentConfirmPromptState(state, dataSnapshot);
  const greenConfirm = getGreenConfirmPromptState(state, dataSnapshot);
  const cardPrompt = getCardPromptState(state, dataSnapshot);
  const attackPrompt = getAttackPromptState(state, dataSnapshot);
  const movePrompt = getMoveAreaPromptState(state, dataSnapshot);

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
    if (pendingAbilityActivation) {
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
    label = t('room.table_next_step.roll_damage_dice');
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
      || (selfStatus === 5 ? 'room.table_next_step.roll_damage_dice' : 'room.table_next_step.roll_move_dice');
    const labelText = t(labelKey);
    const rollPromptLabel = `可${labelText}，請點擊骰子`;
    const idleLabel = labelText;
    badgeWrap.setAttribute('aria-disabled', shouldPromptRoll ? 'false' : 'true');
    badgeWrap.setAttribute('aria-label', shouldPromptRoll ? rollPromptLabel : idleLabel);
  }

  updateStagePilePromptState(dataSnapshot);
}

function clearRoomAutoRefreshTimer() {
  if (roomAutoRefreshTimer) {
    window.clearInterval(roomAutoRefreshTimer);
    roomAutoRefreshTimer = null;
  }
}

function clearRoomEventSource() {
  if (roomEventSource) {
    roomEventSource.close();
    roomEventSource = null;
  }
  roomEventConnected = false;
}

function formatAutoRefreshLabel(seconds, selected) {
  const baseLabel = seconds === 0 ? t('room.auto_refresh.manual') : t('room.auto_refresh.seconds', { n: seconds });
  return selected ? `[${baseLabel}]` : baseLabel;
}

function renderAutoRefreshControls({ el, state, onSelect }) {
  if (!el.autoRefreshOptions) return;

  el.autoRefreshOptions.innerHTML = `
    <span class="auto-refresh-label">[${t('room.auto_refresh.label')}]</span>
    <span class="auto-refresh-group" role="group" aria-label="${t('room.auto_refresh.aria_label')}">
      (
      ${AUTO_REFRESH_OPTIONS.map((seconds) => {
        const selected = Number(state.autoRefreshSeconds || 0) === seconds;
        return `<button class="auto-refresh-option${selected ? ' current' : ''}" type="button" data-auto-refresh-seconds="${seconds}" aria-pressed="${selected}">${formatAutoRefreshLabel(seconds, selected)}</button>`;
      }).join(' ')}
      )
    </span>
  `;

  el.autoRefreshOptions.querySelectorAll('[data-auto-refresh-seconds]').forEach((button) => {
    button.addEventListener('click', () => {
      onSelect(Number(button.getAttribute('data-auto-refresh-seconds')));
    });
  });
}

function clampDamageValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(14, Math.round(numericValue)));
}

function jumpToPlayerCard(account) {
  const normalized = String(account || '').trim();
  if (!normalized) return;
  const card = document.querySelector(`#roomCards [data-player-account="${CSS.escape(normalized)}"]`);
  if (!(card instanceof HTMLElement)) return;
  card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  card.classList.remove('jump-highlight');
  void card.offsetWidth;
  card.classList.add('jump-highlight');
}

function renderDamageMeter({ el, esc }, data) {
  if (!el.damageMeter) return;

  const roleMarkersByDamage = new Map();
  DAMAGE_ROLE_MARKERS.forEach((marker) => {
    const damage = clampDamageValue(marker.hp);
    const existing = roleMarkersByDamage.get(damage) || [];
    existing.push(marker);
    roleMarkersByDamage.set(damage, existing);
  });

  const playerMarkersByDamage = new Map();
  Object.entries(data?.players || {}).forEach(([account, player]) => {
    if (!player?.alive) return;
    const damage = clampDamageValue(player?.damage);
    const existing = playerMarkersByDamage.get(damage) || [];
    existing.push({
      account,
      name: player?.name || account,
      color: player?.color || '',
      exactDamage: Number(player?.damage || 0),
    });
    playerMarkersByDamage.set(damage, existing);
  });

  const rows = [
    {
      label: t('room.damage_meter.damage'),
      type: 'scale',
    },
    {
      label: t('room.damage_meter.roles'),
      type: 'roles',
    },
    {
      label: t('room.damage_meter.players'),
      type: 'players',
    },
  ];

  el.damageMeter.innerHTML = `
    <div class="damage-meter-grid" role="table" aria-label="${esc(t('room.damage_meter.title'))}">
      ${rows.map((row) => `
        <div class="damage-meter-row-label" role="rowheader">${esc(row.label)}</div>
        ${DAMAGE_TRACK_VALUES.map((damage) => {
          if (row.type === 'scale') {
            return `<div class="damage-meter-cell damage-meter-scale-cell" role="cell">${damage}</div>`;
          }

          if (row.type === 'roles') {
            const markers = roleMarkersByDamage.get(damage) || [];
            return `
              <div class="damage-meter-cell" role="cell">
                ${markers.map((marker) => `<span class="damage-meter-badge ${marker.camp.toLowerCase()}" title="${esc(`${marker.camp} ${marker.initial} / HP ${marker.hp}`)}">${esc(String(marker.initial || '').trim().charAt(0).toUpperCase() || '?')}</span>`).join('')}
              </div>
            `;
          }

          const players = playerMarkersByDamage.get(damage) || [];
          return `
            <div class="damage-meter-cell" role="cell">
              ${players.map((player) => {
                const fill = PLAYER_COLOR_HEX[player.color] || '#cccccc';
                const outline = player.color === 'White' ? '#9aa7b2' : 'rgba(0, 0, 0, 0.25)';
                return `<button class="damage-meter-player-chip" type="button" data-player-account="${esc(player.account)}" title="${esc(`${player.name} / ${player.color || '-'} / ${player.exactDamage}`)}" aria-label="${esc(t('ui.player_label', { name: player.name || player.account }))}" style="background:${fill}; border-color:${outline};"></button>`;
              }).join('')}
            </div>
          `;
        }).join('')}
      `).join('')}
    </div>
  `;

  el.damageMeter.querySelectorAll('.damage-meter-player-chip[data-player-account]').forEach((chip) => {
    chip.addEventListener('click', () => {
      jumpToPlayerCard(chip.getAttribute('data-player-account'));
    });
  });
}

export function setVillageInfoMessage({ el, esc }, message) {
  if (el.villageInfoList) {
    const isPreviewPage = /room_preview\.html$/i.test(window.location.pathname || '');
    if (isPreviewPage) {
      el.villageInfoList.innerHTML = `
        <li class="village-info-row village-info-row-message lighttxt">${esc(message)}</li>
      `;
      return;
    }
    el.villageInfoList.innerHTML = `<li class="lighttxt">${esc(message)}</li>`;
  }
}

export function renderVillageInfo({ el, esc, withVillageSuffix, goToRegisterPage, state }, data) {
  if (!el.villageInfoList) return;
  const isPreviewPage = isPreviewLayoutPage(state, data);
  const isReplayView = isReplayViewState(state, data);

  const room = data?.room;
  if (!room) {
    el.villageInfoList.innerHTML = `<li class="lighttxt">${esc(t('room.info.not_joined'))}</li>`;
    return;
  }

  const status = Number(room.room_status);
  const isChatRoom = Boolean(room.is_chat_room);
  const maxPlayers = Number(room.max_players || (isChatRoom ? 50 : 8));
  const statusText = status === 1
    ? t('room.info.status_recruiting')
    : status === 2
      ? t('room.info.status_playing')
      : status === 3
        ? t('room.info.status_finished')
        : String(room.room_status ?? '-');
  const statusClass = status === 1 ? 'room-status recruiting' : status === 2 ? 'room-status playing' : 'room-status';
  const selfPlayer = state?.account ? data?.players?.[state.account] : null;
  const hasJoined = Boolean(selfPlayer);
  const canRegister = !isReplayView && !hasJoined && status >= 1;
  const canLeave = hasJoined && status === 1;
  const isVillageManager = Boolean(selfPlayer?.is_village_manager);
  const canEditSettings = isVillageManager && status === 1;
  const isSelfReady = Boolean(selfPlayer?.is_ready);
  const canToggleReady = Boolean(selfPlayer) && status === 1 && !isChatRoom;
  const canAbolish = isVillageManager && status === 1;
  const canRollCall = isVillageManager && status === 1 && !isChatRoom;
  const villageName = withVillageSuffix(room.room_name || '');
  const villageDescription = room.room_comment || room.village_description || room.description || '-';
  const initialGreenCard = room.enable_initial_green_card ? 'On' : 'Off';
  const boomTimeoutMinutes = Number(room.turn_timeout_minutes || 3);
  const roomSettings = [
    `TRIP:${room.require_trip ? 'On' : 'Off'}`,
    `Mode:${String(room.expansion_mode || 'all')}`,
    `初始綠卡:${initialGreenCard}`,
    `暴斃時間:${boomTimeoutMinutes}分`,
  ].join(' / ');
  const replayNotice = String(room.replay_notice || '').trim();
  const turnTimeout = data?.turn_timeout || null;
  const timeoutRemain = Number(turnTimeout?.remaining_seconds);
  const timeoutCurrent = String(turnTimeout?.current_name || turnTimeout?.current_account || turnTimeout?.current_trip_display || '-').trim();
  const timeoutWarnRow = (status === 2 && Number.isFinite(timeoutRemain))
    ? `<li class="${isPreviewPage ? 'village-info-row ' : ''}room-timeout-warning"><strong>${esc(t('room.info.turn_timeout'))}</strong>${esc(t('room.info.turn_timeout_fmt', { who: timeoutCurrent || '-', n: Math.max(0, timeoutRemain) }))}</li>`
    : '';
  const boomedNotice = data?.boomed_notice || null;
  const boomedName = String(boomedNotice?.name || boomedNotice?.trip_display || '').trim();
  const boomedNoticeRow = (status === 2 && boomedName)
    ? `<li class="${isPreviewPage ? 'village-info-row ' : ''}room-timeout-warning"><strong>${esc(t('room.info.boomed_notice'))}</strong>${esc(t('room.info.boomed_notice_fmt', { name: boomedName }))}</li>`
    : '';

  if (!isPreviewPage) {
    el.villageInfoList.innerHTML = `
      <li>
        <strong>${esc(t('room.info.room_id'))}</strong>${room.room_id ?? '-'}
        ${canAbolish ? `<button id="btnAbolishVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.abolish'))}</button>` : ''}
      </li>
      <li>
        <strong>${esc(t('room.info.status'))}</strong><span class="${statusClass}">${esc(statusText)}</span>
        ${canLeave ? `<button id="btnLeaveVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.leave'))}</button>` : (canRegister ? `<button id="btnOpenResidentRegister" class="btn btn-inline" type="button">${esc(t('room.info.open_register'))}</button>` : '')}
        ${canEditSettings ? `<button id="btnEditRoomSettingsInline" class="btn btn-inline" type="button">${esc(t('room.ops.edit_settings'))}</button>` : ''}
      </li>
      <li>
        <strong>${esc(t('room.info.count'))}</strong>(${Number(room.player_count || 0)}/${maxPlayers})
        ${canToggleReady ? `<button id="btnToggleReadyInline" class="btn btn-inline" type="button">${esc(isSelfReady ? t('room.ops.unready') : t('room.ops.ready'))}</button>` : ''}
        ${canRollCall ? `<button id="btnRollCallInline" class="btn btn-inline" type="button">${esc(t('room.ops.roll_call'))}</button>` : ''}
      </li>
      <li><strong>${esc(t('room.info.name'))}</strong>${esc(villageName || '-')}</li>
      <li><strong>${esc(t('room.info.desc'))}</strong>${esc(villageDescription)}</li>
      ${replayNotice ? `<li><strong>${esc(t('room.info.replay_notice'))}</strong>${esc(replayNotice)}</li>` : ''}
      ${timeoutWarnRow}
      ${boomedNoticeRow}
    `;

    if (canRegister) {
      const btn = el.villageInfoList.querySelector('#btnOpenResidentRegister');
      btn?.addEventListener('click', () => goToRegisterPage(room.room_id));
    }
    return;
  }

  el.villageInfoList.innerHTML = `
    <li class="village-info-row village-info-row-primary">
      <span class="village-info-item"><strong>${esc(t('room.info.name'))}</strong>${esc(villageName || '-')}</span>
      <span class="village-info-item"><strong>${esc(t('room.info.desc'))}</strong>${esc(villageDescription)}</span>
      ${replayNotice ? `<span class="village-info-item village-info-replay"><strong>${esc(t('room.info.replay_notice'))}</strong>${esc(replayNotice)}</span>` : ''}
    </li>
    <li class="village-info-row village-info-row-meta">
      <span class="village-info-item"><strong>${esc(t('room.info.room_id'))}</strong>${room.room_id ?? '-'}</span>
      <span class="village-info-item"><strong>${esc(t('room.info.status'))}</strong><span class="${statusClass}">${esc(statusText)}</span></span>
      <span class="village-info-item"><strong>${esc(t('room.info.count'))}</strong>${Number(room.player_count || 0)}/${maxPlayers}</span>
      <span class="village-info-settings-line">(${esc(roomSettings)})</span>
    </li>
    <li class="village-info-row village-info-row-actions">
      ${canRegister ? `<button id="btnOpenResidentRegister" class="btn btn-inline" type="button">${esc(t('room.info.open_register'))}</button>` : ''}
      ${canLeave ? `<button id="btnLeaveVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.leave'))}</button>` : ''}
      ${canEditSettings ? `<button id="btnEditRoomSettingsInline" class="btn btn-inline" type="button">${esc(t('room.ops.edit_settings'))}</button>` : ''}
      ${canToggleReady ? `<button id="btnToggleReadyInline" class="btn btn-inline" type="button">${esc(isSelfReady ? t('room.ops.unready') : t('room.ops.ready'))}</button>` : ''}
      ${canRollCall ? `<button id="btnRollCallInline" class="btn btn-inline" type="button">${esc(t('room.ops.roll_call'))}</button>` : ''}
      ${canAbolish ? `<button id="btnAbolishVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.abolish'))}</button>` : ''}
    </li>
    ${timeoutWarnRow}
    ${boomedNoticeRow}
  `;

  if (canRegister) {
    const btn = el.villageInfoList.querySelector('#btnOpenResidentRegister');
    btn?.addEventListener('click', () => goToRegisterPage(room.room_id));
  }
}

function renderChatStage({ el, esc }, data, state) {
  if (!el.chatMessages) return;
  const isReplayView = isReplayViewState(state, data);
  const canChat = Boolean(String(state?.account || '').trim()) && !isReplayView;
  const chatInputRow = el.chatInput?.closest('.chat-input-row')
    || el.chatSendButton?.closest('.chat-input-row')
    || document.querySelector('#chatStage .chat-input-row');
  if (chatInputRow instanceof HTMLElement) {
    chatInputRow.style.display = canChat ? 'flex' : 'none';
  }
  if (el.chatInput) {
    el.chatInput.disabled = !canChat;
  }
  if (el.chatSendButton) {
    el.chatSendButton.disabled = !canChat;
  }

  const messages = Array.isArray(data?.chat_messages) ? data.chat_messages : [];
  if (!messages.length) {
    el.chatMessages.innerHTML = `<p class="lighttxt">${esc(t('room.chat.empty'))}</p>`;
    el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
    return;
  }

  const lang = getCurrentUiLang();
  const AREA_NAMES = {
    "Hermit's Cabin": { zh: '隱士小屋', en: "Hermit's Cabin", jp: '隠者の庵' },
    'Church': { zh: '教堂', en: 'Church', jp: '教会' },
    'Cemetery': { zh: '墓園', en: 'Cemetery', jp: '墓地' },
    'Underworld Gate': { zh: '時空之門', en: 'Underworld Gate', jp: '冥界の門' },
    'Weird Woods': { zh: '希望與絕望的森林', en: 'Weird Woods', jp: '希望と絶望の森' },
    'Erstwhile Altar': { zh: '古代祭壇', en: 'Erstwhile Altar', jp: '古の祭壇' },
  };

  // Card color translations
  const CARD_COLORS = {
    Green: { zh: '綠卡', en: 'Green', jp: '緑カード' },
    White: { zh: '白卡', en: 'White', jp: '白カード' },
    Black: { zh: '黑卡', en: 'Black', jp: '黒カード' },
  };

  const GREEN_CARD_SOURCE_NAMES = new Set([
    'Aid', 'Anger', 'Blackmail', 'Bully', 'Exorcism', 'Greed', 'Huddle',
    'Nurturance', 'Prediction', 'Slap', 'Spell', 'Tough Lesson',
  ]);

  const fmtTime = (ts) => {
    const d = new Date((ts || 0) * 1000);
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  };

  const fmtDate = (ts) => {
    const d = new Date((ts || 0) * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${fmtTime(ts)}`;
  };

  const decodeHtml = (value) => {
    const text = document.createElement('textarea');
    text.innerHTML = String(value || '');
    return text.value;
  };

  const getDisplayNameByLabel = (label) => String(label || '').trim();

  const playerEntries = Object.entries(data?.players || {});
  const viewerAccount = String(state?.account || '').trim();
  const roomStatus = Number(data?.room?.room_status || 0);
  const isGameFinished = roomStatus === 3;
  const showRoleInSystemMessages = isGameFinished || isReplayView;
  const replayRoleByName = data?.replay_role_by_name && typeof data.replay_role_by_name === 'object'
    ? data.replay_role_by_name
    : {};
  const replayRoleByAccount = data?.replay_role_by_account && typeof data.replay_role_by_account === 'object'
    ? data.replay_role_by_account
    : {};

  // Wrap player name in blue (plain text only)
  const pidPlain = (name) => {
    const rawName = decodeHtml(name);
    return `<span class="chat-pid">${esc(getDisplayNameByLabel(rawName))}</span>`;
  };

  const resolveAccountByLabel = (label) => {
    const normalized = String(label || '').trim();
    if (!normalized) return '';
    const byAccount = playerEntries.find(([account]) => account === normalized);
    if (byAccount) return String(byAccount[0] || '');
    const byName = playerEntries.find(([, player]) => String(player?.name || '').trim() === normalized);
    return byName ? String(byName[0] || '') : '';
  };

  const getVisibleRoleName = (label, accountHint = '') => {
    const account = String(accountHint || resolveAccountByLabel(label) || '').trim();
    if (!account) {
      const replayRole = String(replayRoleByName[String(label || '').trim()] || '').trim();
      if (!replayRole) return '';
      return getCharacterLocalizedName(replayRole, getCurrentUiLang());
    }
    const player = data?.players?.[account];
    if (!player) {
      const replayRole = String(replayRoleByAccount[account] || replayRoleByName[String(label || '').trim()] || '').trim();
      if (!replayRole) return '';
      return getCharacterLocalizedName(replayRole, getCurrentUiLang());
    }
    const selfRole = account === viewerAccount ? String(player?.self_character || '').trim() : '';
    const publicRole = String(player?.character || player?.character_name || '').trim();
    const roleName = publicRole || selfRole;
    if (!roleName) {
      const replayRole = String(replayRoleByAccount[account] || replayRoleByName[String(label || '').trim()] || '').trim();
      if (!replayRole) return '';
      return getCharacterLocalizedName(replayRole, getCurrentUiLang());
    }
    return getCharacterLocalizedName(roleName, getCurrentUiLang());
  };

  const pidRole = (name, accountHint = '', explicitRoleName = '') => {
    const rawName = decodeHtml(name);
    const normalizedName = String(rawName || '').trim();
    if (!normalizedName || normalizedName === '-') {
      return pidPlain(rawName || '-');
    }
    const rawHint = decodeHtml(accountHint);
    const roleName = String(explicitRoleName || '').trim() || getVisibleRoleName(rawName, rawHint);
    return `${pidPlain(rawName)}<span class="chat-role">(${esc(roleName || '???')})</span>`;
  };

  const pid = (name, accountHint = '') => {
    if (showRoleInSystemMessages) return pidRole(name, accountHint || name);
    return pidPlain(name);
  };

  const canRevealGreenCardName = (sourceLabel = '', targetLabel = '') => {
    if (isGameFinished) return true;
    if (!viewerAccount) return false;
    const viewerName = String(data?.players?.[viewerAccount]?.name || '').trim();
    const normalizedSource = String(decodeHtml(sourceLabel || '') || '').trim();
    const normalizedTarget = String(decodeHtml(targetLabel || '') || '').trim();
    const sourceAccount = resolveAccountByLabel(normalizedSource) || (viewerName && normalizedSource === viewerName ? viewerAccount : '');
    const targetAccount = resolveAccountByLabel(normalizedTarget) || (viewerName && normalizedTarget === viewerName ? viewerAccount : '');
    return viewerAccount === sourceAccount || viewerAccount === targetAccount;
  };

  const areaLabel = (rawAreaName) => {
    const normalized = String(rawAreaName || '').trim();
    const mapped = AREA_NAMES[normalized];
    return mapped?.[lang] || mapped?.zh || esc(normalized);
  };

  const cardColorLabel = (rawColor) => {
    const key = String(rawColor || '').trim();
    return CARD_COLORS[key]?.[lang] || CARD_COLORS[key]?.zh || esc(key);
  };

  const greenCardLabel = (cardName, sourceLabel = '', targetLabel = '') => {
    return canRevealGreenCardName(sourceLabel, targetLabel) ? esc(getLocalizedCardName(cardName)) : '???';
  };

  // Resolve a "卡片 X" or "card X" source string for display.
  // Green cards are masked during the game (only target or after game-end can see the real name).
  // Non-green cards are always shown with a translated name.
  // Returns '' if the source is not a card prefix (falls through to areaLabel).
  const resolveCardEffectSource = (sourceName, targetLabel = '') => {
    const normalized = String(sourceName || '').trim();
    if (!normalized) return '';
    const hasCardPrefix = /^卡片\s+/.test(normalized) || /^card\s+/i.test(normalized);
    if (!hasCardPrefix) return '';
    const plainCardName = normalized
      .replace(/^卡片\s+/, '')
      .replace(/^card\s+/i, '')
      .trim();
    if (!plainCardName) return '';
    if (GREEN_CARD_SOURCE_NAMES.has(plainCardName)) {
      if (canRevealGreenCardName('', targetLabel)) {
        return `卡片 ${esc(getLocalizedCardName(plainCardName))}`;
      }
      return '卡片 (???)';
    }
    return `卡片 ${esc(getLocalizedCardName(plainCardName))}`;
  };

  // Transform a system message text for display.
  // Returns null to suppress the message, or an HTML string.
  const formatSystem = (text, ts) => {
    let m;

    // -- Messages to HIDE --
    if (/已準備$|未準備$|取消準備$/.test(text)) return null;
    if (/^首位行動玩家：/.test(text)) return null;
    // First Aid 的中間效果數值訊息（實際傷害由下方「傷害變為」統一顯示）
    if (/^\[.+\] 因為 卡片 First Aid 效果(?:受到|恢復) \d+ 點傷害$/.test(text)) return null;
    if (/對綠卡.+選擇：/.test(text)) return null;
    if (/^\[.+\] 更換顏色為 /.test(text)) return null;
    if (/^\[.+\] 放棄掠奪 \[.+\] 的裝備/.test(text)) return null;
    // Hide the raw area-effect trigger for Weird/Hurt (result msg shown instead)
    if (/^\[.+\] 在 .+ 對 \[.+\] 執行效果：(?:Heal|Hurt)$/.test(text)) return null;

    // -- Room creation --
    if (/^村莊已建立：/.test(text)) return `村莊建立於 ${fmtDate(ts)}`;

    // -- Join / Leave --
    if ((m = text.match(/^\[(.+)\] 進入了村莊$/))) return `${pid(esc(m[1]), m[1])} 來到村莊大廳`;
    if ((m = text.match(/^\[(.+)\] 離開了村莊$/))) return `${pid(esc(m[1]), m[1])} 離開村莊大廳`;

    // -- Kick votes --
    if ((m = text.match(/^\[(.+)\] 投票剔除 \[(.+)\]/)))
      return `${pid(esc(m[1]), m[1])} 投票剔除 ${pid(esc(m[2]), m[2])}`;
    if ((m = text.match(/^\[(.+)\] 已被投票剔除$/)))
      return `${pid(esc(m[1]), m[1])} 已被投票剔除`;
    if ((m = text.match(/^村長 \[(.+)\] 剔除了 \[(.+)\]$/)))
      return `村長 ${pid(esc(m[1]), m[1])} 剔除了 ${pid(esc(m[2]), m[2])}`;
    if ((m = text.match(/^村長 \[(.+)\] 發起點名/)))
      return '村長發起點名，請盡速準備完成';

    // -- Initial green card --
    if ((m = text.match(/^\[(.+)\]\s*初始綠卡：(.+)$/))) {
      return `初始綠卡：${esc(getLocalizedCardName(String(m[2] || '').trim()))}`;
    }
    if ((m = text.match(/^初始綠卡：(.+)$/))) {
      return `初始綠卡：${esc(getLocalizedCardName(String(m[1] || '').trim()))}`;
    }

    // -- Move dice --
    if ((m = text.match(/^\[(.+)\] 擲移動骰：(.+)$/))) return `${pidRole(esc(m[1]), m[1])} 擲出 ${esc(m[2])}`;
    if ((m = text.match(/^\[(.+)\] 擲出 7，可任選區域$/))) return null;

    // -- Compass roll --
    if ((m = text.match(/^\[(.+)\] 羅盤擲骰：(.+)$/))) return `${pidRole(esc(m[1]), m[1])} 羅盤擲出 ${esc(m[2])}`;
    if ((m = text.match(/^\[(.+)\] 羅盤擲出 7，可任選區域$/))) return null;
    if ((m = text.match(/^\[(.+)\] 羅盤擲到區域：(.+)$/))) {
      const area = areaLabel(m[2]);
      return `${pidRole(esc(m[1]), m[1])} 羅盤擲到 ${area}`;
    }

    // -- Move to area (normal / choice / compass / ability) --
    if ((m = text.match(/^\[(.+)\] (?:移動到|選擇移動到|使用神祕羅盤移動到|發動能力並移動到) (.+)$/))) {
      const area = areaLabel(m[2]);
      return `${pidRole(esc(m[1]), m[1])} 移動至 ${area}`;
    }

    // -- Draw card --
    if ((m = text.match(/^\[(.+)\] 在 .+ 抽到 (.+?)（(.+)\)$/))) {
      const colorStr = cardColorLabel(m[3]);
      const cardName = String(m[3] || '') === 'Green' ? greenCardLabel(m[2], m[1], '') : esc(getLocalizedCardName(m[2]));
      return `${pidRole(esc(m[1]), m[1])} 抽取 ${colorStr}(${cardName})`;
    }

    // -- Green card: assign to target --
    if ((m = text.match(/^\[(.+)\] 指定 \[(.+)\] 接收綠卡 (.+)$/)))
      return `${pidRole(esc(m[2]), m[2])} 執行 綠卡(${greenCardLabel(m[3], m[1], m[2])})`;

    // -- Use action card (with color embedded by backend) --
    if ((m = text.match(/^\[(.+)\] 使用卡片 (.+?)（(.+?)），目標：\[(.+)\]$/))) {
      const colorStr = cardColorLabel(m[3]);
      const cardName = String(m[3] || '') === 'Green' ? greenCardLabel(m[2], m[1], m[4]) : esc(getLocalizedCardName(m[2]));
      if (m[4] === '-') return `${pidRole(esc(m[1]), m[1])} 使用 ${colorStr}(${cardName})`;
      return `${pidRole(esc(m[4]), m[4])} 執行 ${colorStr}(${cardName})`;
    }

    // -- Area action effect (Erstwhile Altar "use", or unknown effects) --
    if ((m = text.match(/^\[(.+)\] 在 (.+) 對 \[(.+)\] 執行效果：(.+)$/))) {
      const area = areaLabel(m[2]);
      return `${pidRole(esc(m[1]), m[1])} 對 ${pidRole(esc(m[3]), m[3])} 發動 ${area} 效果`;
    }

    // -- Ability effect damage with attacker: [受傷者] 因為 [攻擊者](CharName) 角色能力效果受到 N 點傷害 --
    if ((m = text.match(/^\[(.+?)\] 因為 \[(.+?)\]\((.+?)\) 角色能力效果受到 (\d+) 點傷害$/))) {
      return `${pidRole(esc(m[1]), m[1])} 因為 ${pidRole(esc(m[2]), m[2], getCharacterLocalizedName(m[3], lang))} 角色能力效果受到 ${esc(m[4])} 傷害`;
    }
    if ((m = text.match(/^\[(.+?)\] 因為 \[(.+?)\]\((.+?)\) 角色能力效果恢復 (\d+) 點傷害$/))) {
      return `${pidRole(esc(m[1]), m[1])} 因為 ${pidRole(esc(m[2]), m[2], getCharacterLocalizedName(m[3], lang))} 角色能力效果治癒 ${esc(m[4])} 傷害`;
    }

    // -- Area/card effect result messages (generated by backend) --
    if ((m = text.match(/^\[(.+)\] 因為 (.+) 效果(治癒|恢復) (\d+) 點傷害$/))) {
      const sourceLabel = resolveCardEffectSource(m[2], m[1]) || areaLabel(m[2]);
      return `${pidRole(esc(m[1]), m[1])} 因為 ${sourceLabel} 效果${esc(m[3])} ${esc(m[4])} 傷害`;
    }
    if ((m = text.match(/^\[(.+)\] 因為 (.+) 效果受到 (\d+) 點傷害$/))) {
      const sourceLabel = resolveCardEffectSource(m[2], m[1]) || areaLabel(m[2]);
      return `${pidRole(esc(m[1]), m[1])} 因為 ${sourceLabel} 效果受到 ${esc(m[3])} 傷害`;
    }

    if ((m = text.match(/^\[(.+)\] 因為 白卡\(Blessing\) 恢復 (\d+) 點傷害$/)))
      return `${pidRole(esc(m[1]), m[1])} 因為 ${cardColorLabel('White')}(${esc(getLocalizedCardName('Blessing'))}) 恢復 ${esc(m[2])} 點傷害`;
    if ((m = text.match(/^\[(.+)\] 因為 白卡\(First Aid\) 傷害變為 (\d+)$/)))
      return `${pidRole(esc(m[1]), m[1])} 因為 卡片 ${esc(getLocalizedCardName('First Aid'))} 傷害變為${esc(m[2])}`;

    // -- Declare attack --
    if ((m = text.match(/^\[(.+)\] 宣告攻擊 \[(.+)\]$/)))
      return `${pid(esc(m[1]), m[1])} 對 ${pid(esc(m[2]), m[2])} 發動攻擊`;

    // -- Attack roll (hide damage value, show dice only) --
    if ((m = text.match(/^\[(.+)\] 攻擊擲骰：(.+?)，傷害=\d+$/)))
      return `${pidRole(esc(m[1]), m[1])} 擲出 ${esc(m[2])}`;

    // -- Deal damage from attack --
    if ((m = text.match(/^\[(.+)\] 對 \[(.+)\] 造成 (\d+) 點傷害$/)))
      return `${pid(esc(m[2]), m[2])} 被 ${pid(esc(m[1]), m[1])} 攻擊受到 ${esc(m[3])} 傷害`;

    // -- Equipment --
    if ((m = text.match(/^\[(.+)\] 裝備了 (.+)$/)))
      return `${pidRole(esc(m[1]), m[1])} 裝備了 ${esc(getLocalizedCardName(m[2]))}`;
        // -- Green-card steal: [to] 因為 卡片 X 效果 從 [from] 取得裝備 Y --
        if ((m = text.match(/^\[(.+)\] 因為 卡片 (.+) 效果 從 \[(.+)\] 取得裝備 (.+)$/))) {
          const cardLabel = GREEN_CARD_SOURCE_NAMES.has(m[2])
            ? (canRevealGreenCardName(m[3], m[1]) ? `卡片 ${esc(getLocalizedCardName(m[2]))}` : '卡片 (???)')
            : `卡片 ${esc(getLocalizedCardName(m[2]))}`;
          return `${pidRole(esc(m[1]), m[1])} 因為 ${cardLabel} 效果 從 ${pidRole(esc(m[3]), m[3])} 取得裝備 ${esc(getLocalizedCardName(m[4]))}`;
        }
    if ((m = text.match(/^\[(.+)\] 從 \[(.+)\] 取得裝備 (.+)$/)))
      return `${pidRole(esc(m[1]), m[1])} 從 ${pidRole(esc(m[2]), m[2])} 取得裝備 ${esc(getLocalizedCardName(m[3]))}`;
    if ((m = text.match(/^\[(.+)\] 掠奪了 \[(.+)\] 的全部裝備$/)))
      return `${pidRole(esc(m[1]), m[1])} 掠奪了 ${pidRole(esc(m[2]), m[2])} 的全部裝備`;
    if ((m = text.match(/^\[(.+)\] 掠奪 \[(.+)\] 的裝備 (.+)$/)))
      return `${pidRole(esc(m[1]), m[1])} 掠奪了 ${pidRole(esc(m[2]), m[2])} 的裝備 ${esc(getLocalizedCardName(m[3]))}`;

    // -- Skip attack --
    if ((m = text.match(/^\[(.+)\] 本回合放棄攻擊$/)))
      return `${pidRole(esc(m[1]), m[1])} 本回合跳過攻擊`;

    // -- Character / death --
    if ((m = text.match(/^\[(.+)\] 死亡，身份揭示為 (.+)$/)))
      return `${pid(esc(m[1]), m[1])} 死亡，身份揭示為 ${esc(getCharacterLocalizedName(m[2], lang))}`;
    if ((m = text.match(/^\[(.+)\] 回合超時，判定暴斃$/)))
      return `${pid(esc(m[1]), m[1])} 回合超時暴斃`;
    if ((m = text.match(/^\[(.+)\] 主動揭示身份：(.+)$/)))
      return `${pidRole(esc(m[1]), m[1])} 揭示身份：${esc(getCharacterLocalizedName(m[2], lang))}`;

    // -- Game start --
    if (/^遊戲開始，/.test(text)) return '遊戲開始';

    // -- Game end winners --
    if ((m = text.match(/^遊戲結束，勝利者：(.+)$/))) {
      const winnerAccounts = Array.isArray(data?.winners)
        ? data.winners.map((value) => String(value || '').trim()).filter(Boolean)
        : [];

      if (winnerAccounts.length > 0) {
        const winnerTokens = winnerAccounts.map((account) => {
          const player = data?.players?.[account] || {};
          const label = String(player?.name || account || '').trim() || account;
          return pidRole(label, account);
        });
        return `遊戲結束，勝利者：${winnerTokens.join('、')}`;
      }

      const labels = String(m[1] || '')
        .split(/[、,，]/)
        .map((label) => String(label || '').trim())
        .filter(Boolean);
      const winners = labels.map((label) => {
        const match = label.match(/^(.+?)\(([^()]+)\)$/);
        if (match) {
          return pidRole(match[1], match[1], getCharacterLocalizedName(match[2], lang));
        }
        return pidRole(label, label);
      });
      return `遊戲結束，勝利者：${winners.join('、')}`;
    }

    // -- Default: escape text and highlight [name] patterns in blue --
    const safeText = esc(text);
    return safeText.replace(/\[([^\]]+)\]/g, (_, n) => showRoleInSystemMessages ? pidRole(n, n) : `<span class="chat-pid">${n}</span>`);
  };

  const chatLines = [];
  const systemLines = [];
  const nowTs = Math.floor(Date.now() / 1000);
  const pushSystemLine = (htmlText, extraClass = '', ts = nowTs, mirrorToChat = false) => {
    const tsLabel = fmtTime(Number(ts) || nowTs);
    const cls = extraClass ? `system-line ${extraClass}` : 'system-line';
    systemLines.push(`<div class="${cls}">[${esc(tsLabel)}] ${htmlText}</div>`);
    if (mirrorToChat) {
      chatLines.push(`<div class="chat-line chat-line-system">[${esc(tsLabel)}] ${htmlText}</div>`);
    }
  };

  messages.forEach((message) => {
    const msgType = String(message?.type || 'chat').toLowerCase();
    const ts = Number(message?.timestamp || 0);
    const text = String(message?.text || '').trim();
    if (msgType === 'system') {
      const formatted = formatSystem(text, ts);
      if (formatted) pushSystemLine(formatted, '', ts, true);
      return;
    }
    const account = String(message?.account || '').trim();
    const mappedName = String(data?.players?.[account]?.name || '').trim();
    const rawMessageName = String(message?.name || '').trim();
    const resolvedFromName = String(data?.players?.[rawMessageName]?.name || '').trim();
    const name = mappedName || resolvedFromName || rawMessageName || account || '';
    const timeStr = fmtTime(ts);
    const isSelf = Boolean(state?.account) && account === String(state.account || '');
    const cls = isSelf ? 'chat-line chat-line-self' : 'chat-line';
    const chatTextHtml = esc(text).replace(/\r\n|\r|\n/g, '<br>');
    chatLines.push(`<div class="${cls}"><div class="chat-sender">${esc(name || '-')}<span class="chat-time">(${timeStr})</span>:</div><div class="chat-text">${chatTextHtml}</div></div>`);
  });

  el.chatMessages.innerHTML = chatLines.length
    ? chatLines.join('')
    : `<p class="lighttxt">${esc(t('room.chat.empty'))}</p>`;

  if (el.systemMessages) {
    const timeoutRemain = Number(data?.turn_timeout?.remaining_seconds);
    if (Number.isFinite(timeoutRemain)) {
      const timeoutCurrent = String(data?.turn_timeout?.current_name || data?.turn_timeout?.current_account || data?.turn_timeout?.current_trip_display || '-').trim();
      pushSystemLine(esc(t('room.info.turn_timeout_fmt', { who: timeoutCurrent || '-', n: Math.max(0, timeoutRemain) })), 'system-timeout');
    }
    el.systemMessages.innerHTML = systemLines.length
      ? systemLines.join('')
      : `<p class="lighttxt">${esc(t('room.chat.empty'))}</p>`;
  }

  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
  if (el.systemMessages) {
    el.systemMessages.scrollTop = el.systemMessages.scrollHeight;
  }
}

function setSelectOptions(selectEl, values, placeholder) {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  const first = document.createElement('option');
  first.value = '';
  first.textContent = placeholder;
  selectEl.appendChild(first);
  values.forEach((v) => {
    const opt = document.createElement('option');
    if (typeof v === 'object' && v !== null) {
      opt.value = v.value;
      opt.textContent = v.label;
    } else {
      opt.value = v;
      opt.textContent = v;
    }
    selectEl.appendChild(opt);
  });
}

function orderedPlayerEntries(data) {
  const players = data?.players || {};
  const actionOrder = Array.isArray(data?.action_order) ? data.action_order : [];
  const orderIndex = new Map(actionOrder.map((acc, idx) => [String(acc), idx]));
  const inGameOrder = Number(data?.room?.room_status || 0) >= 2 && orderIndex.size > 0;
  return Object.entries(players).sort(([accA, a], [accB, b]) => {
    if (inGameOrder) {
      const ia = orderIndex.has(accA) ? Number(orderIndex.get(accA)) : Number.MAX_SAFE_INTEGER;
      const ib = orderIndex.has(accB) ? Number(orderIndex.get(accB)) : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
    }
    const ao = Number(a?.join_order || 0);
    const bo = Number(b?.join_order || 0);
    if (ao && bo) return ao - bo;
    if (ao) return -1;
    if (bo) return 1;
    return 0;
  });
}

function renderPlayersTable({ el, statusText }, data) {
  if (!el.playersTbody) return;
  el.playersTbody.innerHTML = '';
  const entries = orderedPlayerEntries(data);
  if (!entries.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="6" class="lighttxt">${t('ui.no_players')}</td>`;
    el.playersTbody.appendChild(tr);
    return;
  }

  entries.forEach(([account, p]) => {
    const displayTrip = p.trip_display || '-';
    const equipmentText = (p.equipment || []).map(getEquipmentDisplayLabel).filter(Boolean).join(', ') || '-';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${displayTrip}</td>
      <td>${p.alive ? t('common.alive') : t('common.dead')}</td>
      <td>${p.status} (${statusText[p.status] || t('common.unknown')})</td>
      <td>${p.area || '-'} / Z${p.zone || 0}</td>
      <td>${p.damage}/${p.hp}</td>
      <td>${equipmentText}</td>
    `;
    el.playersTbody.appendChild(tr);
  });
}

function renderSummary({ el, statusText }, data) {
  if (!el.sumRoomId || !el.sumRoomStatus || !el.sumCurrentPlayer || !el.sumTurnStatus) return;
  const room = data?.room || {};
  const turn = data?.turn || {};
  el.sumRoomId.textContent = room.room_id ?? '-';
  const roomStatus = Number(room.room_status || 0);
  const roomStatusText = roomStatus === 1
    ? t('room.info.status_recruiting')
    : roomStatus === 2
      ? t('room.info.status_playing')
      : roomStatus === 3
        ? t('room.info.status_finished')
        : String(room.room_status ?? '-');
  el.sumRoomStatus.textContent = roomStatusText;
  el.sumCurrentPlayer.textContent = turn.current_trip_display || '-';
  el.sumTurnStatus.textContent = turn.status == null ? '-' : `${turn.status} (${statusText[turn.status] || t('common.unknown')})`;
}

function renderTablePileCounts(data) {
  const colorMap = {
    green: 'Green',
    white: 'White',
    black: 'Black',
  };
  const root = document;
  root.querySelectorAll('.table-stage [data-pile-type][data-card-color]').forEach((cardEl) => {
    const pileType = String(cardEl.getAttribute('data-pile-type') || '').toLowerCase();
    const colorKey = String(cardEl.getAttribute('data-card-color') || '').toLowerCase();
    const color = colorMap[colorKey];
    const countEl = cardEl.querySelector('.stage-pile-count');
    if (!countEl || !color) return;

    const colorPiles = data?.card_piles?.[color] || {};
    const raw = pileType === 'discard' ? colorPiles.discard : colorPiles.deck;
    const count = Number.isFinite(Number(raw)) ? Number(raw) : 0;
    countEl.textContent = String(count);
  });
}

function openActiveCardDialog() {
  const activeCardDisplay = latestRoomSnapshot?.active_card_display || null;
  const rawActiveCard = latestRoomSnapshot?.active_card || null;
  if (!activeCardDisplay || !rawActiveCard) return;
  showCardInfoDialog({
    cardNameEnglish: String(activeCardDisplay?.name || rawActiveCard?.name || '').trim(),
    cardType: String(rawActiveCard?.type || '').trim(),
    cardColor: String(rawActiveCard?.color || '').toLowerCase(),
    anchorEl: document.getElementById('activeCardDisplay'),
  });
}

function renderActiveCardDisplay(data) {
  const displayEl = document.getElementById('activeCardDisplay');
  const nameEl = document.getElementById('activeCardName');
  if (!(displayEl instanceof HTMLElement) || !(nameEl instanceof HTMLElement)) return;

  const activeCardDisplay = data?.active_card_display || null;
  const rawActiveCard = data?.active_card || null;
  const color = String(activeCardDisplay?.color || rawActiveCard?.color || '').toLowerCase();
  const cardNameEnglish = typeof activeCardDisplay?.name === 'string'
    ? activeCardDisplay.name.trim()
    : (typeof rawActiveCard?.name === 'string' ? rawActiveCard.name.trim() : '');

  // 物件要常駐：沒有卡時維持無色虛線
  displayEl.hidden = false;
  displayEl.removeAttribute('role');
  displayEl.removeAttribute('tabindex');
  displayEl.setAttribute('aria-disabled', 'true');
  displayEl.removeAttribute('data-card-color');
  nameEl.textContent = '';

  if (!color) {
    displayEl.setAttribute('aria-label', t('room.active_card.label'));
    return;
  }

  displayEl.setAttribute('data-card-color', color);

  if (cardNameEnglish) {
    // 使用本地化的卡片名字
    const localizedCardName = t(`room.active_card.names.${cardNameEnglish}`) || cardNameEnglish;
    nameEl.textContent = localizedCardName;
    displayEl.setAttribute('role', 'button');
    displayEl.setAttribute('tabindex', '0');
    displayEl.setAttribute('aria-disabled', 'false');
    displayEl.setAttribute('aria-label', `${t('room.active_card.label')} ${localizedCardName}`);
  } else {
    // 綠卡未授權者只能看到綠色，不可得知名稱與效果
    nameEl.textContent = '';
    displayEl.setAttribute('aria-label', t('room.active_card.label'));
  }
}

function renderTableDice(data) {
  const d6 = normalizeDiceValue(data?.dice?.D6, 6);
  const d4 = normalizeDiceValue(data?.dice?.D4, 4);
  if (diceRollAnimating) return;
  setTableDiceDisplay(d6, d4);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FIELD_NUMBERS_BY_NAME = Object.freeze({
  "Hermit's Cabin": [2, 3],
  'Underworld Gate': [4, 5],
  Church: [6],
  Cemetery: [8],
  'Weird Woods': [9],
  'Erstwhile Altar': [10],
});

const FIELD_NUMBERS_BY_SLOT = Object.freeze([
  [2, 3],
  [4, 5],
  [6],
  [8],
  [9],
  [10],
]);

function normalizeFieldNumbers(field, slot) {
  const rawNumbers = [];
  if (Array.isArray(field?.numbers)) rawNumbers.push(...field.numbers);
  if (Array.isArray(field?.number)) rawNumbers.push(...field.number);

  const parsed = rawNumbers
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.trunc(value));

  const deduped = Array.from(new Set(parsed));
  if (deduped.length > 0) return deduped;

  const areaName = String(field?.name || '').trim();
  if (FIELD_NUMBERS_BY_NAME[areaName]) {
    return FIELD_NUMBERS_BY_NAME[areaName].slice();
  }

  if (Number.isInteger(slot) && FIELD_NUMBERS_BY_SLOT[slot]) {
    return FIELD_NUMBERS_BY_SLOT[slot].slice();
  }

  return [];
}

function renderFieldCards(data, state = null) {
  const root = document;
  const cards = Array.from(root.querySelectorAll('.table-stage [data-field-slot]'));
  const detailPanel = root.getElementById('stageFieldDetail');
  const detailName = root.getElementById('stageFieldDetailName');
  const detailNumbers = root.getElementById('stageFieldDetailNumbers');
  const detailDescription = root.getElementById('stageFieldDetailDescription');
  const detailClose = root.getElementById('stageFieldDetailClose');
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const movePrompt = state ? getMoveAreaPromptState(state, data) : { active: false, areaNames: [] };
  const movePromptSet = new Set((movePrompt.areaNames || []).map((value) => String(value || '').trim()));
  const abilityAreaPrompt = state ? getAbilityAreaPromptState(state, data) : { active: false, areaNames: [] };
  const abilityAreaPromptSet = new Set((abilityAreaPrompt.areaNames || []).map((value) => String(value || '').trim()));
  const occupantsByFieldName = new Map();

  Object.entries(data?.players || {}).forEach(([account, player]) => {
    const areaName = String(player?.area || '').trim();
    if (!areaName) return;
    if (!player?.alive) return;
    const existing = occupantsByFieldName.get(areaName) || [];
    existing.push({
      account,
      name: player?.name || account,
      color: player?.color || '',
      alive: Boolean(player?.alive),
    });
    occupantsByFieldName.set(areaName, existing);
  });

  if (typeof activeFieldSlot === 'number' && !fields[activeFieldSlot]) {
    activeFieldSlot = null;
    activeFieldNumber = null;
  }

  const closeFieldDetail = () => {
    activeFieldSlot = null;
    activeFieldNumber = null;
    if (detailPanel) detailPanel.hidden = true;
    cards.forEach((cardEl) => cardEl.classList.remove('is-active'));
    root.querySelectorAll('.stage-field-number.is-selected').forEach((button) => button.classList.remove('is-selected'));
  };

  const positionDetailPanel = (anchorEl) => {
    if (!detailPanel || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const panelWidth = Math.min(300, window.innerWidth - 24);
    let left = rect.right + 12;
    let top = rect.top - 8;
    if (left + panelWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.left - panelWidth - 12);
    }
    const estimatedHeight = 180;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    }
    detailPanel.style.left = `${Math.round(left)}px`;
    detailPanel.style.top = `${Math.round(top)}px`;
  };

  const openFieldDetail = (slot, field, number, anchorEl) => {
    if (!field || !detailPanel || !detailName || !detailNumbers || !detailDescription) return;
    const numbers = normalizeFieldNumbers(field, slot);
    activeFieldSlot = slot;
    activeFieldNumber = number;
    detailName.textContent = field.display_name || field.name || '場地資訊';
    detailNumbers.innerHTML = numbers
      .map((value) => `<span class="stage-field-detail-number">${escapeHtml(value)}</span>`)
      .join('');
    detailDescription.textContent = field.description || '目前沒有額外說明。';
    detailPanel.hidden = false;
    positionDetailPanel(anchorEl);
    cards.forEach((cardEl) => {
      cardEl.classList.toggle('is-active', Number(cardEl.getAttribute('data-field-slot')) === slot);
    });
    root.querySelectorAll('.stage-field-number').forEach((button) => {
      const sameSlot = Number(button.getAttribute('data-field-open')) === slot;
      const sameNumber = Number(button.getAttribute('data-field-number')) === number;
      button.classList.toggle('is-selected', sameSlot && sameNumber);
    });
  };

  if (detailClose) {
    detailClose.onclick = closeFieldDetail;
  }

  if (!fieldDetailOutsideHandlerBound) {
    document.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#stageFieldDetail') || target.closest('.stage-field-number')) return;
      closeFieldDetail();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeFieldDetail();
    });
    window.addEventListener('resize', () => {
      if (!detailPanel || detailPanel.hidden) return;
      const activeButton = document.querySelector('.stage-field-number.is-selected');
      if (activeButton instanceof HTMLElement) positionDetailPanel(activeButton);
    });
    fieldDetailOutsideHandlerBound = true;
  }

  cards.forEach((cardEl) => {
    const slot = Number(cardEl.getAttribute('data-field-slot'));
    const field = fields[slot] || null;
    const nameEl = cardEl.querySelector('.stage-field-name');
    const numberListEl = cardEl.querySelector('.stage-field-number-list');
    const occupantsEl = cardEl.querySelector('.stage-field-occupants');
    const displayName = field?.display_name || field?.name || '未翻開';
    const numbers = normalizeFieldNumbers(field, slot);
    const occupants = field ? (occupantsByFieldName.get(field.name) || []).slice(0, 8) : [];
    const normalizedAreaName = String(field?.name || '').trim();
    const isMoveTargetPrompt = Boolean(movePrompt.active && normalizedAreaName && movePromptSet.has(normalizedAreaName));
    const isAbilityTargetPrompt = Boolean(abilityAreaPrompt.active && normalizedAreaName && abilityAreaPromptSet.has(normalizedAreaName));
    const isTargetPrompt = isMoveTargetPrompt || isAbilityTargetPrompt;

    cardEl.classList.toggle('is-empty', !field);
    cardEl.classList.toggle('is-active', field && activeFieldSlot === slot);
    cardEl.classList.toggle('move-target-prompt', isTargetPrompt);
    cardEl.setAttribute('aria-label', field ? `場地卡 ${displayName}` : '場地卡 未翻開');

    if (isTargetPrompt) {
      cardEl.setAttribute('role', 'button');
      cardEl.setAttribute('tabindex', '0');
      if (isMoveTargetPrompt) {
        cardEl.setAttribute('aria-label', `可移動到 ${displayName}`);
      } else {
        cardEl.setAttribute('aria-label', `可選擇能力目標 ${displayName}`);
      }
    } else {
      cardEl.removeAttribute('role');
      cardEl.removeAttribute('tabindex');
    }

    if (nameEl) {
      nameEl.textContent = displayName;
    }

    if (numberListEl) {
      if (!field || !numbers.length) {
        numberListEl.innerHTML = `
          <span class="stage-field-number-static" aria-hidden="true">?</span>
        `;
      } else {
        numberListEl.innerHTML = numbers
          .map((number) => `
            <button
              class="stage-field-number"
              type="button"
              data-field-open="${slot}"
              data-field-number="${escapeHtml(number)}"
              aria-label="查看 ${escapeHtml(displayName)} 的 ${escapeHtml(number)} 號說明"
            >${escapeHtml(number)}</button>
          `)
          .join('');

        numberListEl.querySelectorAll('[data-field-open]').forEach((button) => {
          button.addEventListener('click', () => openFieldDetail(slot, field, Number(button.getAttribute('data-field-number')), button));
        });
      }
    }

    if (occupantsEl) {
      const slots = Array.from({ length: 8 }, (_, index) => occupants[index] || null);
      occupantsEl.innerHTML = slots
        .map((occupant) => {
          if (!occupant) return '<span class="stage-field-occupant is-empty" aria-hidden="true"></span>';
          const fill = PLAYER_COLOR_HEX[occupant.color] || '#c9d8e4';
          const border = occupant.color === 'White' ? '#9aa7b2' : 'rgba(0, 0, 0, 0.22)';
          return `<button class="stage-field-occupant" type="button" data-occupant-account="${escapeHtml(occupant.account)}" data-occupant-name="${escapeHtml(occupant.name)}" title="${escapeHtml(`${occupant.name} / ${occupant.color || '-'}`)}" aria-label="查看 ${escapeHtml(occupant.name)}" style="background:${fill}; border-color:${border};"></button>`;
        })
        .join('');
      occupantsEl.querySelectorAll('[data-occupant-account]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          showOccupantNamePopup(button.getAttribute('data-occupant-name') || '', button);
        });
      });
    }
  });

  if (typeof activeFieldSlot === 'number' && fields[activeFieldSlot]) {
    const activeButton = document.querySelector(`.stage-field-number[data-field-open="${activeFieldSlot}"][data-field-number="${activeFieldNumber}"]`)
      || document.querySelector(`.stage-field-number[data-field-open="${activeFieldSlot}"]`);
    if (activeButton instanceof HTMLElement) {
      const nextNumber = Number(activeButton.getAttribute('data-field-number')) || activeFieldNumber || 0;
      openFieldDetail(activeFieldSlot, fields[activeFieldSlot], nextNumber, activeButton);
    }
  } else if (detailPanel) {
    detailPanel.hidden = true;
  }
}

function patchPreviewCardsInRoom() {
  if (!isPreviewLayoutPage()) return;
  const cards = document.querySelectorAll('#roomCards .player-card');
  cards.forEach((card) => {
    const hpRow = card.querySelector('.player-card-hp');
    const idBlock = card.querySelector('.player-id-block');

    const colorCell = card.querySelector('.player-card-head .player-color-cell');
    const nickname = hpRow?.querySelector('.player-card-nickname');
    if (colorCell && hpRow && nickname) {
      hpRow.insertBefore(colorCell, nickname);
    }

    const metaArea = card.querySelector('.player-card-meta');
    const metaRole = card.querySelector('.player-card-meta-role');
    if (idBlock && metaArea) idBlock.appendChild(metaArea);
    if (idBlock && metaRole) idBlock.appendChild(metaRole);

    const coloredDiamond = hpRow?.querySelector('.trip-prefix-diamond:not(.trip-prefix-diamond-fixed)');
    const tripRow = card.querySelector('.player-card-role');
    if (coloredDiamond && tripRow) {
      tripRow.insertBefore(coloredDiamond, tripRow.firstChild);
    }

    card.querySelectorAll('.trip-prefix-diamond-fixed').forEach((el) => el.remove());
    if (tripRow) {
      const allTripDiamonds = Array.from(tripRow.querySelectorAll('.trip-prefix-diamond'));
      allTripDiamonds.slice(1).forEach((el) => el.remove());
    }
  });
}

export function renderState({
  state,
  el,
  esc,
  persistSession,
  renderVillageInfo,
  renderPlayerCards,
  statusText,
  areaNames,
}, data) {
  if (!data) return;
  latestRoomSnapshot = data;
  if (el.gameState) el.gameState.textContent = JSON.stringify(data, null, 2);
  renderDamageMeter({ el, esc }, data);
  renderFieldCards(data, state);
  renderTableDice(data);
  renderTablePileCounts(data);
  renderActiveCardDisplay(data);

  const currentRoomId = data.room?.room_id || state.roomId;
  let sessionDirty = false;

  if (data.room?.room_id) {
    state.roomId = data.room.room_id;
    sessionDirty = true;
  }

  if (currentRoomId && data.players != null) {
    if (!state.roomAccounts) state.roomAccounts = {};
    if (state.account && !(state.account in data.players)) {
      // Account no longer in this room — clear it
      delete state.roomAccounts[currentRoomId];
      state.account = '';
      sessionDirty = true;
    } else if (state.account && state.account in data.players) {
      // Account confirmed present — keep map in sync
      if (state.roomAccounts[currentRoomId] !== state.account) {
        state.roomAccounts[currentRoomId] = state.account;
        sessionDirty = true;
      }
    }
  }

  if (sessionDirty) persistSession(state);

  if (el.startGameForm) {
    const startFieldset = el.startGameForm.closest('fieldset');
    if (startFieldset) startFieldset.hidden = Boolean(data?.room?.is_chat_room);
  }

  renderVillageInfo(data);
  renderChatStage({ el, esc }, data, state);
  renderSummary({ el, statusText }, data);
  renderPlayersTable({ el, statusText }, data);
  const areaPrompt = getAreaPromptState(state, data);
  const cardPrompt = getCardPromptState(state, data);
  const greenConfirm = getGreenConfirmPromptState(state, data);
  const pendingSteal = getPendingStealState(state, data);
  const pendingKillLoot = getPendingKillLootState(state, data);
  const attackPrompt = getAttackPromptState(state, data);
  const playerPromptTargets = pendingDiceAction
    ? []
    : pendingKillLoot.active
    ? pendingKillLoot.deathAccounts
    : pendingSteal.active
    ? [pendingSteal.fromAccount]
    : greenConfirm.active
      ? [greenConfirm.targetAccount]
    : areaPrompt.active
      ? areaPrompt.targetAccounts
      : cardPrompt.active && cardPrompt.targetAccounts.length > 0
        ? cardPrompt.targetAccounts
        : pendingAbilityActivation && isAbilityPlayerTarget(pendingAbilityActivation.targetType)
          ? Object.entries(data?.players || {})
            .filter(([account, p]) => {
              if (!p?.alive || account === state.account) return false;
              if (String(pendingAbilityActivation.character || '').trim() !== 'Ultra Soul') return true;
              return String(p?.area || '').trim() === 'Underworld Gate';
            })
            .map(([account]) => String(account || '').trim())
            .filter(Boolean)
        : attackPrompt.active
          ? attackPrompt.targetAccounts
          : [];
  const playerPromptClass = (pendingKillLoot.active || pendingSteal.active || areaPrompt.active || cardPrompt.active) ? 'area-target-prompt' : 'attack-target-prompt';
  const handleEquipmentChipClick = ({ equipmentName, anchorEl }) => {
    openEquipmentCardDialog(equipmentName, anchorEl);
  };
  const handleShieldChipClick = ({ source, anchorEl }) => {
    openInvulnerabilityInfoDialog(source, anchorEl);
  };
  renderPlayerCards(el.roomCards, data, { view: 'room', enableVoteKick: true, targetAccounts: playerPromptTargets, targetPromptClass: playerPromptClass, onEquipmentChipClick: handleEquipmentChipClick, onShieldChipClick: handleShieldChipClick });
  patchPreviewCardsInRoom();
  renderPlayerCards(el.battleCards, data, { view: 'flow', targetAccounts: playerPromptTargets, targetPromptClass: playerPromptClass, onEquipmentChipClick: handleEquipmentChipClick, onShieldChipClick: handleShieldChipClick });

  const playerTargets = orderedPlayerEntries(data)
    .filter(([, p]) => p.alive)
    .map(([account, p]) => ({
      value: account,
      label: p.name || p.trip_display || account,
    }));
  setSelectOptions(el.quickPlayerTarget, playerTargets, t('room.quick.select_player'));

  const areaTargets = Array.from(new Set([...(data?.move_options || []), ...(data?.compass_options || []), ...areaNames]));
  setSelectOptions(el.quickAreaTarget, areaTargets, t('room.quick.select_area'));

  if (data?.pending_kill_loot?.death_accounts?.length) {
    if (el.lootFromAccount) el.lootFromAccount.value = data.pending_kill_loot.death_accounts[0];
  }

  if (pendingAbilityActivation) {
    const stillValid = canActivateSelfAbilityFromCard(state, data)
      && pendingAbilityActivation.account === state.account
      && pendingAbilityActivation.character === data?.players?.[state.account || '']?.self_character
      && pendingAbilityActivation.timing === Number(data?.players?.[state.account || '']?.self_character_ability_timing || 0);
    if (!stillValid) clearPendingAbilityActivation();
  }

  updateStageNextStepButtonState(state, data);
}

export function bindRoomEvents({
  el,
  state,
  dispatch,
  persistSession,
  refreshRooms,
  toast,
  renderState,
  setVillageInfoMessage,
  goToLobbyPage,
}) {
  if (el.roomInfo?.dataset.bound === 'true') return;

  const sendChatMessage = async () => {
    if (String(state?.page || '') === 'replay-room') return;
    const roomId = Number(state.roomId || latestRoomSnapshot?.room?.room_id || 0);
    const account = String(state.account || '').trim();
    const text = String(el.chatInput?.value || '').trim();
    if (!roomId || !account || !text) return;
    try {
      const data = await dispatch('send_chat', {
        room_id: roomId,
        account,
        message: text,
      });
      if (el.chatInput) el.chatInput.value = '';
      renderState(data);
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    }
  };

  const showAreaChoiceDialog = ({ title, message, hurtLabel, healLabel, cancelLabel }) => new Promise((resolve) => {
    const dialog = el.areaChoiceDialog;
    if (!(dialog instanceof HTMLDialogElement)) {
      const raw = window.prompt(`${message}\n1. ${hurtLabel}\n2. ${healLabel}\n0. ${cancelLabel}`, '0');
      if (raw === '1') resolve('Hurt');
      else if (raw === '2') resolve('Heal');
      else resolve('Cancel');
      return;
    }

    if (el.areaChoiceTitle) el.areaChoiceTitle.textContent = title;
    if (el.areaChoiceMessage) el.areaChoiceMessage.textContent = message;
    if (el.areaChoiceHurtButton) el.areaChoiceHurtButton.textContent = hurtLabel;
    if (el.areaChoiceHealButton) el.areaChoiceHealButton.textContent = healLabel;
    if (el.areaChoiceCancelButton) el.areaChoiceCancelButton.textContent = cancelLabel;

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.areaChoiceHurtButton?.removeEventListener('click', onHurt);
      el.areaChoiceHealButton?.removeEventListener('click', onHeal);
      el.areaChoiceCancelButton?.removeEventListener('click', onCancelClick);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close('Cancel');
    };
    const onClose = () => finish(dialog.returnValue || 'Cancel');
    const onHurt = () => dialog.close('Hurt');
    const onHeal = () => dialog.close('Heal');
    const onCancelClick = () => dialog.close('Cancel');

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.areaChoiceHurtButton?.addEventListener('click', onHurt);
    el.areaChoiceHealButton?.addEventListener('click', onHeal);
    el.areaChoiceCancelButton?.addEventListener('click', onCancelClick);
    dialog.showModal();
  });

  const showEquipmentChoiceDialog = ({ title, message, options, cancelLabel }) => new Promise((resolve) => {
    const dialog = el.equipmentChoiceDialog;
    const optionsHost = el.equipmentChoiceOptions;
    const normalizedOptions = (Array.isArray(options) ? options : [])
      .map((option) => {
        if (option && typeof option === 'object') {
          return {
            value: String(option.value || '').trim(),
            label: String(option.label || option.value || '').trim(),
          };
        }
        const value = String(option || '').trim();
        return { value, label: value };
      })
      .filter((option) => option.value);
    if (!(dialog instanceof HTMLDialogElement) || !(optionsHost instanceof HTMLElement)) {
      const raw = window.prompt(`${message}\n${normalizedOptions.map((option, index) => `${index + 1}. ${option.label}`).join('\n')}\n0. ${cancelLabel}`, '0');
      const selectedIndex = Number(raw);
      if (Number.isInteger(selectedIndex) && selectedIndex >= 1 && selectedIndex <= normalizedOptions.length) {
        resolve(normalizedOptions[selectedIndex - 1].value);
      } else {
        resolve('');
      }
      return;
    }

    if (el.equipmentChoiceTitle) el.equipmentChoiceTitle.textContent = title;
    if (el.equipmentChoiceMessage) el.equipmentChoiceMessage.textContent = message;
    if (el.equipmentChoiceCancelButton) el.equipmentChoiceCancelButton.textContent = cancelLabel;
    optionsHost.innerHTML = normalizedOptions
      .map((option) => `<button class="equipment-choice-option" type="button" data-equipment-choice="${String(option.value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" aria-label="${String(option.label).replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${String(option.label).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</button>`)
      .join('');

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.equipmentChoiceCancelButton?.removeEventListener('click', onCancelClick);
      optionsHost.querySelectorAll('[data-equipment-choice]').forEach((button) => {
        button.removeEventListener('click', onOptionClick);
      });
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close('');
    };
    const onClose = () => finish(dialog.returnValue || '');
    const onCancelClick = () => dialog.close('');
    const onOptionClick = (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      dialog.close(String(target.getAttribute('data-equipment-choice') || ''));
    };

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.equipmentChoiceCancelButton?.addEventListener('click', onCancelClick);
    optionsHost.querySelectorAll('[data-equipment-choice]').forEach((button) => {
      button.addEventListener('click', onOptionClick);
    });
    dialog.showModal();
  });

  const showGreenChoiceDialog = ({ title, message, activateLabel, skipLabel, cancelLabel, currentChoice = '' }) => new Promise((resolve) => {
    const dialog = el.greenChoiceDialog;
    const normalizedCurrent = String(currentChoice || '').trim().toLowerCase();
    const defaultSelection = normalizedCurrent === 'effect2'
      ? 'skip'
      : normalizedCurrent === 'effect1'
        ? 'activate'
        : normalizedCurrent;

    if (!(dialog instanceof HTMLDialogElement)) {
      const raw = window.prompt(`${message}\n1. ${activateLabel}\n2. ${skipLabel}\n0. ${cancelLabel}`, defaultSelection === 'skip' ? '2' : '1');
      if (raw === '1') resolve('activate');
      else if (raw === '2') resolve('skip');
      else resolve('');
      return;
    }

    if (el.greenChoiceTitle) el.greenChoiceTitle.textContent = title;
    if (el.greenChoiceMessage) el.greenChoiceMessage.textContent = message;
    if (el.greenChoiceActivateButton) el.greenChoiceActivateButton.textContent = activateLabel;
    if (el.greenChoiceSkipButton) el.greenChoiceSkipButton.textContent = skipLabel;
    if (el.greenChoiceCancelButton) el.greenChoiceCancelButton.textContent = cancelLabel;

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.greenChoiceActivateButton?.removeEventListener('click', onActivate);
      el.greenChoiceSkipButton?.removeEventListener('click', onSkip);
      el.greenChoiceCancelButton?.removeEventListener('click', onCancelClick);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close('');
    };
    const onClose = () => finish(dialog.returnValue || '');
    const onActivate = () => dialog.close('activate');
    const onSkip = () => dialog.close('skip');
    const onCancelClick = () => dialog.close('');

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.greenChoiceActivateButton?.addEventListener('click', onActivate);
    el.greenChoiceSkipButton?.addEventListener('click', onSkip);
    el.greenChoiceCancelButton?.addEventListener('click', onCancelClick);
    dialog.showModal();
  });

  const openActiveCardDialog = () => {
    const visibleCard = latestRoomSnapshot?.active_card_display || null;
    const rawCard = latestRoomSnapshot?.active_card || null;
    const cardNameEnglish = String(visibleCard?.name || rawCard?.name || '').trim();
    if (!cardNameEnglish) return;
    showCardInfoDialog({
      cardNameEnglish,
      cardType: String(visibleCard?.type || rawCard?.type || '').toLowerCase() === 'equipment' ? 'Equipment' : 'Action',
      cardColor: String(visibleCard?.color || rawCard?.color || '').toLowerCase(),
      anchorEl: el.activeCardDisplay,
    });
  };

  if (!activeCardDetailOutsideHandlerBound) {
    document.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#activeCardDialog') || target.closest('#activeCardDisplay') || target.closest('.equip-chip')) return;
      closeCardInfoDialog();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeCardInfoDialog();
    });
    window.addEventListener('resize', () => {
      const dialog = el.activeCardDialog;
      if (!(dialog instanceof HTMLDialogElement) || !dialog.open) return;
      if (activeCardDialogAnchor instanceof HTMLElement) {
        positionCardInfoDialog(dialog, activeCardDialogAnchor);
      }
    });
    activeCardDetailOutsideHandlerBound = true;
  }

  const rollDiceFromCenter = async () => {
    if (!state.roomId || diceRollBusy) return;

    const dataSnapshot = latestRoomSnapshot;
    const selfAccount = String(state.account || '').trim();
    const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
    const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
    const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
    const movePrompt = getMoveAreaPromptState(state, dataSnapshot);
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

    diceRollBusy = true;
    updateStageNextStepButtonState(state, dataSnapshot);
    try {
      if (pendingDiceAction?.execute) {
        const queuedAction = pendingDiceAction;
        const data = await queuedAction.execute();
        const finalD6 = normalizeDiceValue(data?.dice?.D6, 6);
        const finalD4 = normalizeDiceValue(data?.dice?.D4, 4);
        playDiceAnimation(finalD6, finalD4, queuedAction.mode || 'both');
        await waitDiceAnimationComplete();
        pendingDiceAction = null;
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

      await new Promise((resolve) => {
        window.setTimeout(resolve, DICE_ANIMATION_DURATION_MS);
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
      diceRollBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const runStageNextStep = async () => {
    if (!state.roomId || !state.account || stageNextStepBusy || diceRollBusy || diceRollAnimating) return;

    const dataSnapshot = latestRoomSnapshot;
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
        const selected = await showGreenChoiceDialog({
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
        // 需要點玩家時按鈕已 disabled，但保險起見也直接 return，不走 next_step
        return;
      }
    }

    stageNextStepBusy = true;
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
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const moveToPromptArea = async (areaName) => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;
    const prompt = getMoveAreaPromptState(state);
    const normalizedAreaName = String(areaName || '').trim();
    if (!prompt.active || !normalizedAreaName || !prompt.areaNames.includes(normalizedAreaName)) return;

    stageNextStepBusy = true;
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
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const drawCardFromPile = async (color) => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;
    const drawablePileColors = getDrawablePileColors();
    if (!drawablePileColors.includes(color)) return;

    stageNextStepBusy = true;
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
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const attackPlayerTarget = async (targetAccount) => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;

    const attackPrompt = getAttackPromptState(state);
    const normalizedTarget = String(targetAccount || '').trim();
    if (!attackPrompt.active || !normalizedTarget || !attackPrompt.targetAccounts.includes(normalizedTarget)) return;

    stageNextStepBusy = true;
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
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const useWeirdWoodsOnTarget = async (targetAccount) => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;

    const areaPrompt = getAreaPromptState(state);
    const normalizedTarget = String(targetAccount || '').trim();
    if (!areaPrompt.active || !normalizedTarget || !areaPrompt.targetAccounts.includes(normalizedTarget)) return;

    const choice = await showAreaChoiceDialog({
      title: t('room.area_choice.title'),
      message: t('room.area_choice.message'),
      hurtLabel: t('room.area_choice.hurt'),
      healLabel: t('room.area_choice.heal'),
      cancelLabel: t('room.area_choice.cancel'),
    });

    if (choice !== 'Hurt' && choice !== 'Heal') {
      toast(t('toast.area_choice_cancelled'));
      return;
    }

    stageNextStepBusy = true;
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
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const maybeResolvePendingSteal = async (dataSnapshot) => {
    const pendingSteal = getPendingStealState(state, dataSnapshot);
    if (!pendingSteal.active || !pendingSteal.fromAccount || !pendingSteal.toAccount || !pendingSteal.equipmentNames.length) return;

    const fromPlayer = dataSnapshot?.players?.[pendingSteal.fromAccount];
    const equipmentName = await showEquipmentChoiceDialog({
      title: pendingSteal.source || t('room.equipment_choice.title'),
      message: t('room.equipment_choice.message', { name: fromPlayer?.name || pendingSteal.fromAccount }),
      options: pendingSteal.equipmentNames.map(localizeEquipmentOption),
      cancelLabel: t('room.area_choice.cancel'),
    });

    if (!equipmentName) {
      toast(t('toast.area_choice_cancelled'));
      return;
    }

    stageNextStepBusy = true;
    updateStageNextStepButtonState(state, dataSnapshot);
    try {
      const data = await dispatch('steal_equipment', {
        room_id: state.roomId,
        account: state.account || undefined,
        from_account: pendingSteal.fromAccount,
        to_account: pendingSteal.toAccount,
        equipment_name: equipmentName,
      });
      renderState(data);
      toast(t('toast.steal_ok'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const resolvePendingKillLoot = async (targetAccount, dataSnapshot = latestRoomSnapshot) => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;
    const pendingKillLoot = getPendingKillLootState(state, dataSnapshot);
    const normalizedTarget = String(targetAccount || '').trim();
    if (!pendingKillLoot.active || !normalizedTarget || !pendingKillLoot.deathAccounts.includes(normalizedTarget)) return;

    const deadPlayer = dataSnapshot?.players?.[normalizedTarget] || null;
    const equipmentNames = Array.isArray(deadPlayer?.equipment)
      ? deadPlayer.equipment.map((value) => String(value || '').trim()).filter(Boolean)
      : [];
    if (!equipmentNames.length) return;

    let takeAll = false;
    let equipmentName = equipmentNames[0];

    if (pendingKillLoot.allowFull && equipmentNames.length > 1) {
      takeAll = window.confirm('此效果可一次奪取全部裝備，是否全拿？');
    }

    if (!takeAll) {
      equipmentName = await showEquipmentChoiceDialog({
        title: t('room.equipment_choice.title'),
        message: t('room.equipment_choice.message', { name: deadPlayer?.name || normalizedTarget }),
        options: equipmentNames.map(localizeEquipmentOption),
        cancelLabel: t('room.area_choice.cancel'),
      });
      if (!equipmentName) {
        toast(t('toast.area_choice_cancelled'));
        return;
      }
    }

    stageNextStepBusy = true;
    updateStageNextStepButtonState(state, dataSnapshot);
    try {
      const payload = {
        room_id: state.roomId,
        account: state.account || undefined,
        from_account: normalizedTarget,
        take_all: takeAll,
      };
      if (!takeAll) {
        payload.equipment_name = equipmentName;
      }
      const lootData = await dispatch('loot_from_kill', payload);
      renderState(lootData);

      const stillPending = Array.isArray(lootData?.pending_kill_loot?.death_accounts)
        && lootData.pending_kill_loot.death_accounts.length > 0;
      if (!stillPending) {
        const nextData = await dispatch('next_step', {
          room_id: state.roomId,
          account: state.account || undefined,
          action: false,
          target: { kind: 'none' },
        });
        renderState(nextData);
      }
      toast(t('toast.loot_ok'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const useErstwhileAltarOnTarget = async (targetAccount) => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;

    const areaPrompt = getAreaPromptState(state);
    const normalizedTarget = String(targetAccount || '').trim();
    if (!areaPrompt.active || areaPrompt.kind !== 'altar' || !normalizedTarget || !areaPrompt.targetAccounts.includes(normalizedTarget)) return;

    stageNextStepBusy = true;
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
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const useActiveCard = async (target = { kind: 'none' }) => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;

    const activeCardName = String(latestRoomSnapshot?.active_card?.name || '').trim();
    const cardDiceMeta = getCardDiceAnimationMeta(activeCardName);
    const selfCamp = String(latestRoomSnapshot?.players?.[state.account || '']?.self_character_camp || '').trim();
    let optionalChoice = '';
    if (activeCardName === 'Diabolic Ritual' && selfCamp === 'Shadow') {
      const selected = await showGreenChoiceDialog({
        title: t('room.optional_card_choice.title'),
        message: t('room.optional_card_choice.message', { card: t('room.active_card.names.Diabolic Ritual') }),
        activateLabel: t('room.green_choice.activate'),
        skipLabel: t('room.green_choice.skip'),
        cancelLabel: t('room.area_choice.cancel'),
      });
      if (!selected) return;
      optionalChoice = selected;
    }

    const payload = {
      room_id: state.roomId,
      account: state.account || undefined,
      target,
    };
    if (optionalChoice) payload.choice = optionalChoice;

    if (cardDiceMeta) {
      setPendingDiceAction({
        labelKey: cardDiceMeta.labelKey,
        mode: cardDiceMeta.mode,
        toastKey: 'toast.card_effect_ok',
        execute: () => dispatch('card_effect', payload),
        afterRender: async (data) => {
          await maybeResolvePendingSteal(data);
        },
      });
      updateStageNextStepButtonState(state, latestRoomSnapshot);
      return;
    }

    stageNextStepBusy = true;
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('card_effect', payload);
      renderState(data);
      toast(t('toast.card_effect_ok'));
      await maybeResolvePendingSteal(data);
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const setPendingGreenCardChoice = async (choice) => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;
    let normalizedChoice = String(choice || '').trim().toLowerCase();
    if (normalizedChoice === 'effect1') normalizedChoice = 'activate';
    if (normalizedChoice === 'effect2') normalizedChoice = 'skip';
    if (!['activate', 'skip'].includes(normalizedChoice)) return;
    stageNextStepBusy = true;
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('set_green_card_choice', {
        room_id: state.roomId,
        account: state.account || undefined,
        choice: normalizedChoice,
      });
      renderState(data);
      toast(t('toast.green_choice_set'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const confirmPendingGreenCard = async () => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;
    stageNextStepBusy = true;
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('confirm_green_card', {
        room_id: state.roomId,
        account: state.account || undefined,
      });
      renderState(data);
      toast(t('toast.green_confirmed'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const confirmEquipment = async () => {
    if (!state.roomId || !state.account || stageNextStepBusy) return;
    stageNextStepBusy = true;
    updateStageNextStepButtonState(state);
    try {
      const data = await dispatch('confirm_equipment', {
        room_id: state.roomId,
        account: state.account || undefined,
      });
      renderState(data);
      toast(t('toast.equipment_equipped'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    } finally {
      stageNextStepBusy = false;
      updateStageNextStepButtonState(state);
    }
  };

  const activateSelfAbility = async (target = { kind: 'none' }) => {
    if (!state.roomId || !state.account) return;
    const abilityCharacter = String(
      pendingAbilityActivation?.character
      || getSelfAbilityState(state)?.character
      || ''
    ).trim();
    const abilityDiceMode = getAbilityDiceAnimationMode(abilityCharacter);
    if (abilityDiceMode) {
      pendingDiceAction = { labelKey: 'room.table_next_step.roll_damage_dice' };
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
        pendingDiceAction = null;
        updateStageNextStepButtonState(state);
      }
    }
  };

  const startSelfAbilityActivation = async () => {
    const abilityState = getSelfAbilityState(state);
    if (!abilityState || !canActivateSelfAbilityFromCard(state)) return;

    const confirmed = window.confirm(t('toast.character_ability_confirm'));
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
      pendingAbilityActivation = {
        account: abilityState.account,
        character: abilityState.character,
        timing: abilityState.timing,
        targetType: abilityState.targetType,
      };
      renderState(latestRoomSnapshot);
      toast(t('toast.character_ability_choose_area'));
      return;
    }

    if (abilityState.targetType === 'discard') {
      const discardOptions = getDiscardEquipmentOptions(latestRoomSnapshot);
      if (!discardOptions.length) {
        toast(t('toast.character_ability_not_supported'), 'error');
        return;
      }
      const discardChoice = await showEquipmentChoiceDialog({
        title: t('ui.role_ability'),
        message: t('room.equipment_choice.message', { name: t('room.active_card.type_equipment') }),
        options: discardOptions,
        cancelLabel: t('room.area_choice.cancel'),
      });
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
      pendingAbilityActivation = {
        account: abilityState.account,
        character: abilityState.character,
        timing: abilityState.timing,
        targetType: abilityState.targetType,
      };
      renderState(latestRoomSnapshot);
      toast(t('toast.character_ability_choose_player'));
      return;
    }

    toast(t('toast.character_ability_not_supported'), 'error');
  };

  const selectAbilityPlayerTarget = async (targetAccount) => {
    if (!pendingAbilityActivation || !state.roomId || !targetAccount) return;
    const abilityDiceMode = getAbilityDiceAnimationMode(pendingAbilityActivation.character);
    if (abilityDiceMode) {
      const selectedTarget = { kind: 'player', id: targetAccount };
      clearPendingAbilityActivation();
      setPendingDiceAction({
        labelKey: 'room.table_next_step.roll_damage_dice',
        mode: abilityDiceMode,
        toastKey: 'toast.character_ability_activated',
        execute: () => dispatch('next_step', {
          room_id: state.roomId,
          account: state.account || undefined,
          action: true,
          target: selectedTarget,
        }),
      });
      renderState(latestRoomSnapshot);
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

  const diceCenter = document.querySelector('.stage-center-badges');
  if (diceCenter instanceof HTMLElement) {
    diceCenter.setAttribute('role', 'button');
    diceCenter.setAttribute('tabindex', '0');
    diceCenter.setAttribute('aria-label', '擲骰');
    diceCenter.addEventListener('click', () => {
      rollDiceFromCenter();
    });
    diceCenter.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      rollDiceFromCenter();
    });
  }

  const stageNextButton = el.stageNextStepButton;
  if (stageNextButton instanceof HTMLButtonElement) {
    stageNextButton.addEventListener('click', () => {
      runStageNextStep();
    });
  }

  updateStageNextStepButtonState(state);

  const syncAutoRefreshTimer = () => {
    clearRoomAutoRefreshTimer();
    if (roomEventConnected) return;
    const seconds = Number(state.autoRefreshSeconds || 0);
    if (!seconds || !state.roomId) return;

    roomAutoRefreshTimer = window.setInterval(async () => {
      if (!state.roomId) return;
      try {
        const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined }, { silent: true });
        renderState(data);
      } catch (error) {
        if (error.code === 'ROOM_NOT_FOUND') {
          clearRoomAutoRefreshTimer();
          toast(t('toast.village_gone'), 'error');
          goToLobbyPage();
          return;
        }
        clearRoomAutoRefreshTimer();
        state.autoRefreshSeconds = 0;
        persistSession(state);
        renderAutoRefreshControls({ el, state, onSelect: applyAutoRefreshSetting });
        toast(t('toast.auto_fail'), 'error');
        console.error(error);
      }
    }, seconds * 1000);
  };

  const connectRoomEventStream = () => {
    clearRoomEventSource();
    if (!state.roomId) return;
    const roomId = Number(state.roomId || 0);
    if (!roomId) return;

    const query = new URLSearchParams({
      room_id: String(roomId),
    });
    if (state.account) query.set('account', String(state.account));

    roomEventSource = new EventSource(`/api/room_events?${query.toString()}`);

    roomEventSource.addEventListener('open', () => {
      roomEventConnected = true;
      clearRoomAutoRefreshTimer();
    });

    roomEventSource.addEventListener('room_state_changed', (event) => {
      try {
        const payload = JSON.parse(String(event?.data || '{}'));
        const statePayload = payload?.state || null;
        if (!statePayload || typeof statePayload !== 'object') return;
        const payloadRoomId = Number(statePayload?.room?.room_id || payload?.room_id || 0);
        if (!payloadRoomId || payloadRoomId !== Number(state.roomId || 0)) return;
        renderState(statePayload);
      } catch (error) {
        console.error('Failed to parse room event payload', error);
      }
    });

    roomEventSource.addEventListener('room_closed', (event) => {
      try {
        const payload = JSON.parse(String(event?.data || '{}'));
        const payloadRoomId = Number(payload?.room_id || 0);
        if (payloadRoomId && payloadRoomId === Number(state.roomId || 0)) {
          clearRoomEventSource();
          clearRoomAutoRefreshTimer();
          toast(t('toast.village_gone'), 'error');
          goToLobbyPage();
        }
      } catch (error) {
        console.error(error);
      }
    });

    roomEventSource.onerror = () => {
      roomEventConnected = false;
      syncAutoRefreshTimer();
    };
  };

  const applyAutoRefreshSetting = async (seconds) => {
    state.autoRefreshSeconds = AUTO_REFRESH_OPTIONS.includes(seconds) ? seconds : 0;
    persistSession(state);
    renderAutoRefreshControls({ el, state, onSelect: applyAutoRefreshSetting });
    if (state.autoRefreshSeconds > 0) {
      // Issue 35.3: 點擊設定時立即刷新一次
      try {
        const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined }, { silent: true });
        renderState(data);
      } catch (error) {
        console.error('Immediate refresh failed:', error);
      }
    }
    syncAutoRefreshTimer();
    toast(state.autoRefreshSeconds === 0 ? t('toast.auto_off') : t('toast.auto_on', { n: state.autoRefreshSeconds }));
  };

  const isReplayPage = String(state?.page || '') === 'replay-room';
  if (isReplayPage) {
    clearRoomEventSource();
    clearRoomAutoRefreshTimer();
    if (el.autoRefreshOptions) el.autoRefreshOptions.innerHTML = '';
  } else {
    renderAutoRefreshControls({ el, state, onSelect: applyAutoRefreshSetting });
    connectRoomEventStream();
    syncAutoRefreshTimer();
  }

  el.btnUseQuickPlayer?.addEventListener('click', () => {
    const v = el.quickPlayerTarget.value;
    if (!v) return;
    el.targetKind.value = 'player';
    el.targetId.value = v;
  });

  el.btnUseQuickArea?.addEventListener('click', () => {
    const v = el.quickAreaTarget.value;
    if (!v) return;
    el.targetKind.value = 'area';
    el.targetId.value = v;
  });

  el.btnRoomBackLobby?.addEventListener('click', () => {
    clearRoomEventSource();
    clearRoomAutoRefreshTimer();
    goToLobbyPage();
  });

  el.btnRoomRefresh?.addEventListener('click', async () => {
    if (!state.roomId) return;
    try {
      const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined });
      renderState(data);
      toast(t('toast.refreshed'));
    } catch (error) {
      if (error.code === 'ROOM_NOT_FOUND') goToLobbyPage();
    }
  });

  const leaveVillage = async () => {
    if (!state.roomId || !state.account) return;
    const leavingRoomId = state.roomId;
    await dispatch('leave_room', { room_id: state.roomId, account: state.account });
    clearRoomEventSource();
    clearRoomAutoRefreshTimer();
    clearRoomAccount(state, leavingRoomId);
    state.roomId = null;
    persistSession(state);
    setVillageInfoMessage(t('room.info.not_joined'));
    renderState({ players: {} });
    await refreshRooms();
    toast(t('toast.left_village'));
    goToLobbyPage();
  };

  const abolishVillage = async () => {
    if (!state.roomId || !state.account) return;
    const abolishRoomId = state.roomId;
    await dispatch('abolish_room', { room_id: state.roomId, account: state.account });
    clearRoomEventSource();
    clearRoomAutoRefreshTimer();
    clearRoomAccount(state, abolishRoomId);
    state.roomId = null;
    persistSession(state);
    setVillageInfoMessage(t('room.info.not_joined'));
    renderState({ players: {} });
    await refreshRooms();
    toast(t('toast.village_abolished'));
    goToLobbyPage();
  };

  const toggleReady = async () => {
    if (!state.roomId || !state.account) return;
    const data = await dispatch('toggle_ready', { room_id: state.roomId, account: state.account });
    renderState(data);
    if (Number(data?.room?.room_status || 0) === 2) {
      toast(t('toast.game_started'));
      return;
    }
    const self = data?.players?.[state.account];
    toast(self?.is_ready ? t('toast.ready_on') : t('toast.ready_off'));
  };

  const rollCallVillage = async () => {
    if (!state.roomId || !state.account) return;
    const data = await dispatch('roll_call', { room_id: state.roomId, account: state.account });
    renderState(data);
    toast(t('toast.roll_call_done'));
  };

  const editVillageSettings = async () => {
    if (!state.roomId || !state.account) return;
    const roomInfo = latestRoomSnapshot?.room || {};
    const currentMode = String(roomInfo.expansion_mode || 'all');
    const currentTimeout = Number(roomInfo.turn_timeout_minutes || 3);
    const currentInitialGreen = Boolean(roomInfo.enable_initial_green_card);

    const modeRaw = window.prompt(t('room.settings.expansion_mode_prompt'), currentMode);
    if (modeRaw == null) return;
    const modeInput = String(modeRaw || '').trim().toLowerCase();
    let expansionMode = modeInput;
    if (modeInput === 'b' || modeInput === 'basic') expansionMode = 'no_extend';
    if (modeInput === 'e' || modeInput === 'extend' || modeInput === 'expansion') expansionMode = 'expansion_only';
    if (!['all', 'no_extend', 'expansion_only'].includes(expansionMode)) {
      toast(t('room.settings.invalid_expansion_mode'), 'error');
      return;
    }

    const timeoutRaw = window.prompt(t('room.settings.turn_timeout_prompt'), String(currentTimeout));
    if (timeoutRaw == null) return;
    const timeoutMinutes = Number.parseInt(String(timeoutRaw || '').trim(), 10);
    if (![2, 3, 5, 10, 20, 30].includes(timeoutMinutes)) {
      toast(t('room.settings.invalid_turn_timeout'), 'error');
      return;
    }

    const initialGreenRaw = window.prompt(t('room.settings.initial_green_prompt'), currentInitialGreen ? '1' : '0');
    if (initialGreenRaw == null) return;
    const enableInitialGreenCard = ['1', 'true', 'on', 'yes', 'y'].includes(String(initialGreenRaw || '').trim().toLowerCase());

    try {
      const data = await dispatch('update_room_settings', {
        room_id: state.roomId,
        account: state.account,
        expansion_mode: expansionMode,
        turn_timeout_minutes: timeoutMinutes,
        enable_initial_green_card: enableInitialGreenCard,
      });
      renderState(data);
      toast(t('room.settings.updated'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    }
  };

  el.btnLeaveRoom?.addEventListener('click', leaveVillage);

  el.villageInfoList?.addEventListener('click', (event) => {
    const leaveTarget = event.target instanceof Element ? event.target.closest('#btnLeaveVillageInline') : null;
    if (leaveTarget) {
      leaveVillage();
      return;
    }
    const abolishTarget = event.target instanceof Element ? event.target.closest('#btnAbolishVillageInline') : null;
    if (abolishTarget) {
      abolishVillage();
      return;
    }
    const readyTarget = event.target instanceof Element ? event.target.closest('#btnToggleReadyInline') : null;
    if (readyTarget) {
      toggleReady();
      return;
    }
    const rollCallTarget = event.target instanceof Element ? event.target.closest('#btnRollCallInline') : null;
    if (rollCallTarget) {
      rollCallVillage();
      return;
    }
    const editSettingsTarget = event.target instanceof Element ? event.target.closest('#btnEditRoomSettingsInline') : null;
    if (editSettingsTarget) {
      editVillageSettings();
    }
  });

  el.startGameForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;
    const seed = el.seed.value ? Number(el.seed.value) : undefined;
    const data = await dispatch('start_game', { room_id: state.roomId, seed, account: state.account || undefined });
    renderState(data);
    toast(t('toast.game_started'));
  });

  el.btnGetState?.addEventListener('click', async () => {
    if (!state.roomId) return;
    try {
      const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined });
      renderState(data);
    } catch (error) {
      if (error.code === 'ROOM_NOT_FOUND') goToLobbyPage();
    }
  });

  el.btnNextSkip?.addEventListener('click', async () => {
    if (!state.roomId) return;
    const data = await dispatch('next_step', {
      room_id: state.roomId,
      account: state.account || undefined,
      action: false,
      target: { kind: 'none' },
    });
    renderState(data);
    toast(t('toast.advanced'));
  });

  el.nextStepForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;

    const kind = el.targetKind.value;
    const id = el.targetId.value.trim();
    const target = kind === 'none' ? { kind: 'none' } : { kind, id };

    const payload = {
      room_id: state.roomId,
      account: state.account || undefined,
      action: el.nextAction.value === 'true',
      action_type: el.nextActionType.value.trim() || undefined,
      target,
    };

    const data = await dispatch('next_step', payload);
    renderState(data);
    toast(t('toast.next_step_ok'));
  });

  el.cardEffectForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;
    const kind = el.cardTargetKind.value;
    const id = el.cardTargetId.value.trim();
    const target = kind === 'none' ? { kind: 'none' } : { kind, id };
    const data = await dispatch('card_effect', { room_id: state.roomId, account: state.account || undefined, target });
    renderState(data);
    toast(t('toast.card_effect_ok'));
  });

  el.lootForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;
    const from_account = el.lootFromAccount.value.trim();
    if (!from_account) return;
    const payload = {
      room_id: state.roomId,
      account: state.account || undefined,
      from_account,
      equipment_name: el.lootEquipment.value.trim() || undefined,
      take_all: el.lootTakeAll.value === 'true',
    };
    const data = await dispatch('loot_from_kill', payload);
    renderState(data);
    toast(t('toast.loot_ok'));
  });

  el.stealForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;
    const payload = {
      room_id: state.roomId,
      account: state.account || undefined,
      from_account: el.stealFromAccount.value.trim(),
      to_account: el.stealToAccount.value.trim(),
      equipment_name: el.stealEquipment.value.trim(),
    };
    if (!payload.from_account || !payload.to_account || !payload.equipment_name) return;
    const data = await dispatch('steal_equipment', payload);
    renderState(data);
    toast(t('toast.steal_ok'));
  });

  const playerCardClickHandler = async (targetAccount) => {
    if (!state.roomId || !state.account) return;

    const dataSnapshot = latestRoomSnapshot;
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
      await useActiveCard({ kind: 'player', id: targetAccount });
      return;
    }

    if (attackPrompt.active && attackPrompt.targetAccounts.includes(String(targetAccount || '').trim())) {
      await attackPlayerTarget(targetAccount);
      return;
    }

    if (pendingAbilityActivation) {
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
      const confirmed = window.confirm(t('toast.reveal_character_confirm'));
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
        const positive = window.confirm('按「確定」送正評，按「取消」送負評。');
        const comment = window.prompt(t('identity.trip_rating_comment_placeholder'), '') || '';
        await submitRating(positive ? 1 : -1, comment);
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
  };

  [el.roomCards, el.battleCards].forEach((cardsContainer) => {
    if (!(cardsContainer instanceof HTMLElement)) return;
    cardsContainer.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.player-trip-link')) {
        return;
      }
      if (event.target instanceof Element && event.target.closest('.player-role-trigger, .player-role-name, .player-role-info, .player-role-popover')) {
        return;
      }
      const card = event.target instanceof Element ? event.target.closest('[data-player-account]') : null;
      if (!card) return;
      const account = card.getAttribute('data-player-account');
      if (account) playerCardClickHandler(account);
    });
  });

  const tableStage = document.querySelector('.table-stage');
  if (tableStage instanceof HTMLElement) {
    tableStage.addEventListener('click', (event) => {
      // 點「場地數字」是看說明，不應觸發選場地移動/能力
      if (event.target instanceof Element && event.target.closest('.stage-field-number')) return;

      const activeCardEl = event.target instanceof Element ? event.target.closest('#activeCardDisplay') : null;
      if (activeCardEl instanceof HTMLElement) {
        const cardName = String(latestRoomSnapshot?.active_card_display?.name || '').trim();
        if (cardName) {
          event.preventDefault();
          event.stopPropagation();
          openActiveCardDialog();
        }
        return;
      }

      const pileCard = event.target instanceof Element ? event.target.closest('[data-pile-type="deck"][data-card-color]') : null;
      if (pileCard instanceof HTMLElement) {
        const colorKey = String(pileCard.getAttribute('data-card-color') || '').toLowerCase();
        const color = colorKey === 'green' ? 'Green' : colorKey === 'white' ? 'White' : colorKey === 'black' ? 'Black' : '';
        if (color) {
          event.preventDefault();
          event.stopPropagation();
          drawCardFromPile(color);
          return;
        }
      }

      const moveFieldCard = event.target instanceof Element ? event.target.closest('[data-field-slot]') : null;
      if (moveFieldCard instanceof HTMLElement) {
        const slot = Number(moveFieldCard.getAttribute('data-field-slot'));
        const field = Array.isArray(latestRoomSnapshot?.fields) ? latestRoomSnapshot.fields[slot] : null;
        const areaName = String(field?.name || '').trim();
        if (areaName) {
          const movePrompt = getMoveAreaPromptState(state);
          if (movePrompt.active && movePrompt.areaNames.includes(areaName)) {
            event.preventDefault();
            event.stopPropagation();
            moveToPromptArea(areaName);
            return;
          }
        }
      }

      if (!pendingAbilityActivation || pendingAbilityActivation.targetType !== 'area') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const abilityFieldCard = target.closest('[data-field-slot]');
      if (!(abilityFieldCard instanceof HTMLElement)) return;
      event.preventDefault();
      event.stopPropagation();
      const slot = Number(abilityFieldCard.getAttribute('data-field-slot'));
      const field = Array.isArray(latestRoomSnapshot?.fields) ? latestRoomSnapshot.fields[slot] : null;
      const areaName = String(field?.name || '').trim();
      const abilityAreaPrompt = getAbilityAreaPromptState(state);
      if (areaName && abilityAreaPrompt.active && abilityAreaPrompt.areaNames.includes(areaName)) {
        selectAbilityAreaTarget(areaName);
      }
    }, true);

    tableStage.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target;
      if (!(target instanceof Element)) return;

      const moveFieldCardByKey = target.closest('[data-field-slot]');
      if (moveFieldCardByKey instanceof HTMLElement) {
        const slot = Number(moveFieldCardByKey.getAttribute('data-field-slot'));
        const field = Array.isArray(latestRoomSnapshot?.fields) ? latestRoomSnapshot.fields[slot] : null;
        const areaName = String(field?.name || '').trim();
        const movePrompt = getMoveAreaPromptState(state);
        if (areaName && movePrompt.active && movePrompt.areaNames.includes(areaName)) {
          event.preventDefault();
          event.stopPropagation();
          moveToPromptArea(areaName);
          return;
        }
        if (pendingAbilityActivation && pendingAbilityActivation.targetType === 'area') {
          const abilityAreaPrompt = getAbilityAreaPromptState(state);
          if (areaName && abilityAreaPrompt.active && abilityAreaPrompt.areaNames.includes(areaName)) {
            event.preventDefault();
            event.stopPropagation();
            selectAbilityAreaTarget(areaName);
            return;
          }
        }
      }

      const activeCardEl = target.closest('#activeCardDisplay');
      if (!(activeCardEl instanceof HTMLElement)) return;
      const cardName = String(latestRoomSnapshot?.active_card_display?.name || '').trim();
      if (!cardName) return;
      event.preventDefault();
      event.stopPropagation();
      openActiveCardDialog();
    });
  }

  if (el.chatSendButton) {
    el.chatSendButton.addEventListener('click', () => {
      void sendChatMessage();
    });
  }
  if (el.chatInput) {
    el.chatInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (event.shiftKey) return;
      event.preventDefault();
      void sendChatMessage();
    });
  }

  window.addEventListener('pagehide', () => {
    clearRoomEventSource();
    clearRoomAutoRefreshTimer();
  });

  if (el.roomInfo) {
    el.roomInfo.dataset.bound = 'true';
  }
}

export async function initRoomPage({ state, dispatch, renderState, setVillageInfoMessage, goToLobbyPage }) {
  const search = new URLSearchParams(window.location.search);
  const isReplayPage = String(state?.page || '') === 'replay-room';

  if (isReplayPage) {
    const roomIdRaw = String(search.get('roomId') || '').trim();
    if (!roomIdRaw) {
      setVillageInfoMessage('roomId is required');
      return;
    }
    try {
      const response = await apiFetch(`/api/game_record_by_room?room_id=${encodeURIComponent(roomIdRaw)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('record_view_not_found');
      const record = await response.json();
      const replayState = buildReplayRoomState(record);
      state.roomId = null;
      renderState(replayState);
      return;
    } catch (error) {
      console.error(error);
      setVillageInfoMessage('歷史紀錄載入失敗');
      return;
    }
  }

  const recordId = String(search.get('recordId') || '').trim();
  if (recordId) {
    try {
      const response = await apiFetch(`/api/game_record/${encodeURIComponent(recordId)}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('record_view_not_found');
      const record = await response.json();
      const replayState = buildReplayRoomState(record);
      state.roomId = null;
      renderState(replayState);
      return;
    } catch (error) {
      console.error(error);
      setVillageInfoMessage('歷史紀錄載入失敗');
      return;
    }
  }

  if (state.roomId) {
    try {
      const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined }, { silent: true });
      renderState(data);
    } catch (error) {
      if (error.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage?.();
      }
    }
  } else {
    setVillageInfoMessage(t('room.info.no_village_selected'));
  }
}
