export function bindRoomLifecycle({ clearRoomAutoRefreshTimer }) {
  window.addEventListener('pagehide', () => {
    clearRoomAutoRefreshTimer();
  });
}
