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
  withVillageSuffix,
  refreshRooms,
  goToRoomPage,
}) {
  if (!el.createRoomForm || el.createRoomForm.dataset.bound === 'true') return;

  el.btnRefreshRooms?.addEventListener('click', refreshRooms);

  el.createRoomForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const baseName = normalizeVillageName(el.roomName.value);
    const room_comment = el.roomDescription?.value.trim() || '';
    const require_trip = el.requireTripCheck?.checked ?? false;
    const hide_trip = el.hideTripCheck?.checked ?? true;
    const trip_min_games = Math.max(0, Number.parseInt(el.tripMinGames?.value || '0', 10) || 0);
    const manager_trip = (el.managerTrip?.value || '').trim();
    const manager_trip_encrypted = el.managerTripEncryptedCheck?.checked ?? true;
    const is_chat_room = el.chatVillageCheck?.checked ?? false;
    const expansion_mode = String(el.expansionModeSelect?.value || 'all');
    const enable_initial_green_card = el.enableInitialGreenCardCheck?.checked ?? false;
    const turn_timeout_minutes = Math.max(1, Number.parseInt(el.turnTimeoutSelect?.value || '3', 10) || 3);
    if (!baseName) {
      toast(t('toast.room_name_required'), 'error');
      return;
    }
    const lang = resolveLang();
    const roomNameMaxChars = lang === 'en' ? 40 : 20;
    const roomDescMaxChars = lang === 'en' ? 100 : 50;
    if (countChars(baseName) > roomNameMaxChars) {
      toast(t('toast.room_name_too_long', { max: roomNameMaxChars }), 'error');
      return;
    }
    if (room_comment && countChars(room_comment) > roomDescMaxChars) {
      toast(t('toast.room_desc_too_long'), 'error');
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
      is_chat_room,
      expansion_mode,
      enable_initial_green_card,
      turn_timeout_minutes,
    });
    state.roomId = data.room_id;
    persistSession(state);
    toast(t('toast.created_room', { id: data.room_id }));
    if (el.roomName) el.roomName.value = '';
    if (el.roomDescription) el.roomDescription.value = '';
    if (el.tripMinGames) el.tripMinGames.value = '0';
    if (el.managerTrip) el.managerTrip.value = '';
    if (el.managerTripEncryptedCheck) el.managerTripEncryptedCheck.checked = false;
    if (el.requireTripCheck) el.requireTripCheck.checked = false;
    if (el.hideTripCheck) el.hideTripCheck.checked = true;
    if (el.chatVillageCheck) el.chatVillageCheck.checked = false;
    if (el.expansionModeSelect) el.expansionModeSelect.value = 'all';
    if (el.turnTimeoutSelect) el.turnTimeoutSelect.value = '3';
    if (el.enableInitialGreenCardCheck) el.enableInitialGreenCardCheck.checked = false;
    await refreshRooms();
    goToRoomPage(data.room_id);
  });

  el.createRoomForm.dataset.bound = 'true';
}

export async function initLobbyPage({ loadAnnouncement, refreshRooms }) {
  await loadAnnouncement();
  await refreshRooms();
}
