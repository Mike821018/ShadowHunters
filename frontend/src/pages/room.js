import { AUTO_REFRESH_OPTIONS, PLAYER_COLOR_HEX } from '../constants.js';
import { getCharacterLocalizedName, getCurrentUiLang } from '../characterInfo.js';
import { t } from '../i18n.js';
import { clearRoomAccount } from '../session.js';
import { apiFetch } from '../utils.js';
import { showAreaChoiceDialog, showConfirmDialog, showEquipmentChoiceDialog, showGreenChoiceDialog } from './room/choiceDialogs.js';
import { renderVillageInfo as renderVillageInfoModule } from './room/villageInfoRendering.js';
import { buildReplayRoomState as buildReplayRoomStateModule } from './room/replayAdapter.js';
import { buildChatStageLines } from './room/chatFormatter.js';
import { createCardInfoHelpers } from './room/cardInfoDialog.js';
import { createDamageMeterHandlers } from './room/damageMeter.js';
import { renderStageFieldCards } from './room/fieldCards.js';
import { handlePlayerCardClick } from './room/playerCardActions.js';
import { bindPlayerCardClickTargets } from './room/playerCardBindings.js';
import { bindStageInteractions } from './room/stageInteractions.js';
import { bindChatControls } from './room/chatControls.js';
import { bindRoomLifecycle } from './room/roomLifecycle.js';
import { bindRoomControls } from './room/roomControls.js';
import { createStageNextStepStateHandlers } from './room/stageNextStepState.js';
import {
  selectAttackPromptState,
  selectCounterAttackPromptState,
  selectAreaPromptState,
  selectMoveAreaPromptState,
  selectAbilityAreaPromptState,
  selectCardPromptState,
  selectPendingStealState,
  selectPendingKillLootState,
  selectEquipmentConfirmPromptState,
  selectGreenConfirmPromptState,
} from './room/promptState.js';
import {
  isAbilityPlayerTarget as isAbilityPlayerTargetModule,
  getSelfAbilityState as getSelfAbilityStateModule,
  canActivateSelfAbilityFromCard as canActivateSelfAbilityFromCardModule,
  getCurrentTurnPlayer as getCurrentTurnPlayerModule,
  isReplayViewState as isReplayViewStateModule,
  isRoomLayoutPage as isRoomLayoutPageModule,
  showOccupantNamePopup as showOccupantNamePopupModule,
  getDiscardEquipmentOptions as getDiscardEquipmentOptionsModule,
  getDrawablePileColors as getDrawablePileColorsModule,
} from './room/roomStateHelpers.js';

let roomAutoRefreshTimer = null;
let activeFieldSlot = null;
let activeFieldNumber = null;
let fieldDetailOutsideHandlerBound = false;
let activeCardDetailOutsideHandlerBound = false;
let chatCardTokenHandlerBound = false;
let activeCardDialogAnchor = null;
let latestRoomSnapshot = null;
let latestRoomRenderSeq = 0;
let diceRollAnimating = false;
let diceRollBusy = false;
let stageNextStepBusy = false;
let pendingAbilityActivation = null;
let pendingDiceAction = null;
let diceRollInterval = null;
let diceRollTimeout = null;
let occupantNamePopupTimer = null;

const {
  getLocalizedCardName,
  localizeEquipmentOption,
  getEquipmentDisplayLabel,
  positionCardInfoDialog,
  closeCardInfoDialog,
  showCardInfoDialog,
  openEquipmentCardDialog,
  openInvulnerabilityInfoDialog,
} = createCardInfoHelpers({
  t,
  getAnchor: () => activeCardDialogAnchor,
  setAnchor: (anchor) => {
    activeCardDialogAnchor = anchor;
  },
});

const { clampDamageValue, jumpToPlayerCard, renderDamageMeter } = createDamageMeterHandlers({ t, esc: escapeHtml });

function buildReplayRoomState(record) {
  return buildReplayRoomStateModule(record);
}

function setPendingDiceAction(action) {
  pendingDiceAction = action || null;
}

const DICE_ANIMATION_DURATION_MS = 900;
const DICE_ANIMATION_TICK_MS = 70;
const GREEN_EQUIPMENT_OR_DAMAGE_CARDS = new Set(['Anger', 'Blackmail', 'Greed']);

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

function buildGreenChoiceDialogConfig(greenConfirm, dataSnapshot, state) {
  const baseConfig = {
    title: t('room.green_choice.title'),
    message: t('room.green_choice.message'),
    activateLabel: t('room.green_choice.activate'),
    skipLabel: t('room.green_choice.skip'),
    showActivate: true,
    showSkip: true,
    currentChoice: greenConfirm.choice,
  };

  const cardName = String(greenConfirm?.cardName || '').trim();
  const selfAccount = String(state?.account || '').trim();
  const selfCharacter = String(dataSnapshot?.players?.[selfAccount]?.self_character || '').trim();
  const isUnknown = selfCharacter === 'Unknown';

  if (isUnknown && GREEN_EQUIPMENT_OR_DAMAGE_CARDS.has(cardName) && greenConfirm?.needsChoice) {
    const selfEquipment = Array.isArray(dataSnapshot?.players?.[selfAccount]?.equipment)
      ? dataSnapshot.players[selfAccount].equipment
      : [];
    const hasEquipment = selfEquipment.length > 0;
    const localizedCardName = t(`room.active_card.names.${cardName}`) || cardName;
    return {
      ...baseConfig,
      unknownCombinedFlow: true,
      message: hasEquipment
        ? t('room.green_choice.unknown_combined_message', { card: localizedCardName })
        : t('room.green_choice.unknown_damage_or_skip_message', { card: localizedCardName }),
      activateLabel: t('room.green_choice.give_equipment'),
      skipLabel: t('room.green_choice.take_damage'),
      noActivateLabel: t('room.green_choice.skip'),
      showActivate: hasEquipment,
      showSkip: true,
    };
  }

  if (!GREEN_EQUIPMENT_OR_DAMAGE_CARDS.has(cardName) || !greenConfirm?.needsChoice) {
    return baseConfig;
  }

  const selfEquipment = Array.isArray(dataSnapshot?.players?.[selfAccount]?.equipment)
    ? dataSnapshot.players[selfAccount].equipment
    : [];
  const hasEquipment = selfEquipment.length > 0;
  const localizedCardName = t(`room.active_card.names.${cardName}`) || cardName;

  return {
    ...baseConfig,
    message: hasEquipment
      ? t('room.green_choice.equipment_or_damage_message', { card: localizedCardName })
      : t('room.green_choice.damage_only_message', { card: localizedCardName }),
    activateLabel: t('room.green_choice.give_equipment'),
    skipLabel: t('room.green_choice.take_damage'),
    showActivate: hasEquipment,
    showSkip: true,
    currentChoice: hasEquipment ? greenConfirm.choice : 'skip',
  };
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
  return {
    currentD6: normalizeDiceValue(d6El?.textContent, 6),
    currentD4: normalizeDiceValue(d4El?.textContent, 4),
  };
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
}

function waitDiceAnimationComplete() {
  return new Promise((resolve) => {
    if (!diceRollAnimating) {
      resolve();
      return;
    }
    window.setTimeout(resolve, DICE_ANIMATION_DURATION_MS + 20);
  });
}

function playDiceAnimation(finalD6, finalD4, mode = 'both') {
  clearDiceAnimation();
  diceRollAnimating = true;
  const rollD6 = mode === 'both' || mode === 'd6';
  const rollD4 = mode === 'both' || mode === 'd4';
  const { currentD6, currentD4 } = getTableDiceDisplay();
  setTableDiceDisplay(currentD6, currentD4);
  diceRollInterval = window.setInterval(() => {
    setTableDiceDisplay(
      rollD6 ? Math.floor(Math.random() * 6) + 1 : currentD6,
      rollD4 ? Math.floor(Math.random() * 4) + 1 : currentD4,
    );
  }, DICE_ANIMATION_TICK_MS);
  diceRollTimeout = window.setTimeout(() => {
    clearDiceAnimation();
    setTableDiceDisplay(finalD6, finalD4);
  }, DICE_ANIMATION_DURATION_MS);
}

function getAbilityDiceAnimationMode(characterName) {
  return String(characterName || '').trim() === 'Unknown' ? 'd4' : 'd6';
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

function clearPendingAbilityActivation() {
  pendingAbilityActivation = null;
}

function isAbilityPlayerTarget(targetType) {
  return isAbilityPlayerTargetModule(targetType);
}

function getSelfAbilityState(state, dataSnapshot = latestRoomSnapshot) {
  return getSelfAbilityStateModule(state, dataSnapshot);
}

function canActivateSelfAbilityFromCard(state, dataSnapshot = latestRoomSnapshot) {
  return canActivateSelfAbilityFromCardModule(state, dataSnapshot);
}

function getCurrentTurnPlayer(dataSnapshot = latestRoomSnapshot) {
  return getCurrentTurnPlayerModule(dataSnapshot);
}

function isReplayViewState(state, dataSnapshot = latestRoomSnapshot) {
  return isReplayViewStateModule(state, dataSnapshot);
}

function isRoomLayoutPage(state = null, dataSnapshot = latestRoomSnapshot) {
  return isRoomLayoutPageModule(state, dataSnapshot);
}

function showOccupantNamePopup(name, anchorEl) {
  return showOccupantNamePopupModule({
    name,
    anchorEl,
    getTimer: () => occupantNamePopupTimer,
    setTimer: (timer) => {
      occupantNamePopupTimer = timer;
    },
  });
}

function getDiscardEquipmentOptions(dataSnapshot = latestRoomSnapshot) {
  return getDiscardEquipmentOptionsModule(dataSnapshot, getLocalizedCardName);
}

function getDrawablePileColors(dataSnapshot = latestRoomSnapshot, state = null) {
  return getDrawablePileColorsModule(dataSnapshot, state);
}

function getAttackPromptState(state, dataSnapshot = latestRoomSnapshot) {
  return selectAttackPromptState(state, dataSnapshot);
}

function getAreaPromptState(state, dataSnapshot = latestRoomSnapshot) {
  return selectAreaPromptState(state, dataSnapshot);
}

function getCounterAttackPromptState(state, dataSnapshot = latestRoomSnapshot) {
  return selectCounterAttackPromptState(state, dataSnapshot);
}

function getMoveAreaPromptState(state, dataSnapshot = latestRoomSnapshot) {
  return selectMoveAreaPromptState(state, dataSnapshot);
}

function getAbilityAreaPromptState(state, dataSnapshot = latestRoomSnapshot) {
  return selectAbilityAreaPromptState(state, dataSnapshot, pendingAbilityActivation);
}

function getCardPromptState(state, dataSnapshot = latestRoomSnapshot) {
  return selectCardPromptState(state, dataSnapshot);
}

function getPendingStealState(state, dataSnapshot = latestRoomSnapshot) {
  return selectPendingStealState(state, dataSnapshot);
}

function getPendingKillLootState(state, dataSnapshot = latestRoomSnapshot) {
  return selectPendingKillLootState(state, dataSnapshot);
}

function getEquipmentConfirmPromptState(state, dataSnapshot = latestRoomSnapshot) {
  return selectEquipmentConfirmPromptState(state, dataSnapshot);
}

function getGreenConfirmPromptState(state, dataSnapshot = latestRoomSnapshot) {
  return selectGreenConfirmPromptState(state, dataSnapshot);
}

const { updateStagePilePromptState, updateStageNextStepButtonState } = createStageNextStepStateHandlers({
  t,
  getLatestRoomSnapshot: () => latestRoomSnapshot,
  getDrawablePileColors,
  getPendingStealState,
  getPendingKillLootState,
  getEquipmentConfirmPromptState,
  getGreenConfirmPromptState,
  getCardPromptState,
  getAttackPromptState,
  getCounterAttackPromptState,
  getMoveAreaPromptState,
  getPendingDiceAction: () => pendingDiceAction,
  getDiceRollBusy: () => diceRollBusy,
  getDiceRollAnimating: () => diceRollAnimating,
  getStageNextStepBusy: () => stageNextStepBusy,
  getPendingAbilityActivation: () => pendingAbilityActivation,
  getTableDiceElements,
  getStageNextStepButton,
});

function clearRoomAutoRefreshTimer() {
  if (roomAutoRefreshTimer) {
    window.clearTimeout(roomAutoRefreshTimer);
    roomAutoRefreshTimer = null;
  }
}

function formatAutoRefreshLabel(seconds, selected) {
  return selected ? `${seconds}s` : String(seconds);
}

function renderAutoRefreshControls({ el, state, onSelect, onToggleSkipTargetConfirm }) {
  if (!el.autoRefreshOptions) return;
  const requireTargetConfirmChecked = !Boolean(state.skipTargetConfirm);
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
    <label class="auto-refresh-skip-confirm">
      <input type="checkbox" data-skip-target-confirm ${requireTargetConfirmChecked ? 'checked' : ''}>
      ${t('room.auto_refresh.skip_target_confirm')}
    </label>
  `;
  el.autoRefreshOptions.querySelectorAll('[data-auto-refresh-seconds]').forEach((button) => {
    button.addEventListener('click', () => onSelect(Number(button.getAttribute('data-auto-refresh-seconds'))));
  });
  const skipToggle = el.autoRefreshOptions.querySelector('[data-skip-target-confirm]');
  if (skipToggle instanceof HTMLInputElement) {
    skipToggle.addEventListener('change', () => {
      onToggleSkipTargetConfirm?.(!skipToggle.checked);
    });
  }
}

export function setVillageInfoMessage({ el, esc }, message) {
  if (!el.villageInfoList) return;
  const isRoomLikePage = /room\.html$/i.test(window.location.pathname || '') || /replay_room\.html$/i.test(window.location.pathname || '');
  if (isRoomLikePage) {
    el.villageInfoList.innerHTML = `<li class="village-info-row village-info-row-message lighttxt">${esc(message)}</li>`;
    return;
  }
  el.villageInfoList.innerHTML = `<li class="lighttxt">${esc(message)}</li>`;
}

function cardFlagsToExpansionMode(useBasic, useExtend) {
  if (useBasic && useExtend) return 'all';
  if (useBasic) return 'no_extend';
  if (useExtend) return 'expansion_only';
  return '';
}

export function renderVillageInfo({ el, esc, withVillageSuffix, goToRegisterPage, state }, data) {
  return renderVillageInfoModule({ el, esc, withVillageSuffix, goToRegisterPage, state, t, isRoomLayoutPage, isReplayViewState }, data);
}

function renderChatStage({ el, esc }, data, state) {
  if (!el.chatMessages) return;
  const isReplayView = isReplayViewState(state, data);
  const canChat = Boolean(String(state?.account || '').trim()) && !isReplayView;
  const chatInputRow = el.chatInput?.closest('.chat-input-row')
    || el.chatSendButton?.closest('.chat-input-row')
    || document.querySelector('#chatStage .chat-input-row');
  if (chatInputRow instanceof HTMLElement) chatInputRow.style.display = canChat ? 'flex' : 'none';
  if (el.chatInput) el.chatInput.disabled = !canChat;
  if (el.chatSendButton) el.chatSendButton.disabled = !canChat;

  const { chatLines, systemLines } = buildChatStageLines({
    messages: Array.isArray(data?.chat_messages) ? data.chat_messages : [],
    data,
    state,
    esc,
    t,
    isReplayView,
    getCurrentUiLang,
    getCharacterLocalizedName,
    getLocalizedCardName,
  });

  el.chatMessages.innerHTML = chatLines.length ? chatLines.join('') : `<p class="lighttxt">${esc(t('room.chat.empty'))}</p>`;
  if (el.systemMessages) {
    el.systemMessages.innerHTML = systemLines.length ? systemLines.join('') : `<p class="lighttxt">${esc(t('room.chat.empty'))}</p>`;
  }
  el.chatMessages.scrollTop = el.chatMessages.scrollHeight;
  if (el.systemMessages) el.systemMessages.scrollTop = el.systemMessages.scrollHeight;
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
  renderStageFieldCards({
    data,
    state,
    refs: {
      get activeFieldSlot() {
        return activeFieldSlot;
      },
      set activeFieldSlot(value) {
        activeFieldSlot = value;
      },
      get activeFieldNumber() {
        return activeFieldNumber;
      },
      set activeFieldNumber(value) {
        activeFieldNumber = value;
      },
      get fieldDetailOutsideHandlerBound() {
        return fieldDetailOutsideHandlerBound;
      },
      set fieldDetailOutsideHandlerBound(value) {
        fieldDetailOutsideHandlerBound = value;
      },
    },
    PLAYER_COLOR_HEX,
    getMoveAreaPromptState,
    getAbilityAreaPromptState,
    showOccupantNamePopup,
  });
}

function patchRoomCardsLayout() {
  if (!isRoomLayoutPage()) return;
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
  const incomingRenderSeq = Number(data?.__clientRequestSeq || 0);
  if (incomingRenderSeq && incomingRenderSeq < latestRoomRenderSeq) {
    return;
  }
  if (incomingRenderSeq) {
    latestRoomRenderSeq = incomingRenderSeq;
  }
  latestRoomSnapshot = data;
  if (el.gameState) el.gameState.textContent = JSON.stringify(data, null, 2);
  renderDamageMeter(el.damageMeter, data);
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

  const isChatRoom = Boolean(data?.room?.is_chat_room);
  const chatHiddenFieldsets = [
    document.querySelector('.room-layout-game-fieldset'),
    document.querySelector('.room-layout-system-fieldset'),
    document.getElementById('damageMeter')?.closest('fieldset'),
  ];
  chatHiddenFieldsets.forEach((fieldset) => {
    if (!(fieldset instanceof HTMLElement)) return;
    fieldset.hidden = isChatRoom;
    fieldset.style.display = isChatRoom ? 'none' : '';
  });

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
  patchRoomCardsLayout();
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

  function openConfirmDialog({ title, message, confirmLabel, cancelLabel }) {
    return showConfirmDialog({
      el,
      title: title || t('room.confirm.title'),
      message,
      confirmLabel: confirmLabel || t('room.confirm.confirm'),
      cancelLabel: cancelLabel || t('room.confirm.cancel'),
    });
  }

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

  if (!chatCardTokenHandlerBound) {
    const openChatCardTokenDialog = (tokenEl) => {
      if (!(tokenEl instanceof HTMLElement)) return;
      if (tokenEl.getAttribute('data-card-masked') === 'true') return;
      const cardNameEnglish = String(tokenEl.getAttribute('data-card-name') || '').trim();
      if (!cardNameEnglish) return;
      const cardTypeRaw = String(tokenEl.getAttribute('data-card-type') || '').trim().toLowerCase();
      const cardType = cardTypeRaw === 'equipment' ? 'Equipment' : 'Action';
      const cardColor = String(tokenEl.getAttribute('data-card-color') || '').trim().toLowerCase();
      showCardInfoDialog({
        cardNameEnglish,
        cardType,
        cardColor,
        anchorEl: tokenEl,
      });
    };

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const token = target.closest('.chat-card-token[data-card-name]');
      if (!(token instanceof HTMLElement)) return;
      event.preventDefault();
      openChatCardTokenDialog(token);
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const token = target.closest('.chat-card-token[data-card-name]');
      if (!(token instanceof HTMLElement)) return;
      event.preventDefault();
      openChatCardTokenDialog(token);
    });

    chatCardTokenHandlerBound = true;
  }

  const rollDiceFromCenter = async () => {
    if (!state.roomId || diceRollBusy) return;

    const dataSnapshot = latestRoomSnapshot;
    const selfAccount = String(state.account || '').trim();
    const currentAccount = String(dataSnapshot?.turn?.current_account || '').trim();
    const selfStatus = Number(dataSnapshot?.players?.[selfAccount]?.status || 0);
    const roomStatus = Number(dataSnapshot?.room?.room_status || 0);
    const movePrompt = getMoveAreaPromptState(state, dataSnapshot);
    const counterAttackPrompt = getCounterAttackPromptState(state, dataSnapshot);
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
      const isCounterAttackRoll = selfStatus === 5 && counterAttackPrompt.active;
      const data = await dispatch('next_step', {
        room_id: state.roomId,
        account: state.account || undefined,
        action: isCounterAttackRoll,
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
    const counterAttackPrompt = getCounterAttackPromptState(state, dataSnapshot);

    if (greenConfirm.waitingConfirm) {
      if (greenConfirm.canSetChoice && greenConfirm.needsChoice) {
        const dialogConfig = buildGreenChoiceDialogConfig(greenConfirm, dataSnapshot, state);
        if (dialogConfig.unknownCombinedFlow) {
          const selected = await showGreenChoiceDialog({
            el,
            title: dialogConfig.title,
            message: dialogConfig.message,
            activateLabel: dialogConfig.activateLabel,
            skipLabel: dialogConfig.skipLabel,
            cancelLabel: dialogConfig.noActivateLabel,
            currentChoice: dialogConfig.currentChoice,
            showActivate: dialogConfig.showActivate,
            showSkip: dialogConfig.showSkip,
            cancelReturnsValue: 'tertiary',
          });
          if (!selected) return;

          const mappedChoice = selected === 'activate'
            ? 'activate_give'
            : selected === 'skip'
              ? 'activate_damage'
              : 'normal';
          const choiceApplied = await setPendingGreenCardChoice(mappedChoice);
          if (!choiceApplied) return;
          await confirmPendingGreenCard();
          return;
        }
        const selected = await showGreenChoiceDialog({
          el,
          title: dialogConfig.title,
          message: dialogConfig.message,
          activateLabel: dialogConfig.activateLabel,
          skipLabel: dialogConfig.skipLabel,
          cancelLabel: t('room.area_choice.cancel'),
          currentChoice: dialogConfig.currentChoice,
          showActivate: dialogConfig.showActivate,
          showSkip: dialogConfig.showSkip,
        });
        if (selected) {
          const choiceApplied = await setPendingGreenCardChoice(selected);
          if (!choiceApplied) return;
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
    if (selfStatus === 2 || (selfStatus === 5 && !counterAttackPrompt.active)) {
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
      el,
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
      el,
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
      takeAll = await openConfirmDialog({
        title: t('room.confirm.title'),
        message: t('toast.loot_take_all_confirm'),
        confirmLabel: t('room.confirm.confirm'),
        cancelLabel: t('room.confirm.cancel'),
      });
    }

    if (!takeAll) {
      equipmentName = await showEquipmentChoiceDialog({
        el,
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
        el,
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
    if (!state.roomId || !state.account || stageNextStepBusy) return false;
    let normalizedChoice = String(choice || '').trim().toLowerCase();
    if (normalizedChoice === 'effect1') normalizedChoice = 'activate';
    if (normalizedChoice === 'effect2') normalizedChoice = 'skip';
    if (normalizedChoice === 'activate_give') normalizedChoice = 'activate';
    if (normalizedChoice === 'activate_damage') normalizedChoice = 'skip';
    if (!['activate', 'skip', 'normal'].includes(normalizedChoice)) return false;
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
      return true;
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return false;
      }
      console.error(error);
      return false;
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
        el,
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

  bindRoomControls({
    el, state, dispatch, renderState, toast, t, goToLobbyPage, persistSession,
    clearRoomAutoRefreshTimer,
    setRoomAutoRefreshTimer: (timer) => { roomAutoRefreshTimer = timer; },
    renderAutoRefreshControls,
  });

  const leaveVillage = async () => {
    if (!state.roomId || !state.account) return;
    const leavingRoomId = state.roomId;
    await dispatch('leave_room', { room_id: state.roomId, account: state.account });
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

  const extendTurnTimeout = async () => {
    if (!state.roomId || !state.account) return;
    const data = await dispatch('extend_turn_timeout', { room_id: state.roomId, account: state.account });
    renderState(data);
    toast(t('toast.turn_timeout_extended'));
  };

  const updateVillageSettings = async (patch = {}) => {
    if (!state.roomId || !state.account) return;
    const roomInfo = latestRoomSnapshot?.room || {};
    try {
      const data = await dispatch('update_room_settings', {
        room_id: state.roomId,
        account: state.account,
        expansion_mode: patch.expansion_mode ?? String(roomInfo.expansion_mode || 'all'),
        turn_timeout_minutes: patch.turn_timeout_minutes ?? Number(roomInfo.turn_timeout_minutes || 3),
        enable_initial_green_card: patch.enable_initial_green_card ?? Boolean(roomInfo.enable_initial_green_card),
        enable_neutral_chaos_mode: patch.enable_neutral_chaos_mode ?? Boolean(roomInfo.enable_neutral_chaos_mode),
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
    const extendTimeoutTarget = event.target instanceof Element ? event.target.closest('#btnExtendTurnTimeoutInline') : null;
    if (extendTimeoutTarget) {
      extendTurnTimeout();
      return;
    }
    const editSettingsTarget = event.target instanceof Element ? event.target.closest('#btnEditRoomSettingsInline') : null;
    if (editSettingsTarget) {
      const dialog = el.villageInfoList?.querySelector('#btnEditRoomSettingsDialog');
      if (dialog instanceof HTMLDialogElement) {
        try {
          dialog.showModal();
        } catch {
          dialog.setAttribute('open', 'open');
        }
      }
      return;
    }
    const closeSettingsTarget = event.target instanceof Element ? event.target.closest('[data-close-village-settings]') : null;
    if (closeSettingsTarget) {
      const dialog = el.villageInfoList?.querySelector('#btnEditRoomSettingsDialog');
      if (dialog instanceof HTMLDialogElement && dialog.open) {
        dialog.close();
      }
    }
  });

  el.villageInfoList?.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    if (target.matches('[data-setting-timeout-select]')) {
      return;
    }

    if (target.matches('[data-setting-initial-green-check]')) {
      return;
    }

    if (target.matches('[data-setting-basic-check], [data-setting-extend-check]')) {
      const basicCheck = el.villageInfoList?.querySelector('[data-setting-basic-check]');
      const extendCheck = el.villageInfoList?.querySelector('[data-setting-extend-check]');
      const useBasic = Boolean(basicCheck?.checked);
      const useExtend = Boolean(extendCheck?.checked);
      const nextMode = cardFlagsToExpansionMode(useBasic, useExtend);
      if (!nextMode) {
        target.checked = true;
        toast(t('lobby.create.expansion_mode_required'), 'error');
        return;
      }
    }
  });

  el.villageInfoList?.addEventListener('click', async (event) => {
    const saveSettingsTarget = event.target instanceof Element ? event.target.closest('[data-save-village-settings]') : null;
    if (!saveSettingsTarget) return;

    const dialog = el.villageInfoList?.querySelector('#btnEditRoomSettingsDialog');
    if (!(dialog instanceof HTMLDialogElement)) return;

    const timeoutSelect = dialog.querySelector('[data-setting-timeout-select]');
    const basicCheck = dialog.querySelector('[data-setting-basic-check]');
    const extendCheck = dialog.querySelector('[data-setting-extend-check]');
    const initialGreenCheck = dialog.querySelector('[data-setting-initial-green-check]');
    const neutralChaosCheck = dialog.querySelector('[data-setting-neutral-chaos-check]');

    const turnTimeoutMinutes = Number.parseInt(String(timeoutSelect?.value || ''), 10);
    const useBasic = Boolean(basicCheck?.checked);
    const useExtend = Boolean(extendCheck?.checked);
    const expansionMode = cardFlagsToExpansionMode(useBasic, useExtend);

    if (!expansionMode) {
      toast(t('lobby.create.expansion_mode_required'), 'error');
      return;
    }
    if (![2, 3, 5, 10, 20, 30].includes(turnTimeoutMinutes)) {
      toast(t('room.settings.invalid_turn_timeout'), 'error');
      return;
    }

    await updateVillageSettings({
      expansion_mode: expansionMode,
      turn_timeout_minutes: turnTimeoutMinutes,
      enable_initial_green_card: Boolean(initialGreenCheck?.checked),
      enable_neutral_chaos_mode: Boolean(neutralChaosCheck?.checked),
    });

    if (dialog.open) {
      dialog.close();
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
    await handlePlayerCardClick(targetAccount, {
      state,
      el,
      t,
      toast,
      dispatch,
      renderState,
      goToLobbyPage,
      getLatestRoomSnapshot: () => latestRoomSnapshot,
      getPendingAbilityActivation: () => pendingAbilityActivation,
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
      shouldSkipTargetConfirm: () => Boolean(state.skipTargetConfirm),
      isAbilityPlayerTarget,
      selectAbilityPlayerTarget,
      canActivateSelfAbilityFromCard,
      startSelfAbilityActivation,
    });
  };

  bindPlayerCardClickTargets({
    el,
    onPlayerCardClick: playerCardClickHandler,
  });

  bindStageInteractions({
    state,
    getLatestRoomSnapshot: () => latestRoomSnapshot,
    getPendingAbilityActivation: () => pendingAbilityActivation,
    getMoveAreaPromptState,
    getAbilityAreaPromptState,
    moveToPromptArea,
    selectAbilityAreaTarget,
    drawCardFromPile,
    openActiveCardDialog,
  });

  bindChatControls({
    el,
    state,
    dispatch,
    renderState,
    goToLobbyPage,
    getLatestRoomSnapshot: () => latestRoomSnapshot,
  });

  bindRoomLifecycle({
    clearRoomAutoRefreshTimer,
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
