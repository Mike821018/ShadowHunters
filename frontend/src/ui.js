import { t } from './i18n.js';
import { PLAYER_COLORS, PLAYER_COLOR_HEX, resolvePlayerColorHex } from './constants.js';
import { getCharacterLocalizedName, getCharacterTooltipInfo, getCurrentUiLang } from './characterInfo.js';
import { getAvatarColorById, getAvatarImageSrcById } from './avatarConfig.js';
import { apiFetch } from './utils.js';

function colorHex(color) {
  // 2026-10-22 修正：聊天村玩家顏色改存完整色碼（例如 '#3fae7d'），不再限制在
  // PLAYER_COLOR_HEX 這 9 色代號裡，這裡改呼叫共用的 resolvePlayerColorHex()
  // 判斷是不是已經是完整色碼。
  return resolvePlayerColorHex(color, '#cccccc');
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

export function renderPlayerCards(container, data, { esc, getInitial, statusText, state, onColorChange, onPlayerCardClick, onEquipmentChipClick, onShieldChipClick, view = 'flow', targetAccounts = [], targetPromptClass = 'attack-target-prompt' } = {}) {
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
      ]
        .filter(Boolean)
        .join(' ');

      const isSelf = Boolean(selfAccount && account === selfAccount);
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
      const tooltipNameRaw = String(roleTooltip?.name || roleDisplayName || '-');
      const tooltipNameMatch = tooltipNameRaw.match(/^\(([A-Za-z])\)(.*)$/);
      const tooltipNameHtml = tooltipNameMatch
        ? `<span class="damage-meter-badge ${esc(roleCampClass)}">${esc(tooltipNameMatch[1].toUpperCase())}</span> ${esc(tooltipNameMatch[2] || '')}`
        : esc(tooltipNameRaw);
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
      const abilityStatus = String(p.ability_status || '').trim().toLowerCase();
      const canUseAbility = p.can_use_ability == null
        ? (isSelf ? Boolean(p.self_can_use_ability) : false)
        : Boolean(p.can_use_ability);
      const showsReady = canUseAbility && abilityStatus !== 'disabled' && abilityStatus !== 'used';
      const showsDisabled = abilityStatus === 'disabled';
      const hasAbilityIndicator = showsReady || showsDisabled;
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
              <button class="player-role-trigger" type="button" aria-label="${esc(t('ui.role_detail'))}">
                ${roleNameEn ? `<span class="damage-meter-badge ${esc(roleCampClass)} player-role-badge">${esc(roleBadgeText)}</span>` : ''}
                <span class="player-role-name">${esc(roleDisplayName)}</span>
                <span class="player-role-state">${esc(roleRevealStatusLabel)}</span>
              </button>
              ${roleTooltip ? `
                <div class="player-role-popover" role="tooltip">
                  <div><strong>${esc(t('ui.role_name'))}</strong> ${tooltipNameHtml}</div>
                  <div><strong>${esc(t('ui.role_camp'))}</strong> ${esc(roleTooltip.camp)}</div>
                  <div><strong>${esc(t('ui.role_win'))}</strong> ${esc(roleTooltip.win)}</div>
                  <div><strong>${esc(t('ui.role_ability'))}</strong> ${esc(roleTooltip.ability)}</div>
                </div>
              ` : ''}
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
    const minVisibleSlots = 8;
    // 2026-10-15：GM 旁觀主持、不下場，在村民座位圖裡固定排在最後，跟真正下場的玩家之間留一格空位；真正玩家還是照原本規則補滿到 8 格，GM 不佔用這個名額。
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
        if (target instanceof Element && target.closest('[data-pick-color], .color-picker, .player-role-trigger, .player-role-popover, .player-role-info, .equip-chip, .player-shield-chip, .player-ability-chip')) return;
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
