export function persistSession(state) {
  sessionStorage.setItem(
    'shadowhunters.session',
    JSON.stringify({
      roomId: state.roomId,
      account: state.account,
      roomAccounts: state.roomAccounts ?? {},
      transportMode: state.transportMode,
      autoRefreshSeconds: state.autoRefreshSeconds,
      skipTargetConfirm: state.skipTargetConfirm,
    })
  );
}

export function restoreSession(state) {
  const params = new URLSearchParams(window.location.search);
  const roomIdParam = Number(params.get('roomId'));

  try {
    const raw = sessionStorage.getItem('shadowhunters.session');
    if (raw) {
      const parsed = JSON.parse(raw);
      state.roomId = parsed.roomId ?? state.roomId;
      state.account = parsed.account ?? state.account;
      const restoredMode = String((parsed.transportMode ?? state.transportMode) || '').trim().toLowerCase();
      state.transportMode = restoredMode === 'demo' ? 'auto' : (restoredMode || state.transportMode);
      state.autoRefreshSeconds = parsed.autoRefreshSeconds ?? state.autoRefreshSeconds;
      state.skipTargetConfirm = parsed.skipTargetConfirm ?? state.skipTargetConfirm;
      // Restore roomAccounts; if absent, migrate legacy account+roomId pair
      if (parsed.roomAccounts && typeof parsed.roomAccounts === 'object') {
        state.roomAccounts = parsed.roomAccounts;
      } else if (parsed.roomId && parsed.account) {
        state.roomAccounts = { [parsed.roomId]: parsed.account };
      }
    }
  } catch {
  }

  if (Number.isFinite(roomIdParam) && roomIdParam > 0) {
    state.roomId = roomIdParam;
  }

  // Resolve account for the current room after roomId is finalised
  syncAccountForRoom(state, state.roomId);
}

/** Set state.account to the room-specific account, or '' if none recorded. */
export function syncAccountForRoom(state, roomId = state.roomId) {
  state.account = (roomId && state.roomAccounts?.[roomId]) || '';
}

/** Record account for a room and update state.account. */
export function setRoomAccount(state, roomId, account) {
  if (!roomId) return;
  if (!state.roomAccounts) state.roomAccounts = {};
  state.roomAccounts[roomId] = account;
  state.account = account;
}

/** Remove the account entry for a room; clears state.account when it is the active room. */
export function clearRoomAccount(state, roomId) {
  if (!roomId || !state.roomAccounts) return;
  delete state.roomAccounts[roomId];
  if (state.roomId === roomId) {
    state.account = '';
  }
}
