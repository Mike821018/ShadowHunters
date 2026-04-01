import { t } from './i18n.js';
import { PLAYER_COLORS, PLAYER_COLOR_HEX } from './constants.js';
import { getCharacterLocalizedName, getCharacterTooltipInfo, getCurrentUiLang } from './characterInfo.js';
import { getAvatarColorById, getAvatarImageSrcById } from './avatarConfig.js';
import { apiFetch } from './utils.js';

function colorHex(color) {
  return PLAYER_COLOR_HEX[color] || '#cccccc';
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

function getLocalizedAreaName(areaName, lang) {
  const rawName = String(areaName || '').trim();
  if (!rawName) return '-';
  const localized = AREA_LOCALIZED_NAMES[rawName];
  return localized?.[lang] || localized?.zh || rawName;
}

export function createToast(el) {
  return function toast(message, type = 'success') {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.className = `toast show ${type}`;
    setTimeout(() => {
      if (el.toast) el.toast.className = 'toast';
    }, 2200);
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
  const players = data?.players || {};
  const targetAccountSet = new Set(Array.isArray(targetAccounts) ? targetAccounts : []);
  const currentAccount = data?.turn?.current_account || null;
  const roomStatus = Number(data?.room?.room_status || 0);
  const selfAccount = state?.account || null;
  const actionOrder = Array.isArray(data?.action_order) ? data.action_order : [];
  const orderIndex = new Map(actionOrder.map((acc, idx) => [String(acc), idx]));
  const inGameOrder = Number(data?.room?.room_status || 0) >= 2 && orderIndex.size > 0;
  const winnerSet = new Set(Array.isArray(data?.winners) ? data.winners.map((value) => String(value || '').trim()).filter(Boolean) : []);
  const entries = Object.entries(players).sort(([accA, a], [accB, b]) => {
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
        p.is_ready ? 'ready' : '',
        targetAccountSet.has(account) ? targetPromptClass : '',
        account === currentAccount ? 'current-turn' : '',
      ]
        .filter(Boolean)
        .join(' ');

      const isSelf = Boolean(selfAccount && account === selfAccount);
      const isWinner = winnerSet.has(String(account || '').trim());
      const canPickColor = isSelf && roomStatus === 1 && !p.is_ready && typeof onColorChange === 'function';
      const resolvedCharacter = String(p.character || p.character_name || '').trim();
      const hasKnownRole = Boolean(resolvedCharacter);
      const roleNameEn = hasKnownRole ? resolvedCharacter : (isSelf ? p.self_character : null);
      const roleCamp = hasKnownRole ? p.character_camp : (isSelf ? p.self_character_camp : null);
      const hpVisible = isSelf || hasKnownRole;
      const lang = getCurrentUiLang();
      const areaDisplayName = getLocalizedAreaName(p.area, lang);
      const roleDisplayName = roleNameEn ? getCharacterLocalizedName(roleNameEn, lang) : '???';
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
        ? `<a class="player-trip-link" href="./resident_register.html?trip=${encodedTrip}&profileTab=nicknames">${esc(tripDisplayText)}</a>`
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

      let colorControlHtml = `<span class="color-chip-static" style="background:${cardColor}" title="${esc(p.color || 'N/A')}"></span>`;
      if (canPickColor) {
        const swatches = PLAYER_COLORS.map((c) => {
          const taken = Object.entries(players).some(([acc, pl]) => acc !== account && pl.color === c);
          const selected = p.color === c;
          return `<button class="color-swatch${selected ? ' selected' : ''}${taken ? ' taken' : ''}" type="button" data-pick-color="${c}" style="background:${colorHex(c)}" title="${c}" aria-pressed="${selected}"${taken ? ' disabled' : ''}></button>`;
        }).join('');
        colorControlHtml = `
          <div class="color-picker" data-color-picker>
            <button class="color-chip-trigger" type="button" style="background:${cardColor}" title="${esc(t('ui.color_picker_label'))}" aria-label="${esc(t('ui.color_picker_label'))}" aria-expanded="false"></button>
            <div class="color-picker-row" role="group" aria-label="${esc(t('ui.color_picker_label'))}" hidden>${swatches}</div>
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
            <span>📍 ${esc(areaDisplayName)}</span>
          </div>
          <div class="player-card-meta-role">
            <div class="player-role-info">
              <button class="player-role-trigger" type="button" aria-label="${esc(t('ui.role_detail'))}">
                ${roleNameEn ? `<span class="damage-meter-badge ${esc(roleCampClass)} player-role-badge">${esc(roleBadgeText)}</span>` : ''}
                <span class="player-role-name">${esc(roleDisplayName)}</span>
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

  if (view === 'room') {
    const minVisibleSlots = 8;
    const seatCards = entries.map(renderCard);
    while (seatCards.length < minVisibleSlots) {
      seatCards.push('<div class="seat-empty">-</div>');
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
  }

  if (typeof onPlayerCardClick === 'function') {
    container.querySelectorAll('[data-player-account]').forEach((card) => {
      card.addEventListener('click', (event) => {
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
