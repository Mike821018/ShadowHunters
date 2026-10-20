import { t } from '../../i18n.js';

// 這個檔案是 records.js（對戰紀錄列表）跟 villageSettingsBadges.js（房間頁「村子資訊」徽章列）
// 共用的房間設定判讀邏輯；兩邊都要畫出同樣幾種設定徽章（卡組、初始綠卡、中立大亂鬥、
// 徽章唯一），刻意集中寫在這裡只維護一份，避免又出現「改了一邊、忘了另一邊」的狀況。

export function expansionModeToCardFlags(mode) {
  const normalized = String(mode || 'all').trim();
  if (normalized === 'no_extend') return { useBasic: true, useExtend: false };
  if (normalized === 'expansion_only') return { useBasic: false, useExtend: true };
  return { useBasic: true, useExtend: true };
}

// G/C/U/B/E 這幾個單字母徽章代碼跟對應的顏色／標題／說明，records.js（對戰紀錄）
// 跟房間頁的村子資訊徽章列共用同一套，讓玩家在兩個地方看到的徽章長相、意思一致。
export function optionBadgeMeta(code) {
  if (code === 'G') {
    return {
      className: 'records-option-badge records-option-badge-green',
      title: t('records.badge_green_title'),
      desc: t('records.badge_green_desc'),
    };
  }
  if (code === 'C') {
    return {
      className: 'records-option-badge records-option-badge-neutral',
      title: t('records.badge_neutral_chaos_title'),
      desc: t('records.badge_neutral_chaos_desc'),
    };
  }
  if (code === 'U') {
    return {
      className: 'records-option-badge records-option-badge-blue',
      title: t('records.badge_unique_title'),
      desc: t('records.badge_unique_desc'),
    };
  }
  if (code === 'B') {
    return {
      className: 'records-option-badge records-option-badge-blue',
      title: t('records.badge_basic_title'),
      desc: t('records.badge_basic_desc'),
    };
  }
  if (code === 'E') {
    return {
      className: 'records-option-badge records-option-badge-blue',
      title: t('records.badge_extend_title'),
      desc: t('records.badge_extend_desc'),
    };
  }
  // 2026-10-15：新增 GM 和隨機初始位置這兩個徽章；顏色同樣跟其他徽章一樣集中寫在這裡。
  if (code === 'GM') {
    return {
      className: 'records-option-badge records-option-badge-gm',
      title: t('records.badge_gm_title'),
      desc: t('records.badge_gm_desc'),
    };
  }
  if (code === 'R') {
    return {
      className: 'records-option-badge records-option-badge-purple',
      title: t('records.badge_random_position_title'),
      desc: t('records.badge_random_position_desc'),
    };
  }
  // 2026-10-19 新增：T（TRIP 驗證）原本只有房間頁村子資訊徽章列有專屬的
  // buildTripBadge() 處理，對戰紀錄列表那邊沒有對應的 case，點進來會落到最下面
  // 的 fallback（沒有顏色、title/desc 直接顯示代碼本身）。補上這個 case 之後，
  // 兩邊都能透過同一個 optionBadgeMeta('T') 拿到完整樣式跟說明文字，不用再各自
  // 維護一份 T 徽章的特例。
  if (code === 'T') {
    return {
      className: 'records-option-badge village-settings-badge-trip-on',
      title: t('room.info.badge_trip_title'),
      desc: t('room.info.badge_trip_on_desc'),
    };
  }
  return {
    className: 'records-option-badge',
    title: code,
    desc: code,
  };
}

// 2026-10-19 新增：單一真相來源的「設定 → 徽章代碼」對照表。房間頁村子資訊徽章列
// （villageSettingsBadges.js）跟對戰紀錄列表（records.js）都呼叫 buildSettingsBadgeCodes()
// 算出同一份徽章代碼清單，不再各自維護一份容易漏改的 if 判斷式——這正是這次問題的
// 根因：villageSettingsBadges.js 在 2026-10-15 補上 GM／R 兩個徽章時，記得改了房間頁，
// 但 records.js（跟它背後的後端 API）是完全另一套邏輯（解析一段拼接成人類可讀句子的
// 文字），沒有人記得同步更新，導致對戰紀錄列表一直少兩個徽章。
// 傳入的 settings 可以是房間物件（room，房間頁用）或對戰紀錄的 game_settings 物件
// （records.js 用），兩邊欄位名稱本來就一致，可以直接共用。未來要新增一個新設定的
// 徽章，只需要在這份清單裡加一筆項目，房間頁跟對戰紀錄列表就會同時自動顯示，不用再
// 分別去改兩個地方。
const SETTINGS_BADGE_DEFS = [
  { code: 'T', when: (s) => Boolean(s.require_trip) },
  { code: 'GM', when: (s) => Boolean(s.gm_enabled) },
  { code: 'B', when: (s) => expansionModeToCardFlags(s.expansion_mode).useBasic },
  { code: 'E', when: (s) => expansionModeToCardFlags(s.expansion_mode).useExtend },
  { code: 'G', when: (s) => Boolean(s.enable_initial_green_card) },
  { code: 'C', when: (s) => Boolean(s.enable_neutral_chaos_mode) },
  { code: 'U', when: (s) => Boolean(s.enable_badge_unique_character_select) },
  { code: 'R', when: (s) => Boolean(s.enable_random_initial_position) },
];

export function buildSettingsBadgeCodes(settings) {
  const s = settings || {};
  return SETTINGS_BADGE_DEFS
    .filter((def) => {
      try {
        return Boolean(def.when(s));
      } catch {
        return false;
      }
    })
    .map((def) => def.code);
}

// data-village-badge／data-badge-title／data-badge-desc 是房間頁村子資訊徽章列
// （bindVillageSettingsBadgePopover）在用的彈窗屬性，data-option-badge／
// data-option-title／data-option-desc 是對戰紀錄列表（bindOptionBadgePopover）
// 在用的——兩邊點擊彈窗的邏輯本來就各自獨立（彈窗 id、容器不同），這裡為了讓
// 兩邊都能直接沿用各自原本的彈窗邏輯、不用跟著重寫，乾脆兩組屬性都加上去，
// 徽章本身的清單跟內容才是這次真正要統一的部分。
function badgeButtonHtml({ code, className, title, desc, display }) {
  const label = String(display ?? code);
  return `<button type="button" class="${className}" data-village-badge="${code}" data-option-badge="${code}" data-badge-title="${title}" data-option-title="${title}" data-badge-desc="${desc}" data-option-desc="${desc}" aria-label="${title}" title="${title}">${label}</button>`;
}

// 2026-10-19 新增：把原本只存在於 villageSettingsBadges.js 的這兩個 HTML 組裝函式
// 搬到這裡集中維護，records.js 跟房間頁現在呼叫的是同一份，不是各自長得很像卻又
// 各自獨立的兩份程式碼。
export function buildToggleBadge(code) {
  const meta = optionBadgeMeta(code);
  return badgeButtonHtml({ code, className: meta.className, title: meta.title, desc: meta.desc, display: code });
}

export function buildTimeoutBadge(settings) {
  const minutes = Number((settings || {}).turn_timeout_minutes || 3);
  const title = t('room.info.badge_timeout_title');
  const desc = t('room.info.badge_timeout_desc_fmt', { n: minutes });
  return badgeButtonHtml({
    code: 'TIMEOUT',
    className: 'records-option-badge village-settings-badge-timeout',
    title,
    desc,
    display: t('room.info.badge_timeout_display_fmt', { n: minutes }),
  });
}

// 彈出說明視窗的定位：預設置中對齊觸發它的徽章正下方，但手機窄螢幕上徽章靠近畫面邊緣時，
// 直接置中會讓視窗一部分超出畫面、文字被截斷看不到（例如最左邊的 T 徽章）。這裡量出視窗
// 實際寬度後，把左右邊界夾回可視範圍內（左右各留 8px 邊距）；records.js 跟房間頁村子資訊
// 徽章列都共用這份定位邏輯，不要各自維護一份又漏改其中一邊。
export function positionOptionPopover(pop, sourceRect) {
  const halfWidth = pop.offsetWidth / 2;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const center = sourceRect.left + (sourceRect.width / 2);
  const minCenter = 8 + halfWidth;
  const maxCenter = viewportWidth - 8 - halfWidth;
  const left = Math.min(Math.max(center, minCenter), Math.max(minCenter, maxCenter));
  pop.style.left = `${left}px`;
  pop.style.top = `${Math.max(8, sourceRect.bottom + 8)}px`;
}
