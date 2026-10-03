export function bindRoomLifecycle({ clearRoomAutoRefreshTimer, clearRoomEventSource }) {
  window.addEventListener('pagehide', () => {
    clearRoomAutoRefreshTimer();
    if (typeof clearRoomEventSource === 'function') clearRoomEventSource();
  });
}
