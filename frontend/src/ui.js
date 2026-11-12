import { t } from './i18n.js';
import { PLAYER_COLORS, PLAYER_COLOR_HEX, resolvePlayerColorHex } from './constants.js';
import { getCharacterLocalizedName, getCharacterTooltipInfo, getCurrentUiLang } from './characterInfo.js';
import { getAvatarColorById, getAvatarImageSrcById } from './avatarConfig.js';
import { apiFetch } from './utils.js';
// 2026-11-11 新增：村民列表卡片／手機版快速選取玩家列的攻擊/場地目標閃爍提示，要跟
// 骰子／下一步按鈕用同一個虛擬時鐘對齊，不然每次整個 innerHTML 重新渲染都會讓動畫
// 從頭開始算相位，看起來像各閃各的（Mike 回報的「閃爍不同步」）。見 pulseSync.js。
import { syncPulsePromptsIn } from './pulseSync.js';

function colorHex(color) {
  // 2026-10-22 修正：聊天村玩家顏色改存完整色碼（例如 '#3fae7d'），不再限制在
  // PLAYER_COLOR_HEX 這 9 色代號裡，這裡改呼叫共用的 resolvePlayerColorHex()
  // 判斷是不是已經是完整色碼。
  return resolvePlayerColorHex(color, '#cccccc');
}

// 2026-10-29 新增：Mike 要求未揭露角色的卡片前面補一個可以自己點擊切換的「陣營
// 猜測」徽章，類似踩地雷標旗子——純粹是自己看的個人標記，不會送到後端、也不會讓
// 其他玩家看到，所以整套狀態都只存在這台裝置的 localStorage，不是房間資料的一部分。
// 切換順序：灰？(未知) → 藍？(可能是獵人) → 紅？(可能是暗影) → 黃？(可能是中立) →
// 藍！(可能不是獵人) → 紅！(可能不是暗影) → 黃！(可能不是中立) → 回到灰？。
// 2026-11-11 修正：匯出這份狀態表跟 getCampGuessIndex()，讓 chatFormatter.js
// 可以直接重用同一份猜測資料，把聊天室訊息裡的「(???)」跟這裡的猜測徽章連動
// （Mike 要求：猜測「可能是某陣營」時「(???)」要跟著變色；猜測「可能不是某
// 陣營」時改顯示「(---)」），不用在兩個地方各自維護一份重複的狀態定義。
export const CAMP_GUESS_STATES = [
  { symbol: '?', cls: '', labelKey: 'ui.camp_guess_unknown' },
  { symbol: '?', cls: 'hunter', labelKey: 'ui.camp_guess_maybe_hunter' },
  { symbol: '?', cls: 'shadow', labelKey: 'ui.camp_guess_maybe_shadow' },
  { symbol: '?', cls: 'civilian', labelKey: 'ui.camp_guess_maybe_civilian' },
  // 2026-10-29 修正：後三個『排除』狀態 Mike 確認改用打叉（✕）表示，跟對應陣營
  // 一樣的顏色＋虛線空心樣式（見 theme.css 的 .player-camp-guess-badge.is-exclude）
  // 一起用，跟『可能是』的實心問號樣式區分。
  { symbol: '✕', cls: 'hunter is-exclude', labelKey: 'ui.camp_guess_not_hunter' },
  { symbol: '✕', cls: 'shadow is-exclude', labelKey: 'ui.camp_guess_not_shadow' },
  { symbol: '✕', cls: 'civilian is-exclude', labelKey: 'ui.camp_guess_not_civilian' },
];

const CAMP_GUESS_LS_PREFIX = 'sh.campGuess.';

// 2026-11-01 修正：Mike 回報測試時「改了全部的人都看得到」——這格標記本來就是
// 純前端 localStorage 標記，不會送到後端，不同使用者的瀏覽器本來就不會互相看到
// 對方存的東西；問題出在這裡的儲存 key 原本只用房間 id（sh.campGuess.<roomId>），
// 完全沒有區分「是哪個帳號在看」，同一個瀏覽器裡只要用不同帳號登入同一個房間
// （例如自己開多個分頁測試不同玩家），就會共用同一份 localStorage、讀到同一組
// 猜測紀錄，看起來就像是「大家共用同一個標記」。這裡幫 key 加上目前登入帳號
// （sh.campGuess.<roomId>.<viewerAccount>），讓每個帳號各自存在獨立的
// localStorage key 底下，才是真正的「只有自己看得到的個人隱藏資訊」。
function readCampGuessMap(roomId, viewerAccount) {
  try {
    const raw = window.localStorage.getItem(`${CAMP_GUESS_LS_PREFIX}${roomId}.${viewerAccount}`);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeCampGuessMap(roomId, viewerAccount, map) {
  try {
    window.localStorage.setItem(`${CAMP_GUESS_LS_PREFIX}${roomId}.${viewerAccount}`, JSON.stringify(map));
  } catch {
    // 純個人標記，無痕模式等情境下 localStorage 寫入失敗不影響遊戲功能，忽略即可。
  }
}

export function getCampGuessIndex(roomId, viewerAccount, targetAccount) {
  if (roomId == null || !viewerAccount || !targetAccount) return 0;
  const idx = Number(readCampGuessMap(roomId, viewerAccount)[targetAccount]);
  return Number.isInteger(idx) && idx >= 0 && idx < CAMP_GUESS_STATES.length ? idx : 0;
}

function setCampGuessIndex(roomId, viewerAccount, targetAccount, index) {
  if (roomId == null || !viewerAccount || !targetAccount) return;
  const map = readCampGuessMap(roomId, viewerAccount);
  map[targetAccount] = index;
  writeCampGuessMap(roomId, viewerAccount, map);
}

function clearCampGuessMap(roomId, viewerAccount) {
  if (roomId == null || !viewerAccount) return;
  try {
    window.localStorage.removeItem(`${CAMP_GUESS_LS_PREFIX}${roomId}.${viewerAccount}`);
  } catch {
  }
}

const EQUIPMENT_ICON = {
  'Talisman': '🔮',
  'Fortune Brooch': '💠',
  'Mystic Compass': '🧭',
  'Holy Robe': '🧥',
  'Silver Rosary': '📿',
  'Spear of Longinus': '🗡️',
  'Chainsaw': '⚙️',
  'Butcher Knife': '🔪',
  'Rusted Broad Axe': '🪓',
  'Masamune': '⚔️',
  'Machine Gun': '🔫',
  'Handgun': '🎯',
};

const AREA_LOCALIZED_NAMES = {
  "Hermit's Cabin": { zh: '隱士小屋', en: "Hermit's Cabin", jp: '隠者の庵' },
  'Underworld Gate': { zh: '時空之門', en: 'Underworld Gate', jp: '冥界の門' },
  Church: { zh: '教堂', en: 'Church', jp: '教会' },
  Cemetery: { zh: '墓園', en: 'Cemetery', jp: '墓地' },
  'Weird Woods': { zh: '希望與絕望的森林', en: 'Weird Woods', jp: '希望と絶望の森' },
  'Erstwhile Altar': { zh: '古代祭壇', en: 'Erstwhile Altar', jp: '古の祭壇' },
};

const AREA_NAME_CLASS = {
  "Hermit's Cabin": 'area-name-hermit',
  'Underworld Gate': 'area-name-gate',
  Church: 'area-name-church',
  Cemetery: 'area-name-cemetery',
  'Weird Woods': 'area-name-woods',
  'Erstwhile Altar': 'area-name-altar',
};

function getLocalizedAreaName(areaName, lang) {
  const rawName = String(areaName || '').trim();
  if (!rawName) return '-';
  const localized = AREA_LOCALIZED_NAMES[rawName];
  return localized?.[lang] || localized?.zh || rawName;
}

function getAreaNameClass(areaName) {
  return AREA_NAME_CLASS[String(areaName || '').trim()] || '';
}

// 2026-10-19 修正：Mike 回報走到森林／古代祭壇時，原本該出現的場地效果說明
// toast（area_action_weird_woods／area_action_altar）實際上看不到。追下去發現
// 原因不是這則訊息沒有觸發，而是觸發的時機點——玩家擲骰移動進場地時，
// room.js 裡的動作處理流程會先呼叫 renderState(data)（這一步內部的 diff 邏輯
// 偵測到場地提示剛好從沒有變成有，跳出這則場地說明 toast），緊接著下一行
// 又呼叫 toast(t('toast.next_step_ok'))（這個模式在 room.js 裡到處都是：幾乎
// 每個玩家操作完成後都會接著跳一個「動作成功」的通用 toast）。原本的
// createToast() 沒有佇列，每次呼叫都是直接整個蓋掉 el.toast 的內容跟計時器，
// 所以場地說明 toast 跳出來不到 1 毫秒就被緊接著的「next_step 成功」蓋掉，
// 玩家完全沒有機會看到。
// 改成簡單的序列佇列：同一時間只顯示一則，顯示滿 2200ms 後，若佇列裡還有
// 排隊中的訊息，稍微留一點間隔（150ms，讓畫面有切換感，不是無縫接著跳下一則）
// 再顯示下一則，不會互相蓋掉。佇列長度上限 5，避免極端情況（例如短時間內
// 連續觸發大量 toast）無限堆積、越排越久才顯示到最新的訊息——超過上限時
// 直接捨棄最舊的排隊訊息，保留最新的幾則。
const TOAST_SHOW_MS = 2200;
const TOAST_GAP_MS = 150;
const TOAST_QUEUE_LIMIT = 5;

export function createToast(el) {
  const queue = [];
  let showing = false;

  const showNext = () => {
    if (!el.toast) {
      showing = false;
      return;
    }
    const next = queue.shift();
    if (!next) {
      showing = false;
      return;
    }
    showing = true;
    el.toast.textContent = next.message;
    el.toast.className = `toast show ${next.type}`;
    setTimeout(() => {
      if (el.toast) el.toast.className = 'toast';
      setTimeout(showNext, TOAST_GAP_MS);
    }, TOAST_SHOW_MS);
  };

  return function toast(message, type = 'success') {
    if (!el.toast) return;
    queue.push({ message, type });
    while (queue.length > TOAST_QUEUE_LIMIT) queue.shift();
    if (!showing) showNext();
  };
}

export function createStatusHelpers({ state, el }) {
  const setStatus = (text) => {
    if (el.statusText) el.statusText.textContent = text;
  };

  const setTransportMode = (mode) => {
    state.transportMode = mode;
    if (el.transportMode) {
      el.transportMode.textContent = mode.toUpperCase();
      el.transportMode.dataset.mode = mode;
    }
  };

  const pushLog = (event, detail) => {
    if (!el.eventLog) return;
    state.eventSeq += 1;
    const li = document.createElement('li');
    li.textContent = `#${state.eventSeq} [${new Date().toLocaleTimeString()}] ${event} - ${detail}`;
    el.eventLog.prepend(li);
    while (el.eventLog.children.length > 30) el.eventLog.removeChild(el.eventLog.lastChild);
  };

  return { setStatus, setTransportMode, pushLog };
}

// 2026-11-11 新增、2026-11-12 擴大適用範圍：個人能力可以發動時的閃爍提示，原本只有
// 「不限特定階段、整個自己回合都能發動」（ability_timing=8，例如 David）用這種一次性
// 閃法，其他 timing（1~7，特定階段才能發動）原本是持續閃一整個階段。後來玩家反映
// 持續閃太刺眼，而且角色死亡後如果該階段能力一直沒被標記成已使用，就會卡成永遠持續
// 閃、玩家自己也關不掉，所以把全部 timing（1~8）統一改成這裡的做法：只在「剛變成
// 可以發動」那一刻閃一下，之後安靜下來，提醒效果還在、但不會一直吵，也不會因為某個
// 狀態卡住就永遠閃下去。
// 這裡用一個模組層級的 Map 記住每個帳號「上一次渲染時是不是 ready」，才能抓到 false → true
// 那個上升緣；渲染用的卡片 DOM 每次都整個重建（innerHTML 直接整段換掉），沒辦法用
// dataset 存在卡片元素本身上。另外閃爍視窗用時間戳記（flashUntil）判斷，不是單純
// 「這次渲染要不要加 class」，這樣就算上升緣發生後緊接著又有別的 SSE 推播觸發重新
// 渲染（很常見），閃爍也不會被中途打斷消失。
// 2026-11-11 補充：村民列表卡片（renderPlayerCards）跟手機版快速頭像列
// （renderMobilePlayerQuickBar）是兩個各自獨立呼叫、各自整個 innerHTML 重建的
// 渲染流程，如果共用同一份 Map，兩邊會搶同一個上升緣——先跑的那邊把 wasReady 更新
// 成 true 之後，後跑的那邊讀到的 prev.wasReady 就已經是 true，變成偵測不到上升緣、
// 只有其中一邊會閃。所以兩邊分開各自一份 Map，各自獨立偵測同一個遊戲狀態的變化，
// 兩邊才會同時閃。
const abilityTurnStartFlashStateRoster = new Map();
const abilityTurnStartFlashStateMobile = new Map();
const ABILITY_TURN_START_FLASH_MS = 1500;

function computeAbilityTurnStartFlash(stateMap, account, isReadyNow) {
  const key = String(account || '');
  if (!key) return false;
  const prev = stateMap.get(key) || { wasReady: false, until: 0 };
  let until = prev.until;
  if (isReadyNow && !prev.wasReady) {
    until = Date.now() + ABILITY_TURN_START_FLASH_MS;
  }
  stateMap.set(key, { wasReady: isReadyNow, until });
  return Date.now() < until;
}

export function renderPlayerCards(container, data, { esc, getInitial, statusText, state, onColorChange, onPlayerCardClick, onEquipmentChipClick, onShieldChipClick, onRoleInfoClick, onCampGuessChange, view = 'flow', targetAccounts = [], targetPromptClass = 'attack-target-prompt' } = {}) {
  if (!container) return;
  // 2026-10-23 新增：Mike 回報手機上選色塊時「點開面板就自動關掉」「編輯色碼也會跳掉」——
  // 根本原因是別人的任何動作（加入房間、改顏色、狀態切換等）都會經由 SSE/輪詢觸發這支
  // 函式，把所有玩家卡的 innerHTML 整個砍掉重建一次；下面雖然有補救邏輯會記住「選色面板
  // 原本是不是開著」並在重建後重新打開，但面板裡的 DOM 節點（色盤 input、文字輸入框）
  // 整個被換成新的，使用者正在輸入的 focus／打到一半還沒送出的字、手機上彈出的鍵盤，全部
  // 會被這次重建打斷，看起來就像「面板自己關掉」「打字打一半被踢出來」。這裡在真正砍掉
  // 重建 DOM 之前先檢查：目前的 focus 是不是正落在聊天村色碼輸入框（文字框）或原生色盤
  // 上——如果是，代表使用者正在編輯自己的顏色，直接整次跳過重繪，保留現有 DOM 原封不動；
  // 等使用者打完送出（onColorChange 會觸發新的 state、重新呼叫這支函式）或自己點掉面板、
  // 失焦，下一次重繪才會真的套用最新資料。其他玩家卡片短暫沒跟著更新是可接受的代價，
  // 換來的是自己選色不會被打斷。
  const activeEl = document.activeElement;
  if (
    activeEl instanceof HTMLElement
    && container.contains(activeEl)
    && (activeEl.matches('[data-pick-color-hex-text]') || activeEl.matches('[data-pick-color-hex]'))
  ) {
    return;
  }
  const players = data?.players || {};
  const targetAccountSet = new Set(Array.isArray(targetAccounts) ? targetAccounts : []);
  const currentAccount = data?.turn?.current_account || null;
  const roomStatus = Number(data?.room?.room_status || 0);
  // 2026-10-29 新增：陣營猜測標記只對「這一場」遊戲有意義，房間回到招募中（1）
  // 代表上一場已經結束、要開新的一場了，把這個房間存的舊標記清掉，避免新一場的
  // 未揭露角色卡片一開始就莫名其妙帶著上一場留下的猜測顏色。
  if (state?.roomId != null && state?.account && roomStatus === 1) {
    clearCampGuessMap(state.roomId, state.account);
  }
  // 2026-10-23 新增：聊天村的 GM 在 room.join() 裡其實也會被分配到一組隨機色碼
  // （見 backend/game/room.py 的 _random_chat_token_color()，那段對聊天村玩家是不分
  // GM 的），但底下 isGm 的色塊排除邏輯原本是為「一般遊戲村 GM 不佔用九色、沒有顏色」
  // 這個前提寫的，從來沒考慮過聊天村。結果聊天村的 GM 雖然有顏色，介面卻完全不顯示、
  // 也點不出選色面板，Mike 回報「我在聊天村沒辦法選色塊」就是這個。這裡記下房間是不是
  // 聊天村，底下兩處 isGm 判斷都補上聊天村的例外。
  const isChatRoom = Boolean(data?.room?.is_chat_room);
  const selfAccount = state?.account || null;
  const actionOrder = Array.isArray(data?.action_order) ? data.action_order : [];
  const orderIndex = new Map(actionOrder.map((acc, idx) => [String(acc), idx]));
  const inGameOrder = Number(data?.room?.room_status || 0) >= 2 && orderIndex.size > 0;
  const winnerSet = new Set(Array.isArray(data?.winners) ? data.winners.map((value) => String(value || '').trim()).filter(Boolean) : []);
  const entries = Object.entries(players).sort(([accA, a], [accB, b]) => {
    // 2026-10-15：GM 旁觀主持、不下場，不管加入順序或行動順序怎麼排，GM 永遠排在最後面。
    const gmA = Boolean(a?.is_gm);
    const gmB = Boolean(b?.is_gm);
    if (gmA !== gmB) return gmA ? 1 : -1;
    if (inGameOrder) {
      const ia = orderIndex.has(accA) ? Number(orderIndex.get(accA)) : Number.MAX_SAFE_INTEGER;
      const ib = orderIndex.has(accB) ? Number(orderIndex.get(accB)) : Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;
    }
    const ao = Number(a?.join_order || 0);
    const bo = Number(b?.join_order || 0);
    if (ao && bo) return ao - bo;
    if (ao) return -1;
    if (bo) return 1;
    return 0;
  });

  const renderCard = ([account, p]) => {
      const displayTrip = p.trip_display && p.trip_display !== '-' ? p.trip_display : null;
      const avatarNo = Number(p.avatar_no || 0);
      const originalAvatarSrc = avatarNo ? getAvatarImageSrcById(avatarNo) : '';
      const tripMarkerColor = getAvatarColorById(avatarNo) || '#222';
      const cardColor = colorHex(p.color);
      const equipment = (p.equipment || [])
        .map((eq) => {
          const icon = EQUIPMENT_ICON[eq] || '🎴';
          const rawName = String(eq || '').trim();
          const localizedNameKey = `room.active_card.names.${rawName}`;
          const localizedName = t(localizedNameKey);
          const displayName = localizedName && localizedName !== localizedNameKey ? localizedName : rawName;
          return `<button class="equip-chip" type="button" data-equipment-name="${esc(rawName)}" title="${esc(displayName)}" aria-label="${esc(displayName)}">${icon}</button>`;
        })
        .join('');

      const isSelf = Boolean(selfAccount && account === selfAccount);
      const abilityStatus = String(p.ability_status || '').trim().toLowerCase();
      const canUseAbility = p.can_use_ability == null
        ? (isSelf ? Boolean(p.self_can_use_ability) : false)
        : Boolean(p.can_use_ability);
      const showsReady = canUseAbility && abilityStatus !== 'disabled' && abilityStatus !== 'used';
      const showsDisabled = abilityStatus === 'disabled';
      const hasAbilityIndicator = showsReady || showsDisabled;
      // 2026-11-11 新增、2026-11-12 修正：Mike 要求「個人能力可以發動」時要讓自己的
      // 玩家卡片閃爍，不能只靠原本安靜的 player-ability-chip（⚡）小徽章，太容易被忽略。
      // 原本 timing 1~7（開場/移動/場地/攻擊/防禦/結束/綠卡等特定階段才能發動）用的是
      // 「只要還在那個階段就持續閃爍」，但玩家反映這樣太刺眼，而且角色死亡後如果該階段
      // 能力一直沒被標記成已使用（後端 can_use_ability 不會因為玩家死亡就重置），就會
      // 卡成永遠持續閃、玩家自己也關不掉。改成跟 timing 8（不限特定階段、整個自己回合
      // 都能發動，例如 David）同一套做法：只在「剛變成可以發動」那一刻閃幾下就停
      // （computeAbilityTurnStartFlash()，用時間戳記控制、不是持續動畫），之後安靜下來，
      // 不會因為狀態卡住就一直閃。timing 11（standby，目前只有艾莉 Allie）這種角色
      // 幾乎整場都 showsReady=true，維持原本安靜的 ⚡ 徽章，不加任何閃爍。
      const selfAbilityTiming = isSelf ? Number(p.self_character_ability_timing ?? 0) : 0;
      const isFlashableAbilityTiming = [1, 2, 3, 4, 5, 6, 7, 8].includes(selfAbilityTiming);
      const abilityBlinkClass = (isSelf && isFlashableAbilityTiming)
        ? (computeAbilityTurnStartFlash(abilityTurnStartFlashStateRoster, account, showsReady) ? 'ability-turn-start-flash' : '')
        : '';

      const classes = [
        'player-card',
        p.alive ? 'alive' : 'dead',
        // 2026-10-21 新增：Mike 要求暴斃的玩家卡片要跟一般死亡區分出不一樣的顏色，
        // 之前 is_boomed 只會反映在聊天室系統訊息的文字上，卡片本身跟一般死亡視覺
        // 完全相同。這裡只在玩家已經死亡時才加 boomed class（活著的玩家理論上不會
        // is_boomed=True，但保險起見還是跟 !p.alive 一起判斷，避免未來邏輯變動時
        // 活著的玩家卡片被誤套用暴斃配色）。
        // 2026-10-21 修正：這個 renderCard 同時也被歷史回放（replayAdapter.js）共用，
        // 但回放組出來的玩家資料欄位叫 boomed（沿用舊的戰績紀錄命名），不是即時房間
        // 狀態用的 is_boomed，兩邊欄位名稱不一樣、來源也是兩套完全獨立的序列化邏輯，
        // 所以這裡兩個欄位都要檢查，否則回放畫面會看不出暴斃的顏色。
        (!p.alive && (p.is_boomed || p.boomed)) ? 'boomed' : '',
        p.is_ready ? 'ready' : '',
        targetAccountSet.has(account) ? targetPromptClass : '',
        account === currentAccount ? 'current-turn' : '',
        abilityBlinkClass,
      ]
        .filter(Boolean)
        .join(' ');
      const isWinner = winnerSet.has(String(account || '').trim());
      // 2026-10-15：GM 旁觀主持，角色欄直接顯示「GM」，也不顯示顏色位置那個 token 色塊（GM 不佔用九種類色，那個色塊单純是當傚選色）。
      // 2026-10-23 修正：上面這個前提只適用一般遊戲村——聊天村的 GM 一樣會被配到隨機色碼
      // （見上面 isChatRoom 的說明），所以聊天村要排除在這個「GM 沒有顏色」的假設之外。
      const isGm = Boolean(p.is_gm);
      const canPickColor = (!isGm || isChatRoom) && isSelf && roomStatus === 1 && !p.is_ready && typeof onColorChange === 'function';
      const resolvedCharacter = String(p.character || p.character_name || '').trim();
      const hasKnownRole = Boolean(resolvedCharacter);
      const roleNameEn = hasKnownRole ? resolvedCharacter : (isSelf ? p.self_character : null);
      const roleCamp = hasKnownRole ? p.character_camp : (isSelf ? p.self_character_camp : null);
      const hpVisible = isSelf || hasKnownRole;
      const lang = getCurrentUiLang();
      const areaDisplayName = getLocalizedAreaName(p.area, lang);
      const areaNameClass = getAreaNameClass(p.area);
      const roleDisplayName = isGm ? 'GM' : (roleNameEn ? getCharacterLocalizedName(roleNameEn, lang) : '???');
      const isRoleRevealed = Boolean((p?.settlement_character_reveal ?? p?.character_reveal) || false);
      const roleRevealStatusLabel = t(isRoleRevealed ? 'ui.role_reveal_revealed' : 'ui.role_reveal_hidden');
      const roleTooltip = roleNameEn ? getCharacterTooltipInfo(roleNameEn, lang) : null;
      const roleCampClass = roleCamp ? String(roleCamp).toLowerCase() : 'civilian';
      const roleBadgeText = roleNameEn ? String(roleNameEn).trim().charAt(0).toUpperCase() || '?' : '?';
      // 2026-10-29 新增：角色還沒揭露、也不是 GM 的話，前面改放陣營猜測徽章（見
      // 上面 CAMP_GUESS_STATES），取代原本什麼都不顯示的空白。
      const campGuessState = (!roleNameEn && !isGm)
        ? CAMP_GUESS_STATES[getCampGuessIndex(state?.roomId, state?.account, account)]
        : null;
      // 2026-11-12 修正：角色說明改成點擊彈出跟裝備卡共用的浮動視窗（見下面
      // onRoleInfoClick 那段點擊處理），不再需要這裡原本只給 .player-role-popover
      // 用的特殊「(V)Vampire(吸血鬼)」編碼名稱格式，直接重用 roleDisplayName 即可，
      // 這幾個變數跟著拿掉。
      const damageDisplayText = `${esc(p.damage || 0)}`;
      const hpDisplayText = hpVisible ? `${esc(p.hp || 0)}` : '??';
      const tripDisplayText = displayTrip || '-';
      const hasVisibleTrip = Boolean(displayTrip && String(displayTrip).trim() && String(displayTrip).trim() !== '-');
      const canOpenTripProfile = roomStatus === 3 && hasVisibleTrip;
      const encodedTrip = encodeURIComponent(String(displayTrip || '').trim());
      const tripContentHtml = canOpenTripProfile
        ? `<a class="player-trip-link" href="./resident_register.html?trip=${encodedTrip}&profileTab=nicknames" target="_blank" rel="noopener">${esc(tripDisplayText)}</a>`
        : `<span class="player-role-name">${esc(tripDisplayText)}</span>`;
      const isInvulnerable = Boolean(p.is_invulnerable);
      const invulnerabilitySource = String(
        p.invulnerability_source
        || (Array.isArray(p.invulnerability_sources) ? p.invulnerability_sources[0] : '')
        || ''
      ).trim();
      const shieldButton = isInvulnerable
        ? `<button class="player-shield-chip" type="button" data-shield-source="${esc(invulnerabilitySource)}" aria-label="${esc(t('room.invulnerability_source.aria_label'))}" title="${esc(t('room.invulnerability_source.title'))}">🛡️</button>`
        : '';
      const crownBadge = isWinner ? `<span class="avatar-crown" aria-label="${esc(t('ui.winner_crown'))}" title="${esc(t('ui.winner_crown'))}">👑</span>` : '';
      let abilityBadge = '';
      if (hasAbilityIndicator) {
        if (showsReady) {
          abilityBadge = `<span class="player-ability-chip ready" aria-label="${esc(t('ui.ability_ready'))}" title="${esc(t('ui.ability_ready'))}">⚡</span>`;
        } else if (showsDisabled) {
          abilityBadge = `<span class="player-ability-chip disabled" aria-label="${esc(t('ui.ability_disabled'))}" title="${esc(t('ui.ability_disabled'))}">🚫</span>`;
        }
      }

      let colorControlHtml = (isGm && !isChatRoom) ? '' : `<span class="color-chip-static" style="background:${cardColor}" title="${esc(p.color || 'N/A')}"></span>`;
      if (canPickColor) {
        // 2026-10-23 新增：Mike 回報聊天村點開色塊「還是用選的」——聊天村玩家的顏色
        // 本來就是完整色碼（不是九色代號），所以聊天村改用色碼輸入（原生色盤 + 可直接
        // 打字的文字框，兩個互相同步），取代一般遊戲村用的九色色塊；一般遊戲村的九色
        // 色塊維持不變。
        const pickerContentHtml = isChatRoom
          ? `
            <div class="color-hex-picker">
              <input type="color" class="color-hex-swatch-input" data-pick-color-hex value="${cardColor}" aria-label="${esc(t('ui.color_picker_label'))}" />
              <input type="text" class="color-hex-text-input" data-pick-color-hex-text value="${esc(cardColor)}" maxlength="7" placeholder="#rrggbb" aria-label="${esc(t('ui.color_picker_label'))}" />
            </div>
          `
          : PLAYER_COLORS.map((c) => {
              const taken = Object.entries(players).some(([acc, pl]) => acc !== account && pl.color === c);
              const selected = p.color === c;
              return `<button class="color-swatch${selected ? ' selected' : ''}${taken ? ' taken' : ''}" type="button" data-pick-color="${c}" style="background:${colorHex(c)}" title="${c}" aria-pressed="${selected}"${taken ? ' disabled' : ''}></button>`;
            }).join('');
        colorControlHtml = `
          <div class="color-picker${isChatRoom ? ' color-picker-chat' : ''}" data-color-picker>
            <button class="color-chip-trigger" type="button" style="background:${cardColor}" title="${esc(t('ui.color_picker_label'))}" aria-label="${esc(t('ui.color_picker_label'))}" aria-expanded="false"></button>
            <div class="color-picker-row" role="group" aria-label="${esc(t('ui.color_picker_label'))}" hidden>${pickerContentHtml}</div>
          </div>
        `;
      }

      return `
        <article class="${classes}" data-player-account="${esc(account)}" style="border-left:3px solid ${cardColor}" aria-label="${esc(t('ui.player_label', { name: p.name || account }))}">
          <header class="player-card-head">
            <span class="avatar-badge" aria-hidden="true">
              ${!p.alive
                ? avatarNo
                  ? `<img src="./assets/avatars/ghost_dead.gif" alt="${esc(p.name || account)}" class="avatar-card-img dead-previewable" data-dead-avatar-src="./assets/avatars/ghost_dead.gif" data-live-avatar-src="${esc(originalAvatarSrc)}" />`
                  : `<img src="./assets/avatars/ghost_dead.gif" alt="${esc(p.name || account)}" class="avatar-card-img" />`
                : avatarNo
                  ? `<img src="${originalAvatarSrc}" alt="${esc(p.name || account)}" class="avatar-card-img" />`
                  : esc(getInitial(p.name || account))}
              ${crownBadge}
              ${shieldButton}
              ${abilityBadge}
            </span>
            <div class="player-id-block">
              <strong>🩸 ${damageDisplayText} ❤️ ${hpDisplayText}</strong>
              <div class="player-status-inline">🎯 ${esc(statusText[p.status] || p.status || '-')}</div>
            </div>
            <div class="player-color-cell">${colorControlHtml}</div>
          </header>
          <div class="player-card-meta">
            <span class="player-area-label ${esc(areaNameClass)}">📍 ${esc(areaDisplayName)}</span>
          </div>
          <div class="player-card-meta-role">
            <div class="player-role-info">
              <button class="player-role-trigger" type="button" aria-label="${esc(t('ui.role_detail'))}"${roleTooltip ? ` data-role-info-available="1" data-role-name="${esc(roleDisplayName)}" data-role-camp="${esc(roleTooltip.camp)}" data-role-win="${esc(roleTooltip.win)}" data-role-ability="${esc(roleTooltip.ability)}" data-role-reveal-label="${esc(roleRevealStatusLabel)}"` : ''}>
                ${roleNameEn
                  ? `<span class="damage-meter-badge ${esc(roleCampClass)} player-role-badge">${esc(roleBadgeText)}</span>`
                  : (campGuessState ? `<span class="damage-meter-badge player-role-badge player-camp-guess-badge ${esc(campGuessState.cls)}" data-camp-guess-toggle data-player-account="${esc(account)}" role="button" tabindex="0" aria-label="${esc(t(campGuessState.labelKey))}" title="${esc(t(campGuessState.labelKey))}">${esc(campGuessState.symbol)}</span>` : '')}
                <span class="player-role-name">${esc(roleDisplayName)}</span>
                <span class="player-role-state">${esc(roleRevealStatusLabel)}</span>
              </button>
            </div>
          </div>
          <div class="player-card-hp">
            <span class="trip-prefix-diamond" style="color:${esc(tripMarkerColor)}" aria-hidden="true">◆</span>
            <span class="player-card-nickname">${esc(p.name || account)}</span>
          </div>
          <div class="player-card-role">
            ${hasVisibleTrip ? '<span class="trip-prefix-diamond trip-prefix-diamond-fixed" aria-hidden="true">◆</span>' : ''}
            ${tripContentHtml}
          </div>
          <div class="equip-row">${equipment || `<span class="lighttxt">${esc(t('ui.no_equip'))}</span>`}</div>
        </article>
      `;
    };

  // 2026-10-13：別人的任何動作（加入房間、改顏色、狀態切換等）觸發 SSE 推播時，
  // renderState() 都會重新呼叫這裡，把所有玩家卡的 innerHTML 整個重新生成一次；這時如果自己
  // 卡上那個選色小面板剛好還開著，會在毫無預警的情況下被一起蓋掉關閉——玩家感覺就是選顏色被
  // 自動更新打斷。所以重建 HTML 之前先記下目前是哪個玩家的選色小面板是打開的，重建後再把它重新
  // 打開（前提是那個玩家在這次快照裡還有資格顯示選色器）。
  const openColorPickerPanel = container.querySelector('[data-color-picker] .color-picker-row:not([hidden])');
  const openColorPickerAccount = openColorPickerPanel
    ? openColorPickerPanel.closest('[data-player-account]')?.getAttribute('data-player-account') || null
    : null;

  if (view === 'room') {
    // 2026-11-10 修正：房間人數上限已開放到 10 人（見 backend/room_manager.py 的
    // max_players 4~10 範圍），這裡原本還停在舊的 8 人上限時代留下的數字，沒有跟著
    // 調整，10 人房間時座位圖反而會比實際人數還早補滿、看起來很擠。改成跟著人數上限
    // 一起變成 10，GM 的固定空位／GM 本人座位照舊接在後面，總共 12 格（10 人＋1 格
    // 空位＋GM），GM 固定落在第 12 格。
    const minVisibleSlots = 10;
    // 2026-10-15：GM 旁觀主持、不下場，在村民座位圖裡固定排在最後，跟真正下場的玩家之間留一格空位；真正玩家還是照原本規則補滿到上限格數，GM 不佔用這個名額。
    const nonGmEntries = entries.filter(([, p]) => !p?.is_gm);
    const gmEntries = entries.filter(([, p]) => p?.is_gm);
    const seatCards = nonGmEntries.map(renderCard);
    while (seatCards.length < minVisibleSlots) {
      seatCards.push('<div class="seat-empty">-</div>');
    }
    if (gmEntries.length) {
      seatCards.push('<div class="seat-empty">-</div>');
      seatCards.push(...gmEntries.map(renderCard));
    }
    container.classList.add('seat-grid');
    container.classList.remove('flow-grid');
    container.innerHTML = seatCards
      .map((cardHtml, index) => `<div class="seat-slot" data-seat-index="${index + 1}">${cardHtml}</div>`)
      .join('');
  } else {
    container.classList.add('flow-grid');
    container.classList.remove('seat-grid');
    if (!entries.length) {
      container.innerHTML = `<p class="lighttxt">${esc(t('ui.no_players'))}</p>`;
    } else {
      container.innerHTML = entries.map(renderCard).join('');
    }
  }

  // 2026-11-11 新增：不管剛剛走哪個分支（seat-grid／flow-grid／空清單），只要容器裡
  // 有帶攻擊/場地目標閃爍 class 的卡片，統一對齊到跟骰子/下一步按鈕同一個虛擬時鐘。
  syncPulsePromptsIn(container);

  if (openColorPickerAccount) {
    const reopenCard = container.querySelector(`[data-player-account="${CSS.escape(openColorPickerAccount)}"] [data-color-picker]`);
    const reopenPanel = reopenCard?.querySelector('.color-picker-row');
    const reopenToggle = reopenCard?.querySelector('.color-chip-trigger');
    if (reopenPanel instanceof HTMLElement) reopenPanel.removeAttribute('hidden');
    if (reopenToggle instanceof HTMLElement) reopenToggle.setAttribute('aria-expanded', 'true');
  }

  const closeAllColorPickers = () => {
    container.querySelectorAll('[data-color-picker] .color-picker-row').forEach((row) => {
      if (!(row instanceof HTMLElement)) return;
      row.setAttribute('hidden', '');
    });
    container.querySelectorAll('[data-color-picker] .color-chip-trigger').forEach((button) => {
      if (!(button instanceof HTMLElement)) return;
      button.setAttribute('aria-expanded', 'false');
    });
  };

  container.querySelectorAll('[data-color-picker]').forEach((picker) => {
    const toggle = picker.querySelector('.color-chip-trigger');
    const panel = picker.querySelector('.color-picker-row');
    if (!(toggle instanceof HTMLElement) || !(panel instanceof HTMLElement)) return;

    toggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const isOpen = !panel.hasAttribute('hidden');

      closeAllColorPickers();

      if (!isOpen) {
        panel.removeAttribute('hidden');
        toggle.setAttribute('aria-expanded', 'true');
        // 2026-10-23 新增：聊天村的色碼文字框打開面板後立刻搶 focus——一方面方便直接
        // 打字，另一方面讓上面那段「正在編輯就跳過重繪」的保護，從面板打開的那一刻就
        // 立刻生效，盡量縮短「剛打開、但還沒 focus 進文字框」這段仍然可能被 SSE/輪詢
        // 重繪打斷的空窗期（手機上 Mike 回報的「點開面板就自動關掉」多半就是卡在這段）。
        const hexTextInput = panel.querySelector('[data-pick-color-hex-text]');
        if (hexTextInput instanceof HTMLInputElement) hexTextInput.focus();
      }
    });
  });

  if (container.__colorPickerOutsideHandler) {
    document.removeEventListener('click', container.__colorPickerOutsideHandler, true);
  }
  container.__colorPickerOutsideHandler = (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      closeAllColorPickers();
      return;
    }
    if (!target.closest('[data-color-picker]')) closeAllColorPickers();
  };
  document.addEventListener('click', container.__colorPickerOutsideHandler, true);

  if (container.__colorPickerEscHandler) {
    document.removeEventListener('keydown', container.__colorPickerEscHandler, true);
  }
  container.__colorPickerEscHandler = (event) => {
    if (event.key === 'Escape') closeAllColorPickers();
  };
  document.addEventListener('keydown', container.__colorPickerEscHandler, true);

  if (onColorChange) {
    container.querySelectorAll('[data-pick-color]').forEach((btn) => {
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeAllColorPickers();
        const color = btn.getAttribute('data-pick-color');
        if (color) onColorChange(color);
      });
    });

    // 2026-10-23 新增：聊天村的色碼輸入——原生色盤（data-pick-color-hex）跟文字框
    // （data-pick-color-hex-text）互相同步顯示，但只在「確定」的那一刻（色盤的 change
    // 事件＝使用者關掉系統色盤、文字框按 Enter 或失焦）才真的呼叫 onColorChange 打一次
    // API，避免拖曳色盤時每個中間值都送一次後端。格式驗證跟後端 api_change_color 用同一套
    // #rrggbb 規則，文字框輸入不合法格式時只標紅、不送出。
    const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
    container.querySelectorAll('[data-pick-color-hex]').forEach((colorInput) => {
      if (!(colorInput instanceof HTMLInputElement)) return;
      const picker = colorInput.closest('[data-color-picker]');
      const textInput = picker?.querySelector('[data-pick-color-hex-text]');
      colorInput.addEventListener('input', () => {
        if (textInput instanceof HTMLInputElement) {
          textInput.value = colorInput.value;
          textInput.classList.remove('invalid');
        }
      });
      colorInput.addEventListener('change', () => {
        closeAllColorPickers();
        if (HEX_COLOR_RE.test(colorInput.value)) onColorChange(colorInput.value.toLowerCase());
      });
    });
    container.querySelectorAll('[data-pick-color-hex-text]').forEach((textInput) => {
      if (!(textInput instanceof HTMLInputElement)) return;
      const picker = textInput.closest('[data-color-picker]');
      const colorInput = picker?.querySelector('[data-pick-color-hex]');
      const commit = () => {
        const value = textInput.value.trim();
        if (!HEX_COLOR_RE.test(value)) {
          textInput.classList.add('invalid');
          return;
        }
        textInput.classList.remove('invalid');
        if (colorInput instanceof HTMLInputElement) colorInput.value = value.toLowerCase();
        onColorChange(value.toLowerCase());
      };
      textInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
          closeAllColorPickers();
        }
      });
      textInput.addEventListener('blur', commit);
    });
  }

  if (typeof onPlayerCardClick === 'function') {
    container.querySelectorAll('[data-player-account]').forEach((card) => {
      card.addEventListener('click', (event) => {
        // 2026-10-13：玩家想拖選或雙擊/三擊卡片上的文字（最常見的是暱稱）來複製時，
        // mouseup 那一刻依然會觸發這裡的 click，結果變成誤觸發選取玩家（投票踢人等）；
        // 所以先檢查這次 click 發生時畫面上有沒有非空的選取內容，有的話表示這是選字動作而不是真正的點擊，直接忽略。
        const activeSelection = typeof window.getSelection === 'function' ? window.getSelection() : null;
        if (activeSelection && activeSelection.toString().length > 0) return;

        const target = event.target;
        // 2026-11-12 修正：跟 playerCardBindings.js 那邊同一個理由——角色還沒揭露、
        // 沒有資訊可以顯示時 .player-role-trigger 不會接點擊事件，這裡原本整個排除
        // 會讓投票踢出在角色名稱這塊區域也點不到，只排除真的有彈窗可開的情況。
        if (target instanceof Element && target.closest('[data-pick-color], .color-picker, .player-role-trigger[data-role-info-available], .equip-chip, .player-shield-chip, .player-ability-chip')) return;
        const account = card.getAttribute('data-player-account');
        if (account) onPlayerCardClick(account);
      });
    });
  }

  if (typeof onEquipmentChipClick === 'function') {
    container.querySelectorAll('[data-player-account] .equip-chip[data-equipment-name]').forEach((chip) => {
      chip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) return;
        const equipmentName = String(target.getAttribute('data-equipment-name') || '').trim();
        const owner = target.closest('[data-player-account]');
        const account = String(owner?.getAttribute('data-player-account') || '').trim();
        if (!equipmentName) return;
        onEquipmentChipClick({ account, equipmentName, anchorEl: target });
      });
    });
  }

  if (typeof onShieldChipClick === 'function') {
    container.querySelectorAll('[data-player-account] .player-shield-chip[data-shield-source]').forEach((chip) => {
      chip.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) return;
        const source = String(target.getAttribute('data-shield-source') || '').trim();
        const owner = target.closest('[data-player-account]');
        const account = String(owner?.getAttribute('data-player-account') || '').trim();
        onShieldChipClick({ account, source, anchorEl: target });
      });
    });
  }

  // 2026-11-12 新增：角色說明原本是滑過／點擊展開的 CSS 浮動小視窗（.player-role-popover），
  // 手機上沒有「滑過」這個動作、改成點擊後反而容易跟下面點卡片本身的動作搞混；而且這顆
  // 按鈕原本完全沒有接 click 事件——Mike 回報「偶爾點玩家卡片沒反應、多點幾次才會成功」，
  // 原因之一就是點擊剛好落在角色名稱/狀態文字這塊完全沒有處理常式的區域，等於點了空氣
  // （見下面 handlePlayerCardClick 呼叫前那段 .closest(...) 的排除清單）。現在改成跟裝備／
  // 護盾徽章一樣，點擊後彈出跟裝備卡說明共用的同一個浮動視窗（#activeCardDialog），角色
  // 說明資訊搬去那邊顯示，不用再塞在卡片本身有限的寬度裡，順便解決英文版「(Revealed)」
  // 字樣在彈窗玩家卡片裡超框的問題（見 room.js 的 handleRoleInfoClick）。
  if (typeof onRoleInfoClick === 'function') {
    container.querySelectorAll('[data-player-account] .player-role-trigger[data-role-info-available]').forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const target = event.currentTarget;
        if (!(target instanceof HTMLElement)) return;
        onRoleInfoClick({
          name: target.getAttribute('data-role-name') || '',
          camp: target.getAttribute('data-role-camp') || '',
          win: target.getAttribute('data-role-win') || '',
          ability: target.getAttribute('data-role-ability') || '',
          revealLabel: target.getAttribute('data-role-reveal-label') || '',
          anchorEl: target,
        });
      });
    });
  }

  // 2026-10-29 新增：陣營猜測徽章是純前端個人標記，點一下／按 Enter 或空白鍵就往下
  // 一個狀態循環，直接寫 localStorage 並就地更新這顆徽章的樣式跟文字，不需要重新
  // 整個房間重繪，也完全不經過 dispatch，不會影響其他玩家看到的資料。
  const advanceCampGuess = (badge) => {
    if (!(badge instanceof HTMLElement)) return;
    const targetAccount = String(badge.getAttribute('data-player-account') || '').trim();
    if (!targetAccount || state?.roomId == null || !state?.account) return;
    const nextIndex = (getCampGuessIndex(state.roomId, state.account, targetAccount) + 1) % CAMP_GUESS_STATES.length;
    setCampGuessIndex(state.roomId, state.account, targetAccount, nextIndex);
    const nextState = CAMP_GUESS_STATES[nextIndex];
    badge.className = `damage-meter-badge player-role-badge player-camp-guess-badge ${nextState.cls}`;
    badge.textContent = nextState.symbol;
    const label = t(nextState.labelKey);
    badge.setAttribute('aria-label', label);
    badge.setAttribute('title', label);
    // 2026-11-11 修正：Mike 回報聊天室的「(???)」跟陣營猜測徽章連動後，猜測了
    // 卻沒看到聊天室跟著變色——這個徽章本身是故意不整個房間重繪（上面的註解），
    // 但聊天室訊息的 HTML 是渲染當下就決定好的字串，不會因為猜測改變而自動
    // 重新產生，所以已經顯示在畫面上的訊息會一直停在舊的樣子，直到下一次剛好
    // 有新的 renderState() 被呼叫才會跟著更新。這裡補上一個可選的回呼，猜測
    // 變更時主動請聊天室重新渲染一次（沿用現有資料，不會多打一次 API）。
    if (typeof onCampGuessChange === 'function') {
      onCampGuessChange();
    }
    // 2026-11-11 新增：上面的 onCampGuessChange 只接到房間頁內嵌聊天室
    // （renderChatStage，現在已經隱藏不顯示）那條路徑，浮動聊天室
    // （floatingChat.js）是完全獨立的模組、有自己的輪詢跟重繪，接不到這個
    // 回呼。這裡額外發一個全域事件，讓浮動聊天室自己訂閱、收到就重繪一次，
    // 不用整個網頁重新整理才看得到最新的猜測顏色。
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('sh:campGuessChanged'));
    }
  };
  container.querySelectorAll('[data-player-account] [data-camp-guess-toggle]').forEach((badge) => {
    badge.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      advanceCampGuess(event.currentTarget);
    });
    badge.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Spacebar') return;
      event.preventDefault();
      event.stopPropagation();
      advanceCampGuess(event.currentTarget);
    });
  });

  container.querySelectorAll('.avatar-card-img.dead-previewable').forEach((image) => {
    const deadSrc = String(image.getAttribute('data-dead-avatar-src') || '').trim();
    const liveSrc = String(image.getAttribute('data-live-avatar-src') || '').trim();
    if (!deadSrc || !liveSrc) return;

    let pinnedLive = false;
    const setPreview = (showLive) => {
      image.src = showLive ? liveSrc : deadSrc;
    };

    image.addEventListener('mouseenter', () => {
      if (pinnedLive) return;
      setPreview(true);
    });
    image.addEventListener('mouseleave', () => {
      if (pinnedLive) return;
      setPreview(false);
    });
    image.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      pinnedLive = !pinnedLive;
      setPreview(pinnedLive);
    });
  });
}

// 2026-11-11 新增：Mike 要求手機板在遊戲桌面區塊上方加一排簡化版玩家 icon（頭貼 +
// ID 前幾個字 + 右下角徽章），方便攻擊／卡片／能力選目標時不用捲動到最上面的
// 村民列表。跟村民列表的完整卡片是兩份獨立存在的畫面、不互相取代。點擊行為刻意
// 不在這裡自己處理——跟村民列表、場地卡彈出的玩家卡片一樣，只要在 room.html 放
// 一個帶 data-player-account 的容器、加進 playerCardBindings.js 的清單，點擊就會
// 自動走同一套既有的目標判斷邏輯（攻擊／能力／卡片／GM 操作），不用另外重寫一次。
const MOBILE_QUICK_NAME_MAX_CHARS = 6;

function truncateMobileQuickName(name) {
  const value = String(name || '').trim();
  if (!value) return '';
  // 用 Array.from 逐字元切，避免把中文／emoji 這類多位元組字元從中間切斷出現亂碼。
  const chars = Array.from(value);
  if (chars.length <= MOBILE_QUICK_NAME_MAX_CHARS) return value;
  return `${chars.slice(0, MOBILE_QUICK_NAME_MAX_CHARS).join('')}…`;
}

export function renderMobilePlayerQuickBar(container, data, { esc, getInitial, state, onPlayerCardClick, onOpenCardPopup, targetAccounts = [], targetPromptClass = 'attack-target-prompt' } = {}) {
  if (!container) return;
  const players = data?.players || {};
  const targetAccountSet = new Set(Array.isArray(targetAccounts) ? targetAccounts : []);
  const currentAccount = data?.turn?.current_account || null;
  const actionOrder = Array.isArray(data?.action_order) ? data.action_order : [];
  const orderIndex = new Map(actionOrder.map((acc, idx) => [String(acc), idx]));
  const inGameOrder = Number(data?.room?.room_status || 0) >= 2 && orderIndex.size > 0;
  const selfAccount = state?.account || null;

  // GM 旁觀主持、永遠不會是攻擊/卡片/能力的合法目標，這排快速選單乾脆不顯示 GM。
  const entries = Object.entries(players)
    .filter(([, p]) => !p?.is_gm)
    .sort(([accA, a], [accB, b]) => {
      if (inGameOrder) {
        const ia = orderIndex.has(accA) ? Number(orderIndex.get(accA)) : Number.MAX_SAFE_INTEGER;
        const ib = orderIndex.has(accB) ? Number(orderIndex.get(accB)) : Number.MAX_SAFE_INTEGER;
        if (ia !== ib) return ia - ib;
      }
      const ao = Number(a?.join_order || 0);
      const bo = Number(b?.join_order || 0);
      if (ao && bo) return ao - bo;
      if (ao) return -1;
      if (bo) return 1;
      return 0;
    });

  container.innerHTML = entries.map(([account, p]) => {
    const avatarNo = Number(p.avatar_no || 0);
    const avatarSrc = avatarNo ? getAvatarImageSrcById(avatarNo) : '';
    const isSelf = Boolean(selfAccount && account === selfAccount);
    // 2026-11-11 新增、2026-11-12 修正：跟村民列表卡片（renderPlayerCards）一樣的
    // 個人能力可發動閃爍，讓手機/電腦版快速頭像列也有同樣的提示（見上面
    // renderPlayerCards 裡那段「改成只閃幾秒」的修正說明，這裡沿用一樣的判斷、
    // 只是換一份獨立的 Map）。
    const quickBarAbilityStatus = String(p.ability_status || '').trim().toLowerCase();
    const quickBarCanUseAbility = p.can_use_ability == null
      ? (isSelf ? Boolean(p.self_can_use_ability) : false)
      : Boolean(p.can_use_ability);
    const quickBarShowsReady = quickBarCanUseAbility && quickBarAbilityStatus !== 'disabled' && quickBarAbilityStatus !== 'used';
    const quickBarSelfAbilityTiming = isSelf ? Number(p.self_character_ability_timing ?? 0) : 0;
    const quickBarIsFlashableAbilityTiming = [1, 2, 3, 4, 5, 6, 7, 8].includes(quickBarSelfAbilityTiming);
    const abilityBlinkClass = (isSelf && quickBarIsFlashableAbilityTiming)
      ? (computeAbilityTurnStartFlash(abilityTurnStartFlashStateMobile, account, quickBarShowsReady) ? 'ability-turn-start-flash' : '')
      : '';
    const resolvedCharacter = String(p.character || p.character_name || '').trim();
    const hasKnownRole = Boolean(resolvedCharacter);
    const roleNameEn = hasKnownRole ? resolvedCharacter : (isSelf ? p.self_character : null);
    const roleCamp = hasKnownRole ? p.character_camp : (isSelf ? p.self_character_camp : null);
    const roleCampClass = roleCamp ? String(roleCamp).toLowerCase() : 'civilian';
    const roleBadgeText = roleNameEn ? String(roleNameEn).trim().charAt(0).toUpperCase() || '?' : '?';
    const campGuessState = !roleNameEn
      ? CAMP_GUESS_STATES[getCampGuessIndex(state?.roomId, state?.account, account)]
      : null;
    const badgeHtml = roleNameEn
      ? `<span class="mobile-quick-badge ${esc(roleCampClass)}">${esc(roleBadgeText)}</span>`
      : (campGuessState?.cls ? `<span class="mobile-quick-badge ${esc(campGuessState.cls)}">${esc(campGuessState.symbol)}</span>` : '<span class="mobile-quick-badge">?</span>');
    const avatarHtml = !p.alive
      ? '<img src="./assets/avatars/ghost_dead.gif" alt="" class="mobile-quick-avatar-img" />'
      : avatarSrc
        ? `<img src="${avatarSrc}" alt="" class="mobile-quick-avatar-img" />`
        : `<span class="mobile-quick-avatar-initial">${esc(getInitial(p.name || account))}</span>`;
    const classes = [
      'mobile-quick-icon',
      p.alive ? 'alive' : 'dead',
      account === currentAccount ? 'current-turn' : '',
      targetAccountSet.has(account) ? targetPromptClass : '',
      abilityBlinkClass,
    ].filter(Boolean).join(' ');
    const displayName = truncateMobileQuickName(p.name || account);
    // 2026-11-11 新增：Mike 要求快速頭像左下角加一塊 token 顏色色塊，跟完整玩家
    // 卡片一樣讓人不用點開就能分辨自己／對方的顏色標記（跟右下角的角色/陣營猜測
    // 徽章左右對稱）。colorHex() 是這個檔案最上面就有的共用函式，直接重用。
    const colorChipHtml = `<span class="mobile-quick-color-chip" style="background:${colorHex(p.color)}" aria-hidden="true"></span>`;
    return `<button type="button" class="${classes}" data-player-account="${esc(account)}" aria-label="${esc(t('ui.player_label', { name: p.name || account }))}">`
      + `<span class="mobile-quick-avatar">${avatarHtml}${badgeHtml}${colorChipHtml}</span>`
      + `<span class="mobile-quick-name">${esc(displayName)}</span>`
      + '</button>';
  }).join('');

  // 2026-11-11 新增（Mike 回報開局前點快速頭像沒反應）：renderPlayerCards 本身對
  // 每張卡片有一組直接綁在卡片 DOM 上的點擊監聽（見下面該函式內 onPlayerCardClick
  // 區塊），app.js 用它來接「開局前投票踢出」這個功能（options.enableVoteKick +
  // room_status===1 才會動作，遊戲中點一樣會因為 room_status 不符被忽略，不會互相
  // 干擾）。這排快速頭像原本完全沒接這組監聽，只靠 playerCardBindings.js 那個委派
  // 監聽（處理攻擊/能力/卡片等「遊戲中」操作），導致開局前點快速頭像完全沒有投票踢出
  // 的管道——這裡補上同樣的直接監聽，讓快速頭像跟完整玩家卡片有一樣的投票踢出能力。
  // 2026-11-11 新增：Mike 要求加一個開關（state.quickAvatarPopupFirst，房間頁
  // 「自動更新」設定區塊可以切換），讓點快速頭像可以選擇「先彈出完整卡片」
  // （重用場地卡玩家 token 那套 stageOccupantCardPopup，見 room.js 的
  // openOccupantCardPopup）還是維持原本「直接動作」（投票踢出／遊戲中操作）。
  // 這裡刻意只掛一個監聽、放在最前面判斷，開關打開時用 stopImmediatePropagation()
  // 擋掉後面的投票踢出（同一個元素上的監聽）跟 playerCardBindings.js 那個委派在
  // 容器上的監聽（事件往上冒泡才會碰到，stopPropagation 一樣擋得住），避免兩套
  // 行為同時觸發。state 是用參考傳進來的同一個物件，所以這裡直接讀
  // state.quickAvatarPopupFirst，開關隨時切換都會立刻反映在下一次點擊，不用等
  // 這排重新渲染。
  if (typeof onPlayerCardClick === 'function' || typeof onOpenCardPopup === 'function') {
    container.querySelectorAll('[data-player-account]').forEach((card) => {
      card.addEventListener('click', (event) => {
        const activeSelection = typeof window.getSelection === 'function' ? window.getSelection() : null;
        if (activeSelection && activeSelection.toString().length > 0) return;
        const account = card.getAttribute('data-player-account');
        if (!account) return;
        if (state?.quickAvatarPopupFirst && typeof onOpenCardPopup === 'function') {
          event.stopImmediatePropagation();
          onOpenCardPopup(account, card);
          return;
        }
        if (typeof onPlayerCardClick === 'function') onPlayerCardClick(account);
      });
    });
  }

  // 2026-11-11 新增：這排每次房間狀態更新都整個 innerHTML 重新渲染，攻擊/場地目標
  // 閃爍提示要對齊到跟骰子/下一步按鈕同一個虛擬時鐘，不然看起來會各閃各的。
  syncPulsePromptsIn(container);
}

export async function loadAnnouncement(el) {
  if (!el.announcementText) return;
  try {
    const resp = await apiFetch('/api/announcement', { cache: 'no-store' });
    if (!resp.ok) {
      el.announcementText.textContent = t('ui.announce_empty');
      return;
    }

    const text = (await resp.text()).trim();
    if (text.includes('ERR_NGROK_6024')) {
      el.announcementText.textContent = t('ui.announce_empty');
      return;
    }
    el.announcementText.textContent = text || t('ui.announce_empty');
  } catch {
    el.announcementText.textContent = t('ui.announce_empty');
  }
}
