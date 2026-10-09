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
 *
 * Layout coordination: an expanded panel grows UPWARD from its own toggle
 * button (see theme.css), which can visually cover whichever OTHER toggle
 * button(s) happen to sit higher up in that same stack (e.g. opening 聊天室
 * covers 血量/玩家; opening 血量 can cover 玩家). Panel height isn't fixed
 * for every panel (血量/玩家 size to their own content), so instead of
 * hardcoding per-breakpoint offsets in CSS, each panel also registers a few
 * optional layout hooks (isOpen/getToggleEl/getPanelEl/applyOffset/
 * resetOffset). After any panel opens or closes, syncFloatingPanelLayout()
 * measures the actual open panel's bounding box and nudges (via inline
 * `bottom`) any other toggle button whose default position would otherwise
 * sit behind it, so every toggle button stays visible and tappable no
 * matter which single panel is currently open.
 */

const LAYOUT_GAP = 8;

const panels = new Map();

export function registerFloatingPanel(id, closePanel, hooks = {}) {
  panels.set(id, { closePanel, ...hooks });
}

export function notifyFloatingPanelOpened(id) {
  panels.forEach((entry, panelId) => {
    if (panelId !== id) entry.closePanel();
  });
  // Run after this frame's hide/show DOM updates have been applied so the
  // measurements below reflect the real, just-updated layout.
  requestAnimationFrame(syncFloatingPanelLayout);
}

export function notifyFloatingPanelClosed() {
  requestAnimationFrame(syncFloatingPanelLayout);
}

function syncFloatingPanelLayout() {
  // Reset everyone to their natural CSS position first so the measurement
  // below reflects the real default layout, not a shift applied earlier.
  panels.forEach((entry) => entry.resetOffset?.());

  let openEntry = null;
  panels.forEach((entry) => {
    if (!openEntry && entry.isOpen?.()) openEntry = entry;
  });
  if (!openEntry) return;

  const openPanelEl = openEntry.getPanelEl?.();
  if (!openPanelEl) return;
  const openRect = openPanelEl.getBoundingClientRect();
  if (!openRect.width && !openRect.height) return;

  const requiredMinBottom = window.innerHeight - openRect.top + LAYOUT_GAP;

  // Find every OTHER toggle button the open panel's box currently overlaps.
  const covered = [];
  panels.forEach((entry) => {
    if (entry === openEntry) return;
    const toggleEl = entry.getToggleEl?.();
    if (!toggleEl) return;
    const toggleRect = toggleEl.getBoundingClientRect();
    const isCovered = toggleRect.bottom > openRect.top && toggleRect.top < openRect.bottom;
    if (!isCovered) return;
    covered.push({ entry, defaultBottom: window.innerHeight - toggleRect.bottom });
  });
  if (!covered.length) return;

  // Shift every covered button up by the SAME amount so their existing
  // relative stacking order/spacing is preserved — just enough to clear
  // whichever one of them sits lowest (i.e. closest to the open panel).
  // (Pinning every covered button to the same absolute offset instead
  // would stack them on top of EACH OTHER, trading one overlap bug for
  // another.)
  const lowestDefaultBottom = Math.min(...covered.map((c) => c.defaultBottom));
  const delta = Math.max(0, requiredMinBottom - lowestDefaultBottom);
  if (delta <= 0) return;

  covered.forEach(({ entry, defaultBottom }) => {
    entry.applyOffset?.(Math.round(defaultBottom + delta));
  });
}
