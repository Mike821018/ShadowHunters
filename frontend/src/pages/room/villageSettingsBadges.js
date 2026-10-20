import { positionOptionPopover, buildSettingsBadgeCodes, buildToggleBadge, buildTimeoutBadge } from './roomSettingsBadges.js';

// 房間頁「村子資訊」區塊的設定徽章列：把原本一整串文字（TRIP:關 / 卡組:[B]+[E] / ...）
// 改成一排小徽章，點擊可以看到完整說明；手機版尤其吃緊的空間因此省下不少。
// 徽章代碼盡量跟 records.js（對戰紀錄列表）已經在用的 G/C/U/B/E 保持一致，避免同一個
// app 裡出現兩套不同的徽章語彙。
// 2026-10-09 修正：Mike 反映原本未啟用（灰色）的徽章也會顯示出來，畫面太雜、灰色徽章
// 看起來像壞掉或沒意義；改成只顯示目前有效的設定（TRIP 開啟、卡組 B/E、綠卡/中立亂鬥/
// 徽章唯一有開），沒開的項目直接不顯示，暴斃時間本身是數值不是開關，維持固定顯示。
// 2026-10-19 修正：原本這裡自己維護一份「room 欄位 → 徽章」的 if 判斷式（T/GM/B/E/G/C/U/R），
// 跟 records.js 的對戰紀錄列表各自獨立判讀，2026-10-15 補 GM／R 徽章時這裡記得改了、
// records.js 那邊卻漏掉，Mike 發現對戰紀錄列表「沒有把所有的徽章都放上去」。改成呼叫
// roomSettingsBadges.js 共用的 buildSettingsBadgeCodes()／buildToggleBadge()／
// buildTimeoutBadge()，這裡跟 records.js 現在是同一份判讀邏輯，未來要加新設定的徽章，
// 只需要改 roomSettingsBadges.js 那份清單，兩邊會自動一起更新。
export function renderVillageSettingsBadges({ t }, room) {
  if (!room) return '';
  const badgeCodes = buildSettingsBadgeCodes(room);
  const badges = badgeCodes.map((code) => buildToggleBadge(code));
  badges.push(buildTimeoutBadge(room));
  return `<span class="records-option-wrap village-settings-badges">${badges.join('')}</span>`;
}

export function bindVillageSettingsBadgePopover(host) {
  if (!host) return;
  host.querySelectorAll('[data-village-badge]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      const source = event.currentTarget;
      if (!(source instanceof HTMLElement)) return;
      const existing = document.getElementById('villageSettingsBadgePopover');
      if (existing) existing.remove();

      const title = String(source.getAttribute('data-badge-title') || '').trim();
      const desc = String(source.getAttribute('data-badge-desc') || '').trim();
      const pop = document.createElement('div');
      pop.id = 'villageSettingsBadgePopover';
      pop.className = 'records-option-popover';
      pop.innerHTML = `<strong>${title}</strong><p>${desc}</p>`;
      document.body.appendChild(pop);

      positionOptionPopover(pop, source.getBoundingClientRect());

      window.setTimeout(() => {
        const close = (ev) => {
          const target = ev.target;
          if (target instanceof Element && (target.closest('#villageSettingsBadgePopover') || target.closest('[data-village-badge]'))) return;
          pop.remove();
          window.removeEventListener('click', close, true);
        };
        window.addEventListener('click', close, true);
      }, 0);
    });
  });
}
