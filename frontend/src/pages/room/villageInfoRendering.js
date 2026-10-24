import { expansionModeToCardFlags } from './roomSettingsBadges.js';
import { renderVillageSettingsBadges, bindVillageSettingsBadgePopover } from './villageSettingsBadges.js';
import { getRenderSyncedAtMs } from './renderClock.js';

export function renderVillageInfo({ el, esc, withVillageSuffix, goToRegisterPage, state, t, isRoomLayoutPage, isReplayViewState }, data) {
  if (!el.villageInfoList) return;

  // 2026-10-12: pin the village info panel while the manager/GM has the room
  // settings dialog open, so a background refresh (SSE push or the fallback
  // poll) doesn't rebuild the panel underneath them mid-edit -- that used to
  // wipe out unsaved field changes and could force-close the dialog.
  const openSettingsDialog = el.villageInfoList.querySelector('#btnEditRoomSettingsDialog');
  if (openSettingsDialog instanceof HTMLDialogElement && openSettingsDialog.open) {
    return;
  }

  const isRoomLayout = isRoomLayoutPage(state, data);
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
        : status === 4
          ? t('room.info.status_abolished')
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
  // 2026-10-19 修正：原本只有招募中（status 1）才會顯示廢村按鈕，遊戲開始後
  // （status 2）村長/GM 就完全沒有辦法廢村了。Mike 要求遊戲進行中也要看得到這顆
  // 按鈕（搭配 room.js 裡新補上的二次確認，避免誤觸），遊戲結束（status 3）後
  // 房間本身已經沒有在運作，維持不顯示。
  const canAbolish = isVillageManager && (status === 1 || status === 2);
  // 2026-10-23 新增：房間如果建立時沒設村長 Trip，就永遠不會有人符合 isVillageManager，
  // canAbolish 永遠是 false，等於這種房間完全沒有人能廢村。補一個「投票廢村」給非村長的
  // 已加入玩家使用，不限房間是否真的有村長（村長本來就有自己的直接廢村按鈕）。
  const canVoteAbolish = hasJoined && !isVillageManager && (status === 1 || status === 2);
  const abolishVoteThreshold = isChatRoom ? 5 : 3;
  const canRollCall = isVillageManager && status === 1 && !isChatRoom;
  const canExtendTurnTimeout = isVillageManager && status === 2 && !isChatRoom;
  // 2026-10-20 修正：原本這裡還會算「GM 可以按開始遊戲」（canGmStartGame），跟非 GM
  // 玩家一樣用一個額外按鈕手動觸發開局。Mike 要求改回全員（含 GM）準備完成就自動
  // 開局，GM 現在跟其他玩家一樣用 canToggleReady 那顆「準備」按鈕控制，不再需要
  // 別的開始遊戲按鈕，所以 canGmStartGame、nonGmPlayerEntries、allNonGmReady 三個一起拿掉。
  // 發完角色後會暫停等 GM 按「開始遊戲流程」這一重關卡是別的機制，這次沒改，
  // canGmReleaseStart 維持原樣不動。
  const gmEnabledRoom = Boolean(room.gm_enabled);
  const isGm = Boolean(selfPlayer?.is_gm);
  const awaitingGmRelease = Boolean(room.awaiting_gm_release);
  const canGmReleaseStart = isGm && gmEnabledRoom && status === 2 && awaitingGmRelease;
  const villageName = withVillageSuffix(room.room_name || '');
  const villageDescription = room.room_comment || room.village_description || room.description || '-';
  const boomTimeoutMinutes = Number(room.turn_timeout_minutes || 3);
  const expansionMode = String(room.expansion_mode || 'all');
  const neutralChaosMode = Boolean(room.enable_neutral_chaos_mode);
  const badgeUniqueMode = Boolean(room.enable_badge_unique_character_select);
  const randomInitialPosition = Boolean(room.enable_random_initial_position);
  const { useBasic, useExtend } = expansionModeToCardFlags(expansionMode);
  const settingsDialog = canEditSettings
    ? `
      <dialog id="btnEditRoomSettingsDialog" class="village-settings-dialog" aria-label="${esc(t('room.ops.edit_settings'))}">
        <form method="dialog" class="village-settings-dialog-form">
          <div class="village-settings-dialog-header">
            <strong>${esc(t('room.ops.edit_settings'))}</strong>
            <button class="btn btn-inline" type="submit" data-close-village-settings>×</button>
          </div>
          <div class="village-settings-inline">
        <span class="village-settings-group village-settings-group-cards">
          <strong>${esc(t('lobby.create.expansion_mode_label'))}</strong>
          <label class="checkbox-row checkbox-row-inline room-settings-checkbox">
            <input type="checkbox" data-setting-basic-check ${useBasic ? 'checked' : ''} />
            <span>${esc(t('lobby.create.expansion_mode_basic'))}</span>
          </label>
          <label class="checkbox-row checkbox-row-inline room-settings-checkbox">
            <input type="checkbox" data-setting-extend-check ${useExtend ? 'checked' : ''} />
            <span>${esc(t('lobby.create.expansion_mode_extend'))}</span>
          </label>
          <span class="field-hint room-settings-hint">${esc(t('lobby.create.expansion_mode_hint'))}</span>
          <label class="checkbox-row checkbox-row-inline room-settings-checkbox">
            <input type="checkbox" data-setting-badge-unique-check ${badgeUniqueMode ? 'checked' : ''} />
            <span>${esc(t('lobby.create.badge_unique_label'))}</span>
          </label>
          <span class="field-hint room-settings-hint">${esc(t('lobby.create.badge_unique_hint'))}</span>
        </span>
        ${isChatRoom ? '' : `
        <span class="village-settings-group village-settings-group-max-players">
          <strong>${esc(t('room.settings.max_players_label'))}</strong>
          <select class="txt room-settings-select" data-setting-max-players-select>
            <option value="4" ${maxPlayers === 4 ? 'selected' : ''}>4</option>
            <option value="5" ${maxPlayers === 5 ? 'selected' : ''}>5</option>
            <option value="6" ${maxPlayers === 6 ? 'selected' : ''}>6</option>
            <option value="7" ${maxPlayers === 7 ? 'selected' : ''}>7</option>
            <option value="8" ${maxPlayers === 8 ? 'selected' : ''}>8</option>
          </select>
          <span class="field-hint room-settings-hint">${esc(t('room.settings.max_players_hint'))}</span>
        </span>`}
        <span class="village-settings-group village-settings-group-timeout">
          <strong>${esc(t('lobby.create.turn_timeout_label'))}</strong>
          <select class="txt room-settings-select" data-setting-timeout-select>
            <option value="2" ${boomTimeoutMinutes === 2 ? 'selected' : ''}>${esc(t('lobby.create.turn_timeout_2min'))}</option>
            <option value="3" ${boomTimeoutMinutes === 3 ? 'selected' : ''}>${esc(t('lobby.create.turn_timeout_3min'))}</option>
            <option value="5" ${boomTimeoutMinutes === 5 ? 'selected' : ''}>${esc(t('lobby.create.turn_timeout_5min'))}</option>
            <option value="10" ${boomTimeoutMinutes === 10 ? 'selected' : ''}>${esc(t('lobby.create.turn_timeout_10min'))}</option>
            <option value="20" ${boomTimeoutMinutes === 20 ? 'selected' : ''}>${esc(t('lobby.create.turn_timeout_20min'))}</option>
            <option value="30" ${boomTimeoutMinutes === 30 ? 'selected' : ''}>${esc(t('lobby.create.turn_timeout_30min'))}</option>
          </select>
        </span>
        <span class="village-settings-group village-settings-group-green">
          <strong>${esc(t('lobby.create.initial_green_card_label'))}</strong>
          <label class="checkbox-row checkbox-row-inline room-settings-checkbox">
            <input type="checkbox" data-setting-initial-green-check ${room.enable_initial_green_card ? 'checked' : ''} />
            <span>${esc(t('room.info.setting_on'))}</span>
          </label>
          <span class="field-hint room-settings-hint">${esc(t('lobby.create.initial_green_card_hint'))}</span>
        </span>
        <span class="village-settings-group village-settings-group-neutral-chaos">
          <strong>${esc(t('lobby.create.neutral_chaos_mode_label'))}</strong>
          <label class="checkbox-row checkbox-row-inline room-settings-checkbox">
            <input type="checkbox" data-setting-neutral-chaos-check ${neutralChaosMode ? 'checked' : ''} />
            <span>${esc(t('room.info.setting_on'))}</span>
          </label>
          <span class="field-hint room-settings-hint">${esc(t('lobby.create.neutral_chaos_mode_hint'))}</span>
        </span>
        <span class="village-settings-group village-settings-group-random-position">
          <strong>${esc(t('lobby.create.random_initial_position_label'))}</strong>
          <label class="checkbox-row checkbox-row-inline room-settings-checkbox">
            <input type="checkbox" data-setting-random-position-check ${randomInitialPosition ? 'checked' : ''} />
            <span>${esc(t('room.info.setting_on'))}</span>
          </label>
          <span class="field-hint room-settings-hint">${esc(t('lobby.create.random_initial_position_hint'))}</span>
        </span>
          </div>
          <div class="inline-actions village-settings-dialog-actions">
            <button class="btn" type="button" data-save-village-settings>${esc(t('room.ops.save_settings'))}</button>
            <button class="btn btn-inline" type="submit" data-close-village-settings>${esc(t('room.ops.close_settings'))}</button>
          </div>
        </form>
      </dialog>`
    : '';
  const roomSettingsBadgesHtml = renderVillageSettingsBadges({ t }, room);
  const replayNotice = String(room.replay_notice || '').trim();
  const turnTimeout = data?.turn_timeout || null;
  const timeoutRemain = Number(turnTimeout?.remaining_seconds);
  const timeoutCurrentAccount = String(turnTimeout?.current_account || '').trim();
  const timeoutCurrent = String(turnTimeout?.current_name || turnTimeout?.current_account || turnTimeout?.current_trip_display || '-').trim();
  const selfAccount = String(state?.account || '').trim();
  const timeoutWarningClass = timeoutCurrentAccount && selfAccount && timeoutCurrentAccount === selfAccount
    ? 'room-timeout-warning'
    : 'room-timeout-info';
  // 2026-10-13：倒數秒數原本只有每次房間快照更新（SSE 推播）時才會換一次數字，
  // 看起來像是「每幾秒跳一次」而不是正常的每秒讀秒。這裡改成：畫面上只放一個固定的
  // <span>，記下「這次同步到的剩餘秒數」跟「同步到的那個時間點（本機時鐘）」兩個
  // data 屬性，實際顯示的數字交給 room.js 裡一個每秒跑一次的本機倒數計時器
  // （turnTimeoutTicker）自己用本機時鐘算出目前該顯示多少秒，不用等下一次房間快照
  // 推播才更新；每次真的有新快照進來，這個 <li> 會整個重新渲染，data 屬性也會換成
  // 新的基準值跟新的同步時間點，本機倒數計時器下一次 tick 就會自動用新的基準值校正，
  // 不會愈走愈不準。
  const timeoutRemainDisplay = Math.max(0, Number.isFinite(timeoutRemain) ? timeoutRemain : 0);
  const timeoutTextTemplate = esc(t('room.info.turn_timeout_fmt', { who: timeoutCurrent || '-' }));
  const timeoutTextHtml = timeoutTextTemplate.replace(
    '{n}',
    `<span id="roomTurnTimeoutRemainSeconds" data-remain-base="${timeoutRemainDisplay}" data-remain-synced-at="${getRenderSyncedAtMs()}">${timeoutRemainDisplay}</span>`,
  );
  const timeoutWarnRow = (status === 2 && Number.isFinite(timeoutRemain))
    ? `<li class="${isRoomLayout ? 'village-info-row ' : ''}${timeoutWarningClass}"><strong>${esc(t('room.info.turn_timeout'))}</strong>${timeoutTextHtml}</li>`
    : '';
  const boomedNotice = data?.boomed_notice || null;
  const boomedName = String(boomedNotice?.name || boomedNotice?.trip_display || '').trim();
  const boomedNoticeRow = (status === 2 && boomedName)
    ? `<li class="${isRoomLayout ? 'village-info-row ' : ''}room-timeout-warning"><strong>${esc(t('room.info.boomed_notice'))}</strong>${esc(t('room.info.boomed_notice_fmt', { name: boomedName }))}</li>`
    : '';
  // 2026-10-15：開局後暫停等 GM 開始遊戲流程時，給所有人（不只 GM）看到這則提示，
  // 不然其他玩家會搞不清楚為什麼角色都發好了卻什麼事都沒發生。
  const awaitingGmReleaseNoticeRow = awaitingGmRelease
    ? `<li class="${isRoomLayout ? 'village-info-row ' : ''}room-timeout-warning"><strong>${esc(t('room.info.awaiting_gm_release'))}</strong>${esc(t('room.info.awaiting_gm_release_desc'))}</li>`
    : '';

  if (!isRoomLayout) {
    el.villageInfoList.innerHTML = `
      <li>
        <strong>${esc(t('room.info.room_id'))}</strong>${room.room_id ?? '-'}
        ${canAbolish ? `<button id="btnAbolishVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.abolish'))}</button>` : ''}
        ${canVoteAbolish ? `<button id="btnVoteAbolishVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.vote_abolish', { n: abolishVoteThreshold }))}</button>` : ''}
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
        ${canExtendTurnTimeout ? `<button id="btnExtendTurnTimeoutInline" class="btn btn-inline" type="button">${esc(t('room.ops.extend_turn_timeout'))}</button>` : ''}
        ${canGmReleaseStart ? `<button id="btnGmReleaseStartInline" class="btn btn-inline" type="button">${esc(t('room.ops.gm_release_start'))}</button>` : ''}
      </li>
      <li><strong>${esc(t('room.info.name'))}</strong>${esc(villageName || '-')}</li>
      <li><strong>${esc(t('room.info.desc'))}</strong>${esc(villageDescription)}</li>
      ${settingsDialog}
      ${replayNotice ? `<li><strong>${esc(t('room.info.replay_notice'))}</strong>${esc(replayNotice)}</li>` : ''}
      ${timeoutWarnRow}
      ${boomedNoticeRow}
      ${awaitingGmReleaseNoticeRow}
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
    </li>
    <li class="village-info-row village-info-row-primary village-info-row-desc">
      <span class="village-info-item"><strong>${esc(t('room.info.desc'))}</strong>${esc(villageDescription)}</span>
      ${replayNotice ? `<span class="village-info-item village-info-replay"><strong>${esc(t('room.info.replay_notice'))}</strong>${esc(replayNotice)}</span>` : ''}
    </li>
    <li class="village-info-row village-info-row-meta">
      <span class="village-info-item"><strong>${esc(t('room.info.room_id'))}</strong>${room.room_id ?? '-'}</span>
      <span class="village-info-item"><strong>${esc(t('room.info.status'))}</strong><span class="${statusClass}">${esc(statusText)}</span></span>
      <span class="village-info-item"><strong>${esc(t('room.info.count'))}</strong>${Number(room.player_count || 0)}/${maxPlayers}</span>
      <span class="village-info-settings-line village-info-settings-badges-line">${roomSettingsBadgesHtml}</span>
    </li>
    <li class="village-info-row village-info-row-actions">
      ${canRegister ? `<button id="btnOpenResidentRegister" class="btn btn-inline" type="button">${esc(t('room.info.open_register'))}</button>` : ''}
      ${canLeave ? `<button id="btnLeaveVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.leave'))}</button>` : ''}
      ${canEditSettings ? `<button id="btnEditRoomSettingsInline" class="btn btn-inline" type="button">${esc(t('room.ops.edit_settings'))}</button>` : ''}
      ${canToggleReady ? `<button id="btnToggleReadyInline" class="btn btn-inline" type="button">${esc(isSelfReady ? t('room.ops.unready') : t('room.ops.ready'))}</button>` : ''}
      ${canRollCall ? `<button id="btnRollCallInline" class="btn btn-inline" type="button">${esc(t('room.ops.roll_call'))}</button>` : ''}
      ${canExtendTurnTimeout ? `<button id="btnExtendTurnTimeoutInline" class="btn btn-inline" type="button">${esc(t('room.ops.extend_turn_timeout'))}</button>` : ''}
      ${canGmReleaseStart ? `<button id="btnGmReleaseStartInline" class="btn btn-inline" type="button">${esc(t('room.ops.gm_release_start'))}</button>` : ''}
      ${canAbolish ? `<button id="btnAbolishVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.abolish'))}</button>` : ''}
      ${canVoteAbolish ? `<button id="btnVoteAbolishVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.vote_abolish', { n: abolishVoteThreshold }))}</button>` : ''}
    </li>
    ${settingsDialog}
    ${timeoutWarnRow}
    ${boomedNoticeRow}
    ${awaitingGmReleaseNoticeRow}
  `;

  bindVillageSettingsBadgePopover(el.villageInfoList);

  if (canRegister) {
    const btn = el.villageInfoList.querySelector('#btnOpenResidentRegister');
    btn?.addEventListener('click', () => goToRegisterPage(room.room_id));
  }
}
