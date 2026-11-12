// 2026-10-19 新增（搬到共用檔案：2026-11-11）：瀏覽器的 CSS animation 是從「加上去的
// 那一刻」開始算相位，不同元素第一次被點亮的時間點本來就不會剛好對齊，之後就會一直
// 維持那個隨機的相位差，看起來像是各自閃各的。這裡統一在每次把閃爍 class／屬性「打開」
// 的當下，額外算一個負的 animation-delay，用目前的實際時間（Date.now()）對週期取餘數
// 反過來當起始相位，讓所有共用同一個週期的閃爍動畫都對齊到同一個虛擬時鐘上，不管各自
// 實際是哪一刻開始播放，看起來都會同步。
//
// 原本只有骰子／中央下一步按鈕／牌庫抽牌提示這三種（見 stageNextStepState.js）用得到。
// 2026-11-11 發現村民列表卡片、手機版快速選取玩家列的攻擊/場地目標閃爍提示
// （.player-card／.mobile-quick-icon 的 attack-target-prompt 等 class）、以及手機版
// 浮動收合面板切換鈕（.sh-ffs-toggle-btn）完全沒有套用這套機制——而且前兩者的容器是
// 整個 innerHTML 重新渲染，每次房間狀態一更新（SSE 推播）就會建出全新的 DOM 節點，
// 動畫天生就會從頭開始算相位，沒對齊的話看起來會跟骰子/下一步按鈕的閃爍嚴重不同步，
// 這正是 Mike 回報「閃爍怎麼還是不同步」的原因。搬出來共用，讓所有地方都能用同一份
// 邏輯、同一個週期常數對齊到同一個虛擬時鐘上。
export const PULSE_SYNC_PERIOD_MS = 650; // 必須跟 theme.css 裡這些動畫共用的 0.65s 週期一致

// 給「同一個 DOM 節點會持續存在、只在 class 真正從關閉變成打開那一刻才需要對齊一次」
// 的情境用（例如骰子、下一步按鈕、floatingPlayersToggleBtn 這類浮動切換鈕）：已經設定
// 過、動畫正在播放中的話不會再重新覆蓋，避免播放到一半被硬拉去新的相位點造成卡頓感。
export function syncPulseAnimationDelay(el) {
  if (!el || typeof el.style === 'undefined') return;
  if (el.style.animationDelay) return; // 已經對齊過、動畫正在播放中，不要再重新設定
  const offsetMs = Date.now() % PULSE_SYNC_PERIOD_MS;
  el.style.animationDelay = `-${offsetMs}ms`;
}

// class／屬性關閉時呼叫，清空 animation-delay，讓下次重新打開時能重新對齊一次新的起始相位。
export function clearPulseAnimationDelay(el) {
  if (!el || typeof el.style === 'undefined') return;
  el.style.animationDelay = '';
}

// 給「每次都是全新 DOM 節點」的情境用（村民列表卡片、手機版快速選取玩家列整個
// innerHTML 重新渲染）：每個節點只會存在這一次，不會有「打斷正在播放的動畫」的問題，
// 所以不檢查「已經設定過」，每次都強制重新對齊到目前的虛擬時鐘。
export function forceSyncPulseAnimationDelay(el) {
  if (!el || typeof el.style === 'undefined') return;
  const offsetMs = Date.now() % PULSE_SYNC_PERIOD_MS;
  el.style.animationDelay = `-${offsetMs}ms`;
}

// 批次處理：一個容器裡所有帶閃爍提示 class 的玩家卡片／快速選取 icon，全部對齊到
// 同一個虛擬時鐘（.prompt-target-static 是純靜態樣式、沒有 animation，不需要處理）。
// 2026-11-11 曾經補上個人能力「持續閃爍」提示（ability-ready-prompt），但 2026-11-12
// 因為玩家反映太刺眼、而且角色死亡後會卡成永遠持續閃，已經把這個 class 整個移除
// （改用跟 ability-turn-start-flash 一樣的一次性閃幾下，見 ui.js／theme.css 對應
// 修正），所以這裡也拿掉，不用再對齊虛擬時鐘。
// ability-turn-start-flash（能力剛變成可發動那一刻的一次性閃幾下提示）故意不放
// 進這裡：那是有限次數的一次性動畫，不是 infinite 循環，套用負的 animation-delay
// 只會讓它一開始就跳過前面幾格、縮短實際播放內容，跟「對齊虛擬時鐘」這個機制的
// 設計前提（animation 是 infinite 循環）不符。
const PULSE_PROMPT_SELECTOR = '.attack-target-prompt, .area-target-prompt, .gm-edit-target-prompt';

// 2026-11-11 修正（Mike 回報手機版快速頭像整顆方形按鈕一起閃爍不好看）：閃爍效果
// 改成只套在 .mobile-quick-icon 裡面的 .mobile-quick-avatar 圓形頭像上（見 theme.css
// 對應修正），但 animation-delay 要設在「真的有套用 animation 的那個元素」上才有
// 作用——如果還是設在 .mobile-quick-icon 本身（現在已經沒有 animation 了），
// 同步完全沒效果。.player-card 維持不變（動畫還是在卡片本身），所以只有
// .mobile-quick-icon 這一種需要改成對內層的頭像圓圈設定。
export function syncPulsePromptsIn(container) {
  if (!container || typeof container.querySelectorAll !== 'function') return;
  container.querySelectorAll(PULSE_PROMPT_SELECTOR).forEach((el) => {
    const animatedEl = el.classList.contains('mobile-quick-icon')
      ? (el.querySelector('.mobile-quick-avatar') || el)
      : el;
    forceSyncPulseAnimationDelay(animatedEl);
  });
}
