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
  return {
    className: 'records-option-badge',
    title: code,
    desc: code,
  };
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
