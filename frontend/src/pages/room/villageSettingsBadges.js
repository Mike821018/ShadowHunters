import { expansionModeToCardFlags, optionBadgeMeta, positionOptionPopover } from './roomSettingsBadges.js';

// 房間頁「村子資訊」區塊的設定徽章列：把原本一整串文字（TRIP:關 / 卡組:[B]+[E] / ...）
// 改成一排小徽章，點擊可以看到完整說明；手機版尤其吃緊的空間因此省下不少。
// 徽章代碼盡量跟 records.js（對戰紀錄列表）已經在用的 G/C/U/B/E 保持一致，避免同一個
// app 裡出現兩套不同的徽章語彙。
// 2026-10-09 修正：Mike 反映原本未啟用（灰色）的徽章也會顯示出來，畫面太雜、灰色徽章
// 看起來像壞掉或沒意義；改成只顯示目前有效的設定（TRIP 開啟、卡組 B/E、綠卡/中立亂鬥/
// 徽章唯一有開），沒開的項目直接不顯示，暴斃時間本身是數值不是開關，維持固定顯示。

function badgeButtonHtml({ code, className, title, desc, display }) {
  const label = String(display ?? code);
  return `<button type="button" class="${className}" data-village-badge="${code}" data-badge-title="${title}" data-badge-desc="${desc}" aria-label="${title}" title="${title}">${label}</button>`;
}

function buildTripBadge({ t }) {
  const title = t('room.info.badge_trip_title');
  const desc = t('room.info.badge_trip_on_desc');
  return badgeButtonHtml({
    code: 'T',
    className: 'records-option-badge village-settings-badge-trip-on',
    title,
    desc,
    display: 'T',
  });
}

function buildTimeoutBadge({ t }, room) {
  const minutes = Number(room?.turn_timeout_minutes || 3);
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

function buildToggleBadge(code) {
  const meta = optionBadgeMeta(code);
  return badgeButtonHtml({ code, className: meta.className, title: meta.title, desc: meta.desc, display: code });
}

export function renderVillageSettingsBadges({ t }, room) {
  if (!room) return '';
  const expansionMode = String(room.expansion_mode || 'all');
  const { useBasic, useExtend } = expansionModeToCardFlags(expansionMode);
  const initialGreen = Boolean(room.enable_initial_green_card);
  const neutralChaos = Boolean(room.enable_neutral_chaos_mode);
  const badgeUnique = Boolean(room.enable_badge_unique_character_select);
  const requireTrip = Boolean(room.require_trip);

  const badges = [];
  if (requireTrip) badges.push(buildTripBadge({ t }));
  if (useBasic) badges.push(buildToggleBadge('B'));
  if (useExtend) badges.push(buildToggleBadge('E'));
  if (initialGreen) badges.push(buildToggleBadge('G'));
  if (neutralChaos) badges.push(buildToggleBadge('C'));
  if (badgeUnique) badges.push(buildToggleBadge('U'));
  badges.push(buildTimeoutBadge({ t }, room));

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
