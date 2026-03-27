import { syncAccountForRoom } from './session.js';

export function goToRoomPage({ state, persistSession }, roomId = state.roomId) {
  if (roomId) {
    state.roomId = roomId;
  }
  syncAccountForRoom(state, state.roomId);
  persistSession(state);
  const targetRoomId = state.roomId ? `?roomId=${encodeURIComponent(state.roomId)}` : '';
  window.location.href = `./room.html${targetRoomId}`;
}

export function goToRegisterPage({ state, persistSession }, roomId = state.roomId) {
  if (roomId) {
    state.roomId = roomId;
  }
  syncAccountForRoom(state, state.roomId);
  persistSession(state);
  const targetRoomId = state.roomId ? `?roomId=${encodeURIComponent(state.roomId)}` : '';
  window.location.href = `./resident_register.html${targetRoomId}`;
}

export function goToLobbyPage({ persistSession, state }) {
  persistSession(state);
  window.location.href = './lobby.html';
}
