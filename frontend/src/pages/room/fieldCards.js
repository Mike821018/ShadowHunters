function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FIELD_NUMBERS_BY_NAME = Object.freeze({
  "Hermit's Cabin": [2, 3],
  'Underworld Gate': [4, 5],
  Church: [6],
  Cemetery: [8],
  'Weird Woods': [9],
  'Erstwhile Altar': [10],
});

const FIELD_NUMBERS_BY_SLOT = Object.freeze([
  [2, 3],
  [4, 5],
  [6],
  [8],
  [9],
  [10],
]);

const FIELD_AREA_CLASS = Object.freeze({
  "Hermit's Cabin": 'area-name-hermit',
  'Underworld Gate': 'area-name-gate',
  Church: 'area-name-church',
  Cemetery: 'area-name-cemetery',
  'Weird Woods': 'area-name-woods',
  'Erstwhile Altar': 'area-name-altar',
});

function getFieldAreaClass(fieldName) {
  return FIELD_AREA_CLASS[String(fieldName || '').trim()] || '';
}

function normalizeFieldNumbers(field, slot) {
  const rawNumbers = [];
  if (Array.isArray(field?.numbers)) rawNumbers.push(...field.numbers);
  if (Array.isArray(field?.number)) rawNumbers.push(...field.number);

  const parsed = rawNumbers
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .map((value) => Math.trunc(value));

  const deduped = Array.from(new Set(parsed));
  if (deduped.length > 0) return deduped;

  const areaName = String(field?.name || '').trim();
  if (FIELD_NUMBERS_BY_NAME[areaName]) {
    return FIELD_NUMBERS_BY_NAME[areaName].slice();
  }

  if (Number.isInteger(slot) && FIELD_NUMBERS_BY_SLOT[slot]) {
    return FIELD_NUMBERS_BY_SLOT[slot].slice();
  }

  return [];
}

export function renderStageFieldCards({
  data,
  state,
  refs,
  PLAYER_COLOR_HEX,
  getMoveAreaPromptState,
  getAbilityAreaPromptState,
  showOccupantNamePopup,
}) {
  const root = document;
  const cards = Array.from(root.querySelectorAll('.table-stage [data-field-slot]'));
  const detailPanel = root.getElementById('stageFieldDetail');
  const detailName = root.getElementById('stageFieldDetailName');
  const detailNumbers = root.getElementById('stageFieldDetailNumbers');
  const detailDescription = root.getElementById('stageFieldDetailDescription');
  const detailClose = root.getElementById('stageFieldDetailClose');
  const fields = Array.isArray(data?.fields) ? data.fields : [];
  const movePrompt = state ? getMoveAreaPromptState(state, data) : { active: false, areaNames: [] };
  const movePromptSet = new Set((movePrompt.areaNames || []).map((value) => String(value || '').trim()));
  const abilityAreaPrompt = state ? getAbilityAreaPromptState(state, data) : { active: false, areaNames: [] };
  const abilityAreaPromptSet = new Set((abilityAreaPrompt.areaNames || []).map((value) => String(value || '').trim()));
  const occupantsByFieldName = new Map();

  Object.entries(data?.players || {}).forEach(([account, player]) => {
    const areaName = String(player?.area || '').trim();
    if (!areaName) return;
    if (!player?.alive) return;
    const existing = occupantsByFieldName.get(areaName) || [];
    existing.push({
      account,
      name: player?.name || account,
      color: player?.color || '',
      alive: Boolean(player?.alive),
    });
    occupantsByFieldName.set(areaName, existing);
  });

  if (typeof refs.activeFieldSlot === 'number' && !fields[refs.activeFieldSlot]) {
    refs.activeFieldSlot = null;
    refs.activeFieldNumber = null;
  }

  const closeFieldDetail = () => {
    refs.activeFieldSlot = null;
    refs.activeFieldNumber = null;
    if (detailPanel) detailPanel.hidden = true;
    cards.forEach((cardEl) => cardEl.classList.remove('is-active'));
    root.querySelectorAll('.stage-field-number.is-selected').forEach((button) => button.classList.remove('is-selected'));
  };

  const positionDetailPanel = (anchorEl) => {
    if (!detailPanel || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const panelWidth = Math.min(300, window.innerWidth - 24);
    let left = rect.right + 12;
    let top = rect.top - 8;
    if (left + panelWidth > window.innerWidth - 12) {
      left = Math.max(12, rect.left - panelWidth - 12);
    }
    const estimatedHeight = 180;
    if (top + estimatedHeight > window.innerHeight - 12) {
      top = Math.max(12, window.innerHeight - estimatedHeight - 12);
    }
    detailPanel.style.left = `${Math.round(left)}px`;
    detailPanel.style.top = `${Math.round(top)}px`;
  };

  const openFieldDetail = (slot, field, number, anchorEl) => {
    if (!field || !detailPanel || !detailName || !detailNumbers || !detailDescription) return;
    const numbers = normalizeFieldNumbers(field, slot);
    const areaClass = getFieldAreaClass(field?.name);
    refs.activeFieldSlot = slot;
    refs.activeFieldNumber = number;
    detailName.textContent = field.display_name || field.name || '場地資訊';
    detailName.className = areaClass ? areaClass : '';
    detailNumbers.innerHTML = numbers
      .map((value) => `<span class="stage-field-detail-number ${escapeHtml(areaClass)}">${escapeHtml(value)}</span>`)
      .join('');
    detailDescription.textContent = field.description || '目前沒有額外說明。';
    detailDescription.className = 'stage-field-detail-description';
    detailPanel.hidden = false;
    positionDetailPanel(anchorEl);
    cards.forEach((cardEl) => {
      cardEl.classList.toggle('is-active', Number(cardEl.getAttribute('data-field-slot')) === slot);
    });
    root.querySelectorAll('.stage-field-number').forEach((button) => {
      const sameSlot = Number(button.getAttribute('data-field-open')) === slot;
      const sameNumber = Number(button.getAttribute('data-field-number')) === number;
      button.classList.toggle('is-selected', sameSlot && sameNumber);
    });
  };

  if (detailClose) {
    detailClose.onclick = closeFieldDetail;
  }

  if (!refs.fieldDetailOutsideHandlerBound) {
    document.addEventListener('pointerdown', (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('#stageFieldDetail') || target.closest('.stage-field-number')) return;
      closeFieldDetail();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeFieldDetail();
    });
    window.addEventListener('resize', () => {
      if (!detailPanel || detailPanel.hidden) return;
      const activeButton = document.querySelector('.stage-field-number.is-selected');
      if (activeButton instanceof HTMLElement) positionDetailPanel(activeButton);
    });
    refs.fieldDetailOutsideHandlerBound = true;
  }

  cards.forEach((cardEl) => {
    const slot = Number(cardEl.getAttribute('data-field-slot'));
    const field = fields[slot] || null;
    const nameEl = cardEl.querySelector('.stage-field-name');
    const numberListEl = cardEl.querySelector('.stage-field-number-list');
    const occupantsEl = cardEl.querySelector('.stage-field-occupants');
    const displayName = field?.display_name || field?.name || '未翻開';
    const numbers = normalizeFieldNumbers(field, slot);
    const areaClass = getFieldAreaClass(field?.name);
    const occupants = field ? (occupantsByFieldName.get(field.name) || []).slice(0, 8) : [];
    const normalizedAreaName = String(field?.name || '').trim();
    const isMoveTargetPrompt = Boolean(movePrompt.active && normalizedAreaName && movePromptSet.has(normalizedAreaName));
    const isAbilityTargetPrompt = Boolean(abilityAreaPrompt.active && normalizedAreaName && abilityAreaPromptSet.has(normalizedAreaName));
    const isTargetPrompt = isMoveTargetPrompt || isAbilityTargetPrompt;

    cardEl.classList.toggle('is-empty', !field);
    cardEl.classList.toggle('is-active', field && refs.activeFieldSlot === slot);
    cardEl.classList.toggle('move-target-prompt', isTargetPrompt);
    cardEl.setAttribute('aria-label', field ? `場地卡 ${displayName}` : '場地卡 未翻開');

    if (isTargetPrompt) {
      cardEl.setAttribute('role', 'button');
      cardEl.setAttribute('tabindex', '0');
      if (isMoveTargetPrompt) {
        cardEl.setAttribute('aria-label', `可移動到 ${displayName}`);
      } else {
        cardEl.setAttribute('aria-label', `可選擇能力目標 ${displayName}`);
      }
    } else {
      cardEl.removeAttribute('role');
      cardEl.removeAttribute('tabindex');
    }

    if (nameEl) {
      nameEl.textContent = displayName;
    }

    if (numberListEl) {
      if (!field || !numbers.length) {
        numberListEl.innerHTML = `
          <span class="stage-field-number-static" aria-hidden="true">?</span>
        `;
      } else {
        numberListEl.innerHTML = numbers
          .map((number) => `
            <button
              class="stage-field-number ${escapeHtml(areaClass)}"
              type="button"
              data-field-open="${slot}"
              data-field-number="${escapeHtml(number)}"
              aria-label="查看 ${escapeHtml(displayName)} 的 ${escapeHtml(number)} 號說明"
            >${escapeHtml(number)}</button>
          `)
          .join('');

        numberListEl.querySelectorAll('[data-field-open]').forEach((button) => {
          button.addEventListener('click', () => openFieldDetail(slot, field, Number(button.getAttribute('data-field-number')), button));
        });
      }
    }

    if (occupantsEl) {
      const slots = Array.from({ length: 8 }, (_, index) => occupants[index] || null);
      occupantsEl.innerHTML = slots
        .map((occupant) => {
          if (!occupant) return '<span class="stage-field-occupant is-empty" aria-hidden="true"></span>';
          const fill = PLAYER_COLOR_HEX[occupant.color] || '#c9d8e4';
          const border = occupant.color === 'White' ? '#9aa7b2' : 'rgba(0, 0, 0, 0.22)';
          return `<button class="stage-field-occupant" type="button" data-occupant-account="${escapeHtml(occupant.account)}" data-occupant-name="${escapeHtml(occupant.name)}" title="${escapeHtml(`${occupant.name} / ${occupant.color || '-'}`)}" aria-label="查看 ${escapeHtml(occupant.name)}" style="background:${fill}; border-color:${border};"></button>`;
        })
        .join('');
      occupantsEl.querySelectorAll('[data-occupant-account]').forEach((button) => {
        button.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          showOccupantNamePopup(button.getAttribute('data-occupant-name') || '', button);
        });
      });
    }
  });

  if (typeof refs.activeFieldSlot === 'number' && fields[refs.activeFieldSlot]) {
    const activeButton = document.querySelector(`.stage-field-number[data-field-open="${refs.activeFieldSlot}"][data-field-number="${refs.activeFieldNumber}"]`)
      || document.querySelector(`.stage-field-number[data-field-open="${refs.activeFieldSlot}"]`);
    if (activeButton instanceof HTMLElement) {
      const nextNumber = Number(activeButton.getAttribute('data-field-number')) || refs.activeFieldNumber || 0;
      openFieldDetail(refs.activeFieldSlot, fields[refs.activeFieldSlot], nextNumber, activeButton);
    }
  } else if (detailPanel) {
    detailPanel.hidden = true;
  }
}