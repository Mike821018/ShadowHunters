/**
 * Floating fieldset panels (room / replay-room only, mobile only)
 *
 * Mobile screens don't have room for the "傷害計量表" (HP/damage meter) and
 * "村民列表" (player list) fieldsets to stay inline, so on narrow viewports
 * this module moves those EXISTING fieldsets (not clones) into their own
 * floating collapsible panels, stacked above the floating chat bubble
 * (bottom-right): from bottom to top it's 聊天室 (chat, handled by
 * floatingChat.js), 血量 (HP), then 玩家 (players).
 *
 * "系統訊息" (system messages) is NOT handled here at all — it is hidden
 * entirely on mobile via CSS (`.room-layout-system-fieldset { display: none; }`),
 * with no floating-panel access, per explicit request.
 *
 * Purely presentational: this module does not fetch any data itself.
 * room.js / replayRoom.js keep populating #damageMeter and #roomCards by
 * id exactly as before; moving their containing <fieldset> elsewhere in the
 * DOM does not affect those id lookups or event listeners.
 *
 * On desktop/tablet widths this module is a no-op and the page is left
 * completely untouched.
 *
 * Mutual exclusivity: only one floating panel (chat / HP / players) may be
 * open at a time on mobile. Each panel registers itself with the shared
 * floatingPanelGroup coordinator and is told to close whenever another
 * panel opens — see floatingPanelGroup.js.
 */

import { registerFloatingPanel, notifyFloatingPanelOpened } from './floatingPanelGroup.js';

const MOBILE_QUERY = '(max-width: 640px)';

// ─── player-role popover escape hatch ───────────────────────────────────────────────
// The "村民列表" fieldset gets moved into a floating panel body which must
// scroll (`.sh-ffs-body { overflow-y: auto }`) inside a clipped panel shell
// (`.sh-ffs-panel { overflow: hidden }`). The existing `.player-role-popover`
// (shown on focus/hover of a `.player-role-trigger` button) is positioned
// `absolute` relative to the player card, so once it's nested inside that
// scrolling/clipped panel it can get cut off instead of showing its full
// description text. Pinning it to `position: fixed` with a viewport-relative
// position (computed on focus) lets it escape that clipping entirely while
// keeping the exact same visual spot, so the full text is always visible.
function positionRolePopover(trigger) {
  const info = trigger.closest('.player-role-info');
  const popover = info ? info.querySelector('.player-role-popover') : null;
  if (!popover) return;

  const triggerRect = trigger.getBoundingClientRect();
  const popRect = popover.getBoundingClientRect();
  const margin = 8;

  const maxLeft = window.innerWidth - popRect.width - margin;
  const left = Math.max(margin, Math.min(triggerRect.left, maxLeft));

  let top = triggerRect.bottom + 6;
  const maxTop = window.innerHeight - popRect.height - margin;
  if (top > maxTop) {
    // Not enough room below — flip to show above the trigger instead.
    top = Math.max(margin, triggerRect.top - popRect.height - 6);
  }

  popover.style.position = 'fixed';
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  popover.style.zIndex = '210';
}

function resetRolePopover(trigger) {
  const info = trigger.closest('.player-role-info');
  const popover = info ? info.querySelector('.player-role-popover') : null;
  if (!popover) return;
  popover.style.position = '';
  popover.style.left = '';
  popover.style.top = '';
  popover.style.zIndex = '';
}

function createFloatingFieldsetPanel({ fieldsetSelector, wrapClass, lsKey, icon, label }) {
  const fieldset = document.querySelector(fieldsetSelector);
  if (!fieldset) return;

  const wrap = document.createElement('div');
  wrap.className = `sh-floating-fieldset ${wrapClass}`;
  wrap.innerHTML = `
    <div class="sh-ffs-panel" hidden>
      <div class="sh-ffs-header">
        <span class="sh-ffs-title">${label}</span>
        <button class="sh-ffs-collapse-btn" type="button" aria-label="收合">−</button>
      </div>
      <div class="sh-ffs-body"></div>
    </div>
    <button class="sh-ffs-toggle-btn" type="button" aria-expanded="false" aria-label="${label}">
      <span class="sh-ffs-toggle-icon" aria-hidden="true">${icon}</span>
    </button>
  `;
  document.body.appendChild(wrap);

  const panel = wrap.querySelector('.sh-ffs-panel');
  const body = wrap.querySelector('.sh-ffs-body');
  const toggleBtn = wrap.querySelector('.sh-ffs-toggle-btn');
  const collapseBtn = wrap.querySelector('.sh-ffs-collapse-btn');

  // Move (not clone) the existing fieldset into the floating panel body.
  body.appendChild(fieldset);

  // Keep any `.player-role-popover` inside this panel fully visible instead
  // of being clipped by the panel's own scroll/overflow boundaries.
  body.addEventListener('focusin', (event) => {
    const trigger = event.target.closest ? event.target.closest('.player-role-trigger') : null;
    if (trigger) positionRolePopover(trigger);
  });
  body.addEventListener('focusout', (event) => {
    const trigger = event.target.closest ? event.target.closest('.player-role-trigger') : null;
    if (trigger) resetRolePopover(trigger);
  });

  let collapsed = localStorage.getItem(lsKey) !== 'false'; // default: collapsed

  function render() {
    panel.hidden = collapsed;
    toggleBtn.setAttribute('aria-expanded', String(!collapsed));
    toggleBtn.classList.toggle('is-open', !collapsed);
  }

  function setCollapsed(next) {
    collapsed = next;
    try {
      localStorage.setItem(lsKey, String(collapsed));
    } catch {
      // ignore storage errors (private browsing, quota, etc.)
    }
    render();
    if (!collapsed) notifyFloatingPanelOpened(wrapClass);
  }

  registerFloatingPanel(wrapClass, () => setCollapsed(true));

  toggleBtn.addEventListener('click', () => setCollapsed(!collapsed));
  collapseBtn.addEventListener('click', () => setCollapsed(true));

  render();
}

export function initFloatingSysInfo({ state }) {
  if (state?.page !== 'room' && state?.page !== 'replay-room') return;
  if (!window.matchMedia || !window.matchMedia(MOBILE_QUERY).matches) return;

  createFloatingFieldsetPanel({
    fieldsetSelector: '.room-damage-meter-fieldset',
    wrapClass: 'sh-floating-hp',
    lsKey: 'sh.floatingHp.collapsed',
    icon: '🩸',
    label: '傷害計量表',
  });

  createFloatingFieldsetPanel({
    fieldsetSelector: '.room-layout-player-fieldset',
    wrapClass: 'sh-floating-players',
    lsKey: 'sh.floatingPlayers.collapsed',
    icon: '👥',
    label: '村民列表',
  });
}
