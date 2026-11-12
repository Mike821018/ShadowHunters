const EQUIPMENT_CARD_COLORS = {
  Talisman: 'white',
  'Fortune Brooch': 'white',
  'Mystic Compass': 'white',
  'Holy Robe': 'white',
  'Silver Rosary': 'white',
  'Spear of Longinus': 'white',
  Chainsaw: 'black',
  'Butcher Knife': 'black',
  'Rusted Broad Axe': 'black',
  Masamune: 'black',
  'Machine Gun': 'black',
  Handgun: 'black',
};

const EQUIPMENT_CARD_ICONS = {
  Talisman: '🔮',
  'Fortune Brooch': '💠',
  'Mystic Compass': '🧭',
  'Holy Robe': '🧥',
  'Silver Rosary': '📿',
  'Spear of Longinus': '🗡️',
  Chainsaw: '⚙️',
  'Butcher Knife': '🔪',
  'Rusted Broad Axe': '🪓',
  Masamune: '⚔️',
  'Machine Gun': '🔫',
  Handgun: '🎯',
};

export function createCardInfoHelpers({ t, getAnchor, setAnchor }) {
  const getLocalizedCardName = (cardNameEnglish) => {
    const rawName = String(cardNameEnglish || '').trim();
    if (!rawName) return '';
    const key = `room.active_card.names.${rawName}`;
    const localized = t(key);
    return localized && localized !== key ? localized : rawName;
  };

  const localizeEquipmentOption = (option) => {
    const rawName = String(option || '').trim();
    if (!rawName) {
      return { value: '', label: '' };
    }
    return {
      value: rawName,
      label: getLocalizedCardName(rawName),
    };
  };

  const getEquipmentDisplayLabel = (equipmentName) => {
    const rawName = String(equipmentName || '').trim();
    if (!rawName) return '';
    const icon = EQUIPMENT_CARD_ICONS[rawName] || '🎴';
    const localizedName = getLocalizedCardName(rawName);
    return `${icon} ${localizedName}`;
  };

  const positionCardInfoDialog = (dialogEl, anchorEl) => {
    if (!(dialogEl instanceof HTMLDialogElement) || !(anchorEl instanceof HTMLElement)) return;
    const rect = anchorEl.getBoundingClientRect();
    const panelWidth = Math.min(300, window.innerWidth - 24);
    let left = rect.right + 12;
    let top = rect.top - 8;
    if (left + panelWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.left - panelWidth - 12);
    }
    const estimatedHeight = 190;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    }
    dialogEl.style.left = `${Math.round(left)}px`;
    dialogEl.style.top = `${Math.round(top)}px`;
  };

  const closeCardInfoDialog = () => {
    const dialogEl = document.getElementById('activeCardDialog');
    if (!(dialogEl instanceof HTMLDialogElement) || !dialogEl.open) return;
    setAnchor(null);
    dialogEl.close();
  };

  const showCardInfoDialog = ({ cardNameEnglish, cardType = 'Action', cardColor = '', anchorEl = null } = {}) => {
    const dialogEl = document.getElementById('activeCardDialog');
    const nameEl = document.getElementById('activeCardDialogName');
    const typeEl = document.getElementById('activeCardDialogType');
    const descEl = document.getElementById('activeCardDialogDesc');
    const rawName = String(cardNameEnglish || '').trim();
    if (!rawName) return;

    const displayName = getLocalizedCardName(rawName) || t('room.active_card.hidden');
    let typeText = '';
    if (String(cardType || '').trim().toLowerCase() === 'equipment') {
      typeText = t('room.active_card.type_equipment');
    } else {
      typeText = t('room.active_card.type_action');
    }
    const normalizedColor = String(cardColor || '').trim().toLowerCase();
    if (normalizedColor) {
      const colorKey = normalizedColor === 'green' ? 'color_green' : normalizedColor === 'white' ? 'color_white' : normalizedColor === 'black' ? 'color_black' : '';
      if (colorKey) typeText = [t(`room.active_card.${colorKey}`), typeText].filter(Boolean).join(' · ');
    }
    const descKey = `room.active_card.desc.${rawName}`;
    const description = t(descKey);
    const descText = description && description !== descKey ? description : t('room.active_card.no_desc');

    if (!(dialogEl instanceof HTMLDialogElement)) {
      window.alert(`${displayName}\n${typeText}\n\n${descText}`);
      return;
    }

    if (nameEl instanceof HTMLElement) nameEl.textContent = displayName;
    if (typeEl instanceof HTMLElement) typeEl.textContent = typeText;
    if (descEl instanceof HTMLElement) descEl.textContent = descText;
    setAnchor(anchorEl instanceof HTMLElement ? anchorEl : null);
    if (!dialogEl.open) dialogEl.show();
    const activeAnchor = getAnchor();
    if (activeAnchor) positionCardInfoDialog(dialogEl, activeAnchor);
  };

  const openEquipmentCardDialog = (equipmentName, anchorEl = null) => {
    const rawName = String(equipmentName || '').trim();
    if (!rawName) return;
    showCardInfoDialog({
      cardNameEnglish: rawName,
      cardType: 'Equipment',
      cardColor: EQUIPMENT_CARD_COLORS[rawName] || '',
      anchorEl,
    });
  };

  const openInvulnerabilityInfoDialog = (source, anchorEl = null) => {
    const dialogEl = document.getElementById('activeCardDialog');
    const nameEl = document.getElementById('activeCardDialogName');
    const typeEl = document.getElementById('activeCardDialogType');
    const descEl = document.getElementById('activeCardDialogDesc');

    const normalized = String(source || '').trim();
    const normalizedKey = normalized.toLowerCase();
    let sourceName = '';
    let sourceDesc = '';
    if (normalizedKey === 'guardian angel' || normalizedKey === 'guardian_angel') {
      sourceName = getLocalizedCardName('Guardian Angel');
      sourceDesc = t('room.invulnerability_source.guardian_angel_desc');
    } else if (normalizedKey === 'gregor' || normalizedKey === 'gregor ability' || normalizedKey === 'character ability') {
      sourceName = t('room.invulnerability_source.Gregor');
      sourceDesc = t('room.invulnerability_source.gregor_desc');
    } else {
      sourceName = normalized || t('room.invulnerability_source.unknown');
      sourceDesc = t('room.invulnerability_source.unknown_desc');
    }

    if (!(dialogEl instanceof HTMLDialogElement)) {
      window.alert(t('room.invulnerability_source.message', { name: sourceName, source: sourceDesc }));
      return;
    }

    if (nameEl instanceof HTMLElement) nameEl.textContent = sourceName;
    if (typeEl instanceof HTMLElement) typeEl.textContent = t('room.invulnerability_source.title');
    if (descEl instanceof HTMLElement) descEl.textContent = sourceDesc;
    setAnchor(anchorEl instanceof HTMLElement ? anchorEl : null);
    if (!dialogEl.open) dialogEl.show();
    const activeAnchor = getAnchor();
    if (activeAnchor) positionCardInfoDialog(dialogEl, activeAnchor);
  };

  // 2026-11-12 新增：角色說明原本是卡片上滑過/點擊展開的 CSS 小視窗（.player-role-popover），
  // 現在改成跟裝備卡、護盾說明一樣，點擊後重用同一個 #activeCardDialog 浮動視窗顯示——
  // 這樣角色名稱、陣營、勝利條件、能力說明都有足夠寬度顯示，不用再塞在玩家卡片本身
  // 有限的寬度裡（這也是英文版「(Revealed)」字樣在彈窗玩家卡片裡超框的根本解法：
  // 資訊直接搬出卡片，不再跟卡片寬度搶位置）。勝利條件／能力兩段用空行隔開放進
  // description 欄位，靠 .active-card-dialog-desc 新增的 white-space: pre-line 保留換行。
  const openRoleInfoDialog = ({ name, camp, win, ability, revealLabel, anchorEl = null } = {}) => {
    const dialogEl = document.getElementById('activeCardDialog');
    const nameEl = document.getElementById('activeCardDialogName');
    const typeEl = document.getElementById('activeCardDialogType');
    const descEl = document.getElementById('activeCardDialogDesc');
    const displayName = String(name || '').trim();
    if (!displayName) return;
    const typeText = [String(camp || '').trim(), String(revealLabel || '').trim()].filter(Boolean).join(' · ');
    const descText = [
      String(win || '').trim() ? `${t('ui.role_win')} ${String(win).trim()}` : '',
      String(ability || '').trim() ? `${t('ui.role_ability')} ${String(ability).trim()}` : '',
    ].filter(Boolean).join('\n\n');

    if (!(dialogEl instanceof HTMLDialogElement)) {
      window.alert([displayName, typeText, '', descText].filter(Boolean).join('\n'));
      return;
    }

    if (nameEl instanceof HTMLElement) nameEl.textContent = displayName;
    if (typeEl instanceof HTMLElement) typeEl.textContent = typeText;
    if (descEl instanceof HTMLElement) descEl.textContent = descText || t('room.active_card.no_desc');
    setAnchor(anchorEl instanceof HTMLElement ? anchorEl : null);
    if (!dialogEl.open) dialogEl.show();
    const activeAnchor = getAnchor();
    if (activeAnchor) positionCardInfoDialog(dialogEl, activeAnchor);
  };

  return {
    getLocalizedCardName,
    localizeEquipmentOption,
    getEquipmentDisplayLabel,
    positionCardInfoDialog,
    closeCardInfoDialog,
    showCardInfoDialog,
    openEquipmentCardDialog,
    openInvulnerabilityInfoDialog,
    openRoleInfoDialog,
  };
}