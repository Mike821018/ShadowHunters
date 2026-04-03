function expansionModeToCardFlags(mode) {
  const normalized = String(mode || 'all').trim();
  if (normalized === 'no_extend') return { useBasic: true, useExtend: false };
  if (normalized === 'expansion_only') return { useBasic: false, useExtend: true };
  return { useBasic: true, useExtend: true };
}

function formatCardSetSummary({ t }, mode) {
  const { useBasic, useExtend } = expansionModeToCardFlags(mode);
  const parts = [];
  if (useBasic) parts.push('[B]');
  if (useExtend) parts.push('[E]');
  return parts.length ? `${t('room.info.card_pool')}:${parts.join('+')}` : `${t('room.info.card_pool')}:-`;
}

function formatToggleSummary({ t }, value) {
  return value ? t('room.info.setting_on') : t('room.info.setting_off');
}

function formatRoomSettingsSummary({ t }, room) {
  const expansionMode = String(room?.expansion_mode || 'all');
  const boomTimeoutMinutes = Number(room?.turn_timeout_minutes || 3);
  return [
    `${t('room.info.trip_rule')}:${formatToggleSummary({ t }, Boolean(room?.require_trip))}`,
    formatCardSetSummary({ t }, expansionMode),
    `${t('room.info.initial_green_card')}:${formatToggleSummary({ t }, Boolean(room?.enable_initial_green_card))}`,
    `${t('room.info.boom_timeout')}:${t('room.info.boom_timeout_fmt_minutes', { n: boomTimeoutMinutes })}`,
  ].join(' / ');
}

export function renderVillageInfo({ el, esc, withVillageSuffix, goToRegisterPage, state, t, isRoomLayoutPage, isReplayViewState }, data) {
  if (!el.villageInfoList) return;
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
  const canExtendTurnTimeout = isVillageManager && status === 2 && !isChatRoom;
  const villageName = withVillageSuffix(room.room_name || '');
  const villageDescription = room.room_comment || room.village_description || room.description || '-';
  const boomTimeoutMinutes = Number(room.turn_timeout_minutes || 3);
  const expansionMode = String(room.expansion_mode || 'all');
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
        </span>
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
          </div>
          <div class="inline-actions village-settings-dialog-actions">
            <button class="btn" type="button" data-save-village-settings>${esc(t('room.ops.save_settings'))}</button>
            <button class="btn btn-inline" type="submit" data-close-village-settings>${esc(t('room.ops.close_settings'))}</button>
          </div>
        </form>
      </dialog>`
    : '';
  const roomSettings = formatRoomSettingsSummary({ t }, room);
  const replayNotice = String(room.replay_notice || '').trim();
  const turnTimeout = data?.turn_timeout || null;
  const timeoutRemain = Number(turnTimeout?.remaining_seconds);
  const timeoutCurrentAccount = String(turnTimeout?.current_account || '').trim();
  const timeoutCurrent = String(turnTimeout?.current_name || turnTimeout?.current_account || turnTimeout?.current_trip_display || '-').trim();
  const selfAccount = String(state?.account || '').trim();
  const timeoutWarningClass = timeoutCurrentAccount && selfAccount && timeoutCurrentAccount === selfAccount
    ? 'room-timeout-warning'
    : 'room-timeout-info';
  const timeoutWarnRow = (status === 2 && Number.isFinite(timeoutRemain))
    ? `<li class="${isRoomLayout ? 'village-info-row ' : ''}${timeoutWarningClass}"><strong>${esc(t('room.info.turn_timeout'))}</strong>${esc(t('room.info.turn_timeout_fmt', { who: timeoutCurrent || '-', n: Math.max(0, timeoutRemain) }))}</li>`
    : '';
  const boomedNotice = data?.boomed_notice || null;
  const boomedName = String(boomedNotice?.name || boomedNotice?.trip_display || '').trim();
  const boomedNoticeRow = (status === 2 && boomedName)
    ? `<li class="${isRoomLayout ? 'village-info-row ' : ''}room-timeout-warning"><strong>${esc(t('room.info.boomed_notice'))}</strong>${esc(t('room.info.boomed_notice_fmt', { name: boomedName }))}</li>`
    : '';

  if (!isRoomLayout) {
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
        ${canExtendTurnTimeout ? `<button id="btnExtendTurnTimeoutInline" class="btn btn-inline" type="button">${esc(t('room.ops.extend_turn_timeout'))}</button>` : ''}
      </li>
      <li><strong>${esc(t('room.info.name'))}</strong>${esc(villageName || '-')}</li>
      <li><strong>${esc(t('room.info.desc'))}</strong>${esc(villageDescription)}</li>
      ${settingsDialog}
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
    </li>
    <li class="village-info-row village-info-row-primary village-info-row-desc">
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
      ${canExtendTurnTimeout ? `<button id="btnExtendTurnTimeoutInline" class="btn btn-inline" type="button">${esc(t('room.ops.extend_turn_timeout'))}</button>` : ''}
      ${canAbolish ? `<button id="btnAbolishVillageInline" class="btn btn-inline" type="button">${esc(t('room.ops.abolish'))}</button>` : ''}
    </li>
    ${settingsDialog}
    ${timeoutWarnRow}
    ${boomedNoticeRow}
  `;

  if (canRegister) {
    const btn = el.villageInfoList.querySelector('#btnOpenResidentRegister');
    btn?.addEventListener('click', () => goToRegisterPage(room.room_id));
  }
}
