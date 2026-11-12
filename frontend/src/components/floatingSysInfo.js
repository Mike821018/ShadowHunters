/**
 * Floating fieldset panels (room / replay-room only)
 *
 * Mobile screens don't have room for the "傷害計量表" (HP/damage meter) and
 * "村民列表" (player list) fieldsets to stay inline, so on narrow viewports
 * this module moves those EXISTING fieldsets (not clones) into their own
 * floating collapsible panels, stacked above the floating chat bubble
 * (bottom-right): from bottom to top it's 聊天室 (chat, handled by
 * floatingChat.js), 血量 (HP), then 玩家 (players).
 *
 * 2026-11-10 修正：血量（HP）面板改成不分螢幕寬度都套用 —— 桌面版也跟手機版一樣收合
 * 成右下角可展開的浮動按鈕，不再固定顯示在頁面上（Mike 要求「桌面版的血量條也改成浮動
 * 按鈕」）。「村民列表」維持原樣，只有手機寬度才收合成浮動面板，桌面／平板版仍然固定
 * 顯示在頁面上。
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
 * On desktop/tablet widths the HP panel is now active too; only the players
 * panel stays mobile-only (desktop/tablet is a no-op for it, page left
 * completely untouched there).
 *
 * Mutual exclusivity: only one floating panel (chat / HP / players) may be
 * open at a time. Each panel registers itself with the shared
 * floatingPanelGroup coordinator and is told to close whenever another
 * panel opens — see floatingPanelGroup.js.
 */

import { registerFloatingPanel, notifyFloatingPanelOpened, notifyFloatingPanelClosed } from './floatingPanelGroup.js';

const MOBILE_QUERY = '(max-width: 640px)';

// 2026-11-12 移除：這裡原本有一組「player-role popover escape hatch」，讓
// .player-role-popover（滑過/focus 展開的角色說明小視窗）在被收進這個會裁切
// 內容的浮動面板時，改用 position: fixed 逃出裁切範圍。角色說明現在已經改成
// 點擊彈出跟裝備卡共用的 #activeCardDialog 獨立浮動視窗（position: fixed，
// 本來就不受任何父層 overflow 影響，見 ui.js／cardInfoDialog.js），.player-role-popover
// 這個元素已經不存在，這組escape hatch 跟著一起移除。

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
    if (!collapsed) {
      notifyFloatingPanelOpened(wrapClass);
    } else {
      // 收合後，之前被這個面板擋住而被往上推開的其他按鈕要歸位。
      notifyFloatingPanelClosed();
    }
  }

  // 額外提供版面座標資訊，讓 floatingPanelGroup 判斷這個面板展開時是否會
  // 擋到其他按鈕，需要的話把被擋住的按鈕往上推開（見該檔案說明）。
  registerFloatingPanel(wrapClass, () => setCollapsed(true), {
    isOpen: () => !collapsed,
    getToggleEl: () => toggleBtn,
    getPanelEl: () => panel,
    applyOffset: (px) => { wrap.style.bottom = `${px}px`; },
    resetOffset: () => { wrap.style.bottom = ''; },
  });

  toggleBtn.addEventListener('click', () => setCollapsed(!collapsed));
  collapseBtn.addEventListener('click', () => setCollapsed(true));

  render();
}

export function initFloatingSysInfo({ state }) {
  if (state?.page !== 'room' && state?.page !== 'replay-room') return;

  // 2026-11-10 修正：血量（傷害計量表）改成不分螢幕寬度，桌面版也和手機版一樣改成可收合的浮動按鈕（不再固定顯示在頁面上），Mike 要求「桌面版的血量條也改成浮動按鈕」。「村民列表」維持原樣只在手機寬度才收到浮動面板，桌面版仍然固定顯示在頁面上，沒有被要求一起改。
  createFloatingFieldsetPanel({
    fieldsetSelector: '.room-damage-meter-fieldset',
    wrapClass: 'sh-floating-hp',
    lsKey: 'sh.floatingHp.collapsed',
    icon: '🩸',
    label: '傷害計量表',
  });

  if (!window.matchMedia || !window.matchMedia(MOBILE_QUERY).matches) return;

  createFloatingFieldsetPanel({
    fieldsetSelector: '.room-layout-player-fieldset',
    wrapClass: 'sh-floating-players',
    lsKey: 'sh.floatingPlayers.collapsed',
    icon: '👥',
    label: '村民列表',
  });
}
