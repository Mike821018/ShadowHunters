import { PLAYER_COLOR_HEX } from '../constants.js';
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
import { bindChatControls, isChatNearBottom, scrollChatToBottom, updateChatScrollBottomButton } from './room/chatControls.js';
import { bindRoomLifecycle } from './room/roomLifecycle.js';
import { connectRoomEventStream, clearRoomEventSource } from './room/roomEventStream.js';
import { playGameStartSound, playYourTurnSound, playRollCallSound, playActionNeededSound } from '../soundEffects.js';
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
  canActivateStandbyAbility as canActivateStandbyAbilityModule,
  getCurrentTurnPlayer as getCurrentTurnPlayerModule,
  isReplayViewState as isReplayViewStateModule,
  isRoomLayoutPage as isRoomLayoutPageModule,
  showOccupantNamePopup as showOccupantNamePopupModule,
  getDiscardEquipmentOptions as getDiscardEquipmentOptionsModule,
  getDrawablePileColors as getDrawablePileColorsModule,
} from './room/roomStateHelpers.js';

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
let autoEndTurnTimer = null;
let autoEndTurnRunner = null;
let endTurnAbilityInteractionActive = false;
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
  // 2026-10-06 修正：原本的寫法是「只要不是 Unknown 就回報 'd6'」，等於永遠是 truthy，
  // 導致所有「不需要擲骰」的發動能力角色（例如楓花 Fu-ka）都被誤判成擲骰流程——
  // 玩家選好目標之後，程式不會直接發動能力，而是改成等玩家再按一次行動骰才會真正送出，
  // 但畫面上完全沒有提示要再按一次，玩家只看到選目標之後整個卡住、什麼都沒發生。
  // 這跟之前行動骰按鈕的 P0 bug 是同一種成因：room.js 自己另外維護了一份跟
  // room/diceAnimation.js 裡同名函式邏輯不一致的副本（後者才是正確、但完全沒被
  // import 使用的孤兒模組）。這裡改成跟 diceAnimation.js 一致的正確邏輯：
  // 只有 Franklin、George 這兩個角色的能力需要擲骰動畫，其餘所有角色（包括 Fu-ka）
  // 都回傳空字串，讓 selectAbilityPlayerTarget／activateSelfAbility 直接發動能力。
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

function canActivateStandbyAbility(state, dataSnapshot = latestRoomSnapshot) {
  return canActivateStandbyAbilityModule(state, dataSnapshot);
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

const { updateStagePilePromptState, updateStageNextStepButtonState: updateStageNextStepButtonStateBase } = createStageNextStepStateHandlers({
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

// 包一層：所有既有呼叫點（renderState、各種 next_step 動作後）不需修改，
// 就能一併檢查是否該排程「自動結束回合」。
function updateStageNextStepButtonState(state, dataSnapshot) {
  updateStageNextStepButtonStateBase(state, dataSnapshot);
  maybeHandleAutoEndTurn(state, dataSnapshot || latestRoomSnapshot);
}

// 2026-10-09 修正：倒數秒數的「自動更新」設定已經拿掉（主畫面改成完全依賴
// room_state_changed 的 SSE 即時推播，跟浮動聊天室用同一套機制，不需要這組
// 輪詢秒數當主要更新手段），這個函式現在只負責清掉「自動結束回合」的延遲
// 計時器；函式名稱先保留（呼叫端還有好幾處用這個名字），避免多動其他檔案。
function clearRoomAutoRefreshTimer() {
  if (autoEndTurnTimer) {
    window.clearTimeout(autoEndTurnTimer);
    autoEndTurnTimer = null;
  }
}

// 回合結束階段只要玩家開始跟自己的角色互動（揭露角色，或點自己的卡片準備發動
// 能力，例如艾利 Allie 揭露後回滿血），就呼叫這個函式：立刻取消目前排程中的
// 「自動結束回合」計時器，並記住這次回合結束階段不要再自動排程，把決定權留給
// 玩家自己手動按「結束回合」；離開這個回合結束階段（換人或自己進入下一回合）
// 時會自動重置，不影響下一次。
function markEndTurnAbilityInteractionStarted() {
  endTurnAbilityInteractionActive = true;
  if (autoEndTurnTimer) {
    window.clearTimeout(autoEndTurnTimer);
    autoEndTurnTimer = null;
  }
}

// 自動結束回合：輪到自己且進入回合結束階段（status 6）時，隨機延遲 2-5 秒後
// 自動觸發跟手動點擊「結束回合」相同的動作。預設開啟（state.autoEndTurn 未設定時視為開啟）。
// 正常情況下這個功能照常運作；只有在玩家已經開始揭露角色／準備發動能力
// （markEndTurnAbilityInteractionStarted 被呼叫過）時才會暫停，避免搶在玩家
// 揭露＋發動能力完成前就把回合自動結束掉。
function maybeHandleAutoEndTurn(state, snapshot) {
  const autoEndTurnEnabled = state?.autoEndTurn !== false;
  const roomStatus = Number(snapshot?.room?.room_status || 0);
  const selfAccount = String(state?.account || '').trim();
  const currentAccount = String(snapshot?.turn?.current_account || '').trim();
  const selfStatus = Number(snapshot?.players?.[selfAccount]?.status || 0);

  // 離開「輪到自己、回合結束階段」這個情境時重置旗標，避免延續影響到下一次。
  if (!(roomStatus === 2 && selfAccount && selfAccount === currentAccount && selfStatus === 6)) {
    endTurnAbilityInteractionActive = false;
  }

  const shouldAutoEnd = Boolean(
    autoEndTurnEnabled
    && typeof autoEndTurnRunner === 'function'
    && state?.roomId
    && roomStatus === 2
    && selfAccount
    && selfAccount === currentAccount
    && selfStatus === 6
    && !endTurnAbilityInteractionActive
    && !diceRollBusy
    && !diceRollAnimating
    && !stageNextStepBusy
  );
  if (!shouldAutoEnd) {
    if (autoEndTurnTimer) {
      window.clearTimeout(autoEndTurnTimer);
      autoEndTurnTimer = null;
    }
    return;
  }
  if (autoEndTurnTimer) return; // 已排程過，避免同一次回合結束階段重複排程
  const delayMs = 2000 + Math.floor(Math.random() * 3001); // 隨機 2000-5000ms
  autoEndTurnTimer = window.setTimeout(() => {
    autoEndTurnTimer = null;
    autoEndTurnRunner?.();
  }, delayMs);
}

// 2026-10-09 修正：拿掉倒數秒數「自動更新」的按鈕群組（0/5/10/20/30秒），
// 房間頁已經靠 room_state_changed 的 SSE 即時推播更新，不需要這組額外的輪詢
// 設定；這裡保留原本就在同一個容器內的「二次確認」「自動結束回合」兩個開關。
function renderAutoRefreshControls({ el, state, onToggleSkipTargetConfirm, onToggleAutoEndTurn }) {
  if (!el.autoRefreshOptions) return;
  const requireTargetConfirmChecked = !Boolean(state.skipTargetConfirm);
  const autoEndTurnChecked = state.autoEndTurn !== false;
  el.autoRefreshOptions.innerHTML = `
    <label class="auto-refresh-skip-confirm">
      <input type="checkbox" data-skip-target-confirm ${requireTargetConfirmChecked ? 'checked' : ''}>
      ${t('room.auto_refresh.skip_target_confirm')}
    </label>
    <label class="auto-refresh-skip-confirm">
      <input type="checkbox" data-auto-end-turn ${autoEndTurnChecked ? 'checked' : ''}>
      ${t('room.auto_refresh.auto_end_turn')}
    </label>
  `;
  const skipToggle = el.autoRefreshOptions.querySelector('[data-skip-target-confirm]');
  if (skipToggle instanceof HTMLInputElement) {
    skipToggle.addEventListener('change', () => {
      onToggleSkipTargetConfirm?.(!skipToggle.checked);
    });
  }
  const autoEndTurnToggle = el.autoRefreshOptions.querySelector('[data-auto-end-turn]');
  if (autoEndTurnToggle instanceof HTMLInputElement) {
    autoEndTurnToggle.addEventListener('change', () => {
      onToggleAutoEndTurn?.(autoEndTurnToggle.checked);
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

  // 上滑看歷史訊息時不要被新訊息打斷畫面：只有原本就在底部附近才自動捲到新訊息，
  // 否則維持使用者原本的捲動位置（內容只會往後追加，位置不會因此跑掉），
  // 並透過 updateChatScrollBottomButton 顯示「回到最新訊息」按鈕讓使用者自行選擇。
  const chatWasNearBottom = isChatNearBottom(el.chatMessages);
  const chatPrevScrollTop = el.chatMessages.scrollTop;
  const systemWasNearBottom = el.systemMessages ? isChatNearBottom(el.systemMessages) : true;
  const systemPrevScrollTop = el.systemMessages ? el.systemMessages.scrollTop : 0;

  el.chatMessages.innerHTML = chatLines.length ? chatLines.join('') : `<p class="lighttxt">${esc(t('room.chat.empty'))}</p>`;
  if (el.systemMessages) {
    el.systemMessages.innerHTML = systemLines.length ? systemLines.join('') : `<p class="lighttxt">${esc(t('room.chat.empty'))}</p>`;
  }

  if (chatWasNearBottom) {
    scrollChatToBottom(el.chatMessages);
  } else {
    el.chatMessages.scrollTop = chatPrevScrollTop;
  }
  if (el.systemMessages) {
    if (systemWasNearBottom) {
      el.systemMessages.scrollTop = el.systemMessages.scrollHeight;
    } else {
      el.systemMessages.scrollTop = systemPrevScrollTop;
    }
  }
  updateChatScrollBottomButton(el);
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
  const previousRoomSnapshot = latestRoomSnapshot;
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

  // 開場音效／輪到自己音效／重新點名音效：跟 previousRoomSnapshot 比對狀態轉變才播放，
  // 避免剛進房間、重新整理、或切換到別的房間時誤判成「剛開局」「剛輪到我」或「剛被點名」。
  const isFreshRoomEntry = !previousRoomSnapshot
    || (previousRoomSnapshot?.room?.room_id || null) !== (data?.room?.room_id || null);
  if (!isFreshRoomEntry) {
    const previousRoomStatus = Number(previousRoomSnapshot?.room?.room_status || 0);
    const nextRoomStatus = Number(data?.room?.room_status || 0);
    if (previousRoomStatus !== 2 && nextRoomStatus === 2) {
      playGameStartSound();
    }

    const selfAccount = String(state.account || '').trim();
    if (selfAccount) {
      const previousTurnAccount = String(previousRoomSnapshot?.turn?.current_account || '').trim();
      const nextTurnAccount = String(data?.turn?.current_account || '').trim();
      if (nextTurnAccount === selfAccount && previousTurnAccount !== selfAccount) {
        playYourTurnSound();
      }
    }

    const previousRollCallAt = Number(previousRoomSnapshot?.roll_call_notice?.timestamp || 0);
    const nextRollCallAt = Number(data?.roll_call_notice?.timestamp || 0);
    if (nextRollCallAt > 0 && nextRollCallAt !== previousRollCallAt) {
      playRollCallSound();
    }

    // 綠卡確認通知：current_account 在綠卡確認這段流程裡不會變成目標玩家，
    // 所以不能靠上面「輪到自己」那段判斷，要另外比對 green_confirm_prompt：
    //   1) 我剛被對方的卡片效果指定為需要確認/選擇的目標 → 提示我該確認了。
    //   2) 我剛才是被卡住等對方確認的那個人（我是 source_account），
    //      現在這個 pending 已經消失（對方確認完了）→ 提示我可以繼續操作了。
    if (selfAccount) {
      const previousGreenPrompt = previousRoomSnapshot?.green_confirm_prompt || null;
      const nextGreenPrompt = data?.green_confirm_prompt || null;

      const previousWaitingForMe = Boolean(previousGreenPrompt?.waiting_confirm);
      const nextWaitingForMe = Boolean(nextGreenPrompt?.waiting_confirm);
      if (nextWaitingForMe && !previousWaitingForMe) {
        playActionNeededSound();
      }

      const previousBlockedAsSource = String(previousGreenPrompt?.source_account || '').trim() === selfAccount;
      const nextBlockedAsSource = String(nextGreenPrompt?.source_account || '').trim() === selfAccount;
      if (previousBlockedAsSource && !nextBlockedAsSource) {
        playActionNeededSound();
      }
    }
  }

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
  const pendingDicePromptTargets = Array.isArray(pendingDiceAction?.highlightTargetAccounts)
    ? pendingDiceAction.highlightTargetAccounts.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const playerPromptTargets = pendingDicePromptTargets.length > 0
    ? pendingDicePromptTargets
    : pendingDiceAction
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
  const playerPromptClass = pendingDicePromptTargets.length > 0
    ? String(pendingDiceAction?.highlightPromptClass || 'attack-target-prompt')
    : (pendingKillLoot.active || pendingSteal.active || areaPrompt.active || cardPrompt.active) ? 'area-target-prompt' : 'attack-target-prompt';
  const handleEquipmentChipClick = ({ equipmentName, anchorEl }) => {
    openEquipmentCardDialog(equipmentName, anchorEl);
  };
  const handleShieldChipClick = ({ source, anchorEl }) => {
    openInvulnerabilityInfoDialog(source, anchorEl);
  };
  renderPlayerCards(el.roomCards, data, { view: 'room', enableVoteKick: true, targetAccounts: playerPromptTargets, targetPromptClass: playerPromptClass, onEquipmentChipClick: handleEquipmentChipClick, onShieldChipClick: handleShieldChipClick });
  patchRoomCardsLayout();
  renderPlayerCards(el.battleCards, data, { view: 'flow', targetAccounts: playerPromptTargets, targetPromptClass: playerPromptClass, onEquipmentChipClick: handleEquipmentChipClick, onShieldChipClick: handleShieldChipClick });

  // 手機版玩家列表會被 floatingSysInfo.js 整個移進右下角的浮動收合面板，
  // 面板收合時看不到裡面正在閃爍的玩家卡片，所以額外讓收合按鈕本身也跟著閃爍，
  // 用跟玩家卡片一樣的 class／動畫（攻擊=紅色、區域效果等=藍色），保持視覺一致；
  // 桌面版沒有這個浮動按鈕（floatingSysInfo 在寬螢幕是no-op），這段查詢會是 null，安全跳過。
  const floatingPlayersToggleBtn = document.querySelector('.sh-floating-players .sh-ffs-toggle-btn');
  if (floatingPlayersToggleBtn) {
    const hasPlayerTargetPrompt = playerPromptTargets.length > 0;
    floatingPlayersToggleBtn.classList.toggle('attack-target-prompt', hasPlayerTargetPrompt && playerPromptClass === 'attack-target-prompt');
    floatingPlayersToggleBtn.classList.toggle('area-target-prompt', hasPlayerTargetPrompt && playerPromptClass === 'area-target-prompt');
  }

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
            // 2026-10-06：補回 issue_86 回合流程重新設計的部分，之前為了配合沒重啟的
            // 舊後端而暫時拿掉，忘記這裡跟 stageProgression.js 裡有重複的一份邏輯，
            // 只恢復了模組檔案、沒有一起恢復這裡——開場階段（status=1）現在也能直接按
            // 行動骰，一次完成「結束開始階段＋擲骰決定移動結果」。
            selfStatus === 1
            || (selfStatus === 2 && !movePrompt.active)
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
    if (selfStatus === 1 || selfStatus === 2 || (selfStatus === 5 && !counterAttackPrompt.active)) {
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
  // 讓模組層級的自動結束回合計時器能呼叫到這裡定義的 runStageNextStep。
  autoEndTurnRunner = runStageNextStep;

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
      const highlightTargetAccounts = target?.kind === 'player' && target?.id
        ? [String(target.id).trim()].filter(Boolean)
        : [];
      setPendingDiceAction({
        labelKey: cardDiceMeta.labelKey,
        mode: cardDiceMeta.mode,
        toastKey: 'toast.card_effect_ok',
        highlightTargetAccounts,
        highlightPromptClass: 'attack-target-prompt',
        execute: () => dispatch('card_effect', payload),
        afterRender: async (data) => {
          await maybeResolvePendingSteal(data);
        },
      });
      renderState(latestRoomSnapshot);
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
      // 2026-10-09 修正：綠卡（例如 Greed）結算後，若效果是「裝備轉移」（ret=2），
      // confirm_green_card 這次呼叫回傳的資料就已經包含新建立的 pending_steal，
      // 而且這裡（確認綠卡的那個玩家，也就是被奪取裝備的那一方 chooser）正是
      // 唯一會自動跳出裝備選擇視窗的時機點——跟 useErstwhileAltarOnTarget／
      // useActiveCard 現有的用法一致。原本這裡漏了這一行，導致確認綠卡後畫面
      // 什麼都不會再發生、裝備選擇視窗不會跳出來，_pending_steal 就一直留在
      // 後端沒有結算，直到之後玩家做了其他會呼叫 maybeResolvePendingSteal 的
      // 操作（例如自己下一回合使用場地）才會意外把這次遺留的轉移一起結算掉。
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
        // 2026-10-12 修正：這裡是角色能力從棄牌堆選裝備的對話框（例如大衛），
        // 原本誤用 type_equipment（'裝備卡'）當作 {name}，顯示成「請選擇要從 裝備卡
        // 奪取的裝備」語意不通；改用新增的 type_discard_pile（'棄牌堆'）。
        message: t('room.equipment_choice.message', { name: t('room.active_card.type_discard_pile') }),
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

  // ability_timing===11（例如艾莉 Allie）：不限自己回合，隨時可以點自己的卡片發動，
  // 走獨立於 next_step 回合推進流程之外的 activate_standby_ability 動作。
  const startStandbyAbilityActivation = async () => {
    const abilityState = getSelfAbilityState(state);
    if (!abilityState || !canActivateStandbyAbility(state)) return;

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

    if (abilityState.targetType && abilityState.targetType !== 'self') {
      toast(t('toast.character_ability_not_supported'), 'error');
      return;
    }

    try {
      const data = await dispatch('activate_standby_ability', {
        room_id: state.roomId,
        account: state.account || undefined,
      });
      renderState(data);
      toast(t('toast.character_ability_activated'));
    } catch (error) {
      if (error?.code === 'ROOM_NOT_FOUND') {
        goToLobbyPage();
        return;
      }
      console.error(error);
    }
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
        highlightTargetAccounts: [String(targetAccount || '').trim()].filter(Boolean),
        highlightPromptClass: 'attack-target-prompt',
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
    renderAutoRefreshControls,
  });

  connectRoomEventStream({ state, dispatch, renderState, toast, t, goToLobbyPage });

  const leaveVillage = async () => {
    if (!state.roomId || !state.account) return;
    const leavingRoomId = state.roomId;
    await dispatch('leave_room', { room_id: state.roomId, account: state.account });
    clearRoomAutoRefreshTimer();
    clearRoomEventSource();
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
    clearRoomEventSource();
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
        enable_badge_unique_character_select: patch.enable_badge_unique_character_select ?? Boolean(roomInfo.enable_badge_unique_character_select),
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
    const badgeUniqueCheck = dialog.querySelector('[data-setting-badge-unique-check]');

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
      enable_badge_unique_character_select: Boolean(badgeUniqueCheck?.checked),
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
      canActivateStandbyAbility,
      startStandbyAbilityActivation,
      markEndTurnAbilityInteractionStarted,
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
    clearRoomEventSource,
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
