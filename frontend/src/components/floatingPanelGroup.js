/**
 * Floating Panel Group Coordinator (mobile room/replay-room pages)
 *
 * On mobile only one of the three floating panels (聊天室 chat / 血量 HP /
 * 玩家 players) may be open at a time — opening one must automatically
 * close whichever other one is currently open.
 *
 * This is a tiny pub/sub registry shared by floatingChat.js and
 * floatingSysInfo.js: each panel registers itself once with a unique id and
 * a "close me" callback, then calls notifyFloatingPanelOpened(id) whenever
 * it expands. Every OTHER registered panel is told to close; the panel that
 * just opened is left alone.
 */

const panels = new Map();

export function registerFloatingPanel(id, closePanel) {
  panels.set(id, closePanel);
}

export function notifyFloatingPanelOpened(id) {
  panels.forEach((closePanel, panelId) => {
    if (panelId !== id) closePanel();
  });
}
