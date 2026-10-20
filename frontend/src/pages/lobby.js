import { resolveLang, t } from '../i18n.js';

export function renderRooms({ el, esc, withVillageSuffix, goToRoomPage }, rooms) {
  if (!el.roomsTbody) return;
  el.roomsTbody.innerHTML = '';

  const visibleRooms = (rooms || []).filter((r) => Number(r.room_status) !== 3);

  if (!visibleRooms.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="5" class="lighttxt">${esc(t('lobby.rooms.empty'))}</td>`;
    el.roomsTbody.appendChild(tr);
    return;
  }

  visibleRooms.forEach((r) => {
    const status = Number(r.room_status);
    const maxPlayers = Number(r.max_players || (r.is_chat_room ? 50 : 8));
    const roomTypeTag = r.is_chat_room ? `<span class="room-type-tag chat-room-tag">${esc(t('lobby.rooms.chat_tag'))}</span>` : '';
    const statusText = status === 1 ? t('lobby.rooms.status_recruiting') : status === 2 ? t('lobby.rooms.status_playing') : String(r.room_status);
    const statusClass = status === 1 ? 'room-status recruiting' : status === 2 ? 'room-status playing' : 'room-status';
    const villageName = withVillageSuffix(r.room_name || '');
    const villageDescription = r.room_comment || r.village_description || r.description || '-';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.room_id}</td>
      <td><span class="${statusClass}">${statusText}</span></td>
      <td>(${Number(r.player_count || 0)}/${maxPlayers})</td>
      <td>${esc(villageName || '-')} ${roomTypeTag}</td>
      <td>${esc(villageDescription)}</td>
    `;
    tr.classList.add('room-row');
    tr.addEventListener('click', () => goToRoomPage(r.room_id));
    el.roomsTbody.appendChild(tr);
  });
}

export async function refreshRooms({ dispatch, renderRooms }) {
  const data = await dispatch('list_rooms', {});
  renderRooms(data);
}

export function bindLobbyEvents({
  el,
  dispatch,
  state,
  persistSession,
  toast,
  normalizeVillageName,
  countChars,
  countDisplayWidth,
  withVillageSuffix,
  refreshRooms,
  goToRoomPage,
}) {
  if (!el.createRoomForm || el.createRoomForm.dataset.bound === 'true') return;

  const resolveExpansionMode = () => {
    const useBasic = el.expansionBasicCheck?.checked !== false;
    const useExtend = el.expansionExtendCheck?.checked !== false;
    if (useBasic && useExtend) return 'all';
    if (useBasic) return 'no_extend';
    if (useExtend) return 'expansion_only';
    return '';
  };

  const ensureExpansionSelection = (changedCheckbox = null) => {
    const useBasic = el.expansionBasicCheck?.checked !== false;
    const useExtend = el.expansionExtendCheck?.checked !== false;
    if (useBasic || useExtend) return true;
    if (changedCheckbox) changedCheckbox.checked = true;
    toast(t('lobby.create.expansion_mode_required'), 'error');
    return false;
  };

  el.btnRefreshRooms?.addEventListener('click', refreshRooms);

  el.expansionBasicCheck?.addEventListener('change', () => {
    ensureExpansionSelection(el.expansionBasicCheck);
  });
  el.expansionExtendCheck?.addEventListener('change', () => {
    ensureExpansionSelection(el.expansionExtendCheck);
  });

  // 2026-10-13：「開啟 GM 功能」是讓村長本人升級成 GM 的開關，所以村長 Trip
  // 還空著的時候不能勾；村長 Trip 被清空時，這個開關要自動取消勾選並停用。
  const syncGmEnabledAvailability = () => {
    if (!el.gmEnabledCheck) return;
    const hasManagerTrip = Boolean((el.managerTrip?.value || '').trim());
    el.gmEnabledCheck.disabled = !hasManagerTrip;
    if (!hasManagerTrip) el.gmEnabledCheck.checked = false;
  };
  el.managerTrip?.addEventListener('input', syncGmEnabledAvailability);
  syncGmEnabledAvailability();

  // 2026-10-15：聊天村人數上限固定 50 人，不受「房間人數上限」這個 4~8 的選單
  // 影響，勾選聊天村的時候把這個選單停用，避免讓人誤以為選了就有效。
  const syncMaxPlayersAvailability = () => {
    if (!el.roomMaxPlayersSelect) return;
    const isChatRoom = Boolean(el.chatVillageCheck?.checked);
    el.roomMaxPlayersSelect.disabled = isChatRoom;
  };
  el.chatVillageCheck?.addEventListener('change', syncMaxPlayersAvailability);
  syncMaxPlayersAvailability();

  el.createRoomForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const baseName = normalizeVillageName(el.roomName.value);
    const room_comment = el.roomDescription?.value.trim() || '';
    const require_trip = el.requireTripCheck?.checked ?? false;
    const hide_trip = el.hideTripCheck?.checked ?? true;
    const trip_min_games = Math.max(0, Number.parseInt(el.tripMinGames?.value || '0', 10) || 0);
    const manager_trip = (el.managerTrip?.value || '').trim();
    const manager_trip_encrypted = el.managerTripEncryptedCheck?.checked ?? true;
    // 2026-10-13：GM 不再是另外指定的一個人，改成讓村長本人升級成 GM 的開關。
    const gm_enabled = Boolean(manager_trip) && (el.gmEnabledCheck?.checked ?? false);
    const is_chat_room = el.chatVillageCheck?.checked ?? false;
    const expansion_mode = resolveExpansionMode();
    const enable_initial_green_card = el.enableInitialGreenCardCheck?.checked ?? false;
    const enable_neutral_chaos_mode = el.enableNeutralChaosModeCheck?.checked ?? false;
    const enable_badge_unique_character_select = el.badgeUniqueCheck?.checked ?? false;
    const enable_random_initial_position = el.enableRandomInitialPositionCheck?.checked ?? false;
    const turn_timeout_minutes = Math.max(1, Number.parseInt(el.turnTimeoutSelect?.value || '3', 10) || 3);
    const max_players = Math.min(8, Math.max(4, Number.parseInt(el.roomMaxPlayersSelect?.value || '8', 10) || 8));
    if (!baseName) {
      toast(t('toast.room_name_required'), 'error');
      return;
    }
    const lang = resolveLang();
    const roomNameMaxChars = lang === 'en' ? 40 : 20;
    const roomNameMaxDisplayWidth = 40;
    const roomDescMaxChars = lang === 'en' ? 100 : 50;
    const roomDescMaxDisplayWidth = 100;
    if (countDisplayWidth(baseName) > roomNameMaxDisplayWidth) {
      toast(t('toast.room_name_too_long', { max: roomNameMaxChars }), 'error');
      return;
    }
    if (room_comment && countDisplayWidth(room_comment) > roomDescMaxDisplayWidth) {
      toast(t('toast.room_desc_too_long'), 'error');
      return;
    }
    if (!expansion_mode) {
      toast(t('lobby.create.expansion_mode_required'), 'error');
      return;
    }

    const room_name = withVillageSuffix(baseName);
    const data = await dispatch('create_room', {
      room_name,
      room_comment,
      require_trip,
      hide_trip,
      trip_min_games,
      manager_trip,
      manager_trip_encrypted,
      gm_enabled,
      is_chat_room,
      expansion_mode,
      enable_initial_green_card,
      enable_neutral_chaos_mode,
      enable_badge_unique_character_select,
      enable_random_initial_position,
      turn_timeout_minutes,
      max_players,
    });
    state.roomId = data.room_id;
    persistSession(state);
    toast(t('toast.created_room', { id: data.room_id }));
    if (el.roomName) el.roomName.value = '';
    if (el.roomDescription) el.roomDescription.value = '';
    if (el.tripMinGames) el.tripMinGames.value = '0';
    if (el.managerTrip) el.managerTrip.value = '';
    if (el.managerTripEncryptedCheck) el.managerTripEncryptedCheck.checked = false;
    if (el.gmEnabledCheck) {
      el.gmEnabledCheck.checked = false;
      el.gmEnabledCheck.disabled = true;
    }
    if (el.requireTripCheck) el.requireTripCheck.checked = false;
    if (el.hideTripCheck) el.hideTripCheck.checked = true;
    if (el.chatVillageCheck) el.chatVillageCheck.checked = false;
    if (el.expansionBasicCheck) el.expansionBasicCheck.checked = true;
    if (el.expansionExtendCheck) el.expansionExtendCheck.checked = true;
    if (el.turnTimeoutSelect) el.turnTimeoutSelect.value = '3';
    if (el.enableInitialGreenCardCheck) el.enableInitialGreenCardCheck.checked = false;
    if (el.enableNeutralChaosModeCheck) el.enableNeutralChaosModeCheck.checked = false;
    if (el.badgeUniqueCheck) el.badgeUniqueCheck.checked = false;
    if (el.enableRandomInitialPositionCheck) el.enableRandomInitialPositionCheck.checked = false;
    if (el.roomMaxPlayersSelect) el.roomMaxPlayersSelect.value = '8';
    syncMaxPlayersAvailability();
    await refreshRooms();
    goToRoomPage(data.room_id);
  });

  el.createRoomForm.dataset.bound = 'true';
}

export async function initLobbyPage({ loadAnnouncement, refreshRooms }) {
  await loadAnnouncement();
  await refreshRooms();
}
