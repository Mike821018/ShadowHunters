const DISCARD_PILE_COLOR_LABEL_KEY = {
  White: 'room.active_card.color_white',
  Black: 'room.active_card.color_black',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createDiscardPileDetailHelpers({ t, getLocalizedCardName, getAnchor, setAnchor }) {
  const positionDiscardPileDetail = (panelEl, anchorEl) => {
    if (!(panelEl instanceof HTMLElement) || !(anchorEl instanceof HTMLElement)) return;
    const rect = anchorEl.getBoundingClientRect();
    const panelWidth = Math.min(300, window.innerWidth - 24);
    let left = rect.right + 12;
    let top = rect.top - 8;
    if (left + panelWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.left - panelWidth - 12);
    }
    const estimatedHeight = 220;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    }
    panelEl.style.left = `${Math.round(left)}px`;
    panelEl.style.top = `${Math.round(top)}px`;
  };

  const closeDiscardPileDetail = () => {
    const panelEl = document.getElementById('stageDiscardDetail');
    if (!(panelEl instanceof HTMLElement) || panelEl.hidden) return;
    setAnchor(null);
    panelEl.hidden = true;
    document.querySelectorAll('[data-pile-type="discard"].is-active').forEach((cardEl) => cardEl.classList.remove('is-active'));
  };

  const openDiscardPileDetail = ({ color, discardCards, anchorEl } = {}) => {
    const panelEl = document.getElementById('stageDiscardDetail');
    const nameEl = document.getElementById('stageDiscardDetailName');
    const listEl = document.getElementById('stageDiscardDetailList');
    if (!(panelEl instanceof HTMLElement) || !nameEl || !listEl) return;

    // 2026-10-13：棄牌堆清單只給白卡／黑卡用，綠卡是非公開資訊，不透過這個面板顯示，
    // 呼叫端（stageInteractions.js）本來就只會在點白卡/黑卡棄牌堆時呼叫這裡，這裡再擋
    // 一次 color 白名單，雙重保險。
    const normalizedColor = color === 'White' || color === 'Black' ? color : '';
    if (!normalizedColor) return;

    const labelKey = DISCARD_PILE_COLOR_LABEL_KEY[normalizedColor];
    const colorLabel = labelKey ? t(labelKey) : normalizedColor;
    nameEl.textContent = t('room.discard_pile.title', { color: colorLabel });

    const counts = new Map();
    (Array.isArray(discardCards) ? discardCards : []).forEach((card) => {
      const rawName = String(card?.name || '').trim();
      if (!rawName) return;
      counts.set(rawName, (counts.get(rawName) || 0) + 1);
    });

    if (counts.size === 0) {
      listEl.innerHTML = `<p class="stage-discard-detail-empty">${escapeHtml(t('room.discard_pile.empty'))}</p>`;
    } else {
      const rows = Array.from(counts.entries())
        .map(([rawName, count]) => ({ rawName, count, displayName: getLocalizedCardName(rawName) }))
        .sort((a, b) => a.rawName.localeCompare(b.rawName))
        .map(({ displayName, count }) => {
          const countText = count > 1 ? `×${count}` : '';
          return `<li class="stage-discard-detail-item"><span class="stage-discard-detail-item-name">${escapeHtml(displayName)}</span><span class="stage-discard-detail-item-count">${escapeHtml(countText)}</span></li>`;
        })
        .join('');
      listEl.innerHTML = `<ul class="stage-discard-detail-list-inner">${rows}</ul>`;
    }

    setAnchor(anchorEl instanceof HTMLElement ? anchorEl : null);
    panelEl.hidden = false;
    document.querySelectorAll('[data-pile-type="discard"]').forEach((cardEl) => {
      const sameColor = String(cardEl.getAttribute('data-card-color') || '').toLowerCase() === normalizedColor.toLowerCase();
      cardEl.classList.toggle('is-active', sameColor);
    });
    const activeAnchor = getAnchor();
    if (activeAnchor) positionDiscardPileDetail(panelEl, activeAnchor);
  };

  return {
    positionDiscardPileDetail,
    closeDiscardPileDetail,
    openDiscardPileDetail,
  };
}
