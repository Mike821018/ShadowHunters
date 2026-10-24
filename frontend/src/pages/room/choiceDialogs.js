function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function showAreaChoiceDialog({ el, title, message, hurtLabel, healLabel, cancelLabel }) {
  return new Promise((resolve) => {
    const dialog = el.areaChoiceDialog;
    if (!(dialog instanceof HTMLDialogElement)) {
      resolve('Cancel');
      return;
    }

    if (el.areaChoiceTitle) el.areaChoiceTitle.textContent = title;
    if (el.areaChoiceMessage) el.areaChoiceMessage.textContent = message;
    if (el.areaChoiceHurtButton) el.areaChoiceHurtButton.textContent = hurtLabel;
    if (el.areaChoiceHealButton) el.areaChoiceHealButton.textContent = healLabel;
    if (el.areaChoiceCancelButton) el.areaChoiceCancelButton.textContent = cancelLabel;

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.areaChoiceHurtButton?.removeEventListener('click', onHurt);
      el.areaChoiceHealButton?.removeEventListener('click', onHeal);
      el.areaChoiceCancelButton?.removeEventListener('click', onCancelClick);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close('Cancel');
    };
    const onClose = () => finish(dialog.returnValue || 'Cancel');
    const onHurt = () => dialog.close('Hurt');
    const onHeal = () => dialog.close('Heal');
    const onCancelClick = () => dialog.close('Cancel');

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.areaChoiceHurtButton?.addEventListener('click', onHurt);
    el.areaChoiceHealButton?.addEventListener('click', onHeal);
    el.areaChoiceCancelButton?.addEventListener('click', onCancelClick);
    dialog.showModal();
  });
}

export function showEquipmentChoiceDialog({ el, title, message, options, cancelLabel }) {
  return new Promise((resolve) => {
    const dialog = el.equipmentChoiceDialog;
    const optionsHost = el.equipmentChoiceOptions;
    const normalizedOptions = (Array.isArray(options) ? options : [])
      .map((option) => {
        if (option && typeof option === 'object') {
          return {
            value: String(option.value || '').trim(),
            label: String(option.label || option.value || '').trim(),
          };
        }
        const value = String(option || '').trim();
        return { value, label: value };
      })
      .filter((option) => option.value);
    if (!(dialog instanceof HTMLDialogElement) || !(optionsHost instanceof HTMLElement)) {
      resolve('');
      return;
    }

    if (el.equipmentChoiceTitle) el.equipmentChoiceTitle.textContent = title;
    if (el.equipmentChoiceMessage) el.equipmentChoiceMessage.textContent = message;
    if (el.equipmentChoiceCancelButton) el.equipmentChoiceCancelButton.textContent = cancelLabel;
    optionsHost.innerHTML = normalizedOptions
      .map((option) => `<button class="equipment-choice-option" type="button" data-equipment-choice="${escapeAttr(option.value)}" aria-label="${escapeAttr(option.label)}">${escapeHtml(option.label)}</button>`)
      .join('');

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.equipmentChoiceCancelButton?.removeEventListener('click', onCancelClick);
      optionsHost.querySelectorAll('[data-equipment-choice]').forEach((button) => {
        button.removeEventListener('click', onOptionClick);
      });
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close('');
    };
    const onClose = () => finish(dialog.returnValue || '');
    const onCancelClick = () => dialog.close('');
    const onOptionClick = (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      dialog.close(String(target.getAttribute('data-equipment-choice') || ''));
    };

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.equipmentChoiceCancelButton?.addEventListener('click', onCancelClick);
    optionsHost.querySelectorAll('[data-equipment-choice]').forEach((button) => {
      button.addEventListener('click', onOptionClick);
    });
    dialog.showModal();
  });
}

export function showGreenChoiceDialog({
  el,
  title,
  message,
  activateLabel,
  skipLabel,
  // 2026-10-19 新增：謎（Unknown）收到搶裝備類綠卡時需要「交出裝備／扣血／不發動
  // （照原本判定走）」三個互斥的實際決定，外加一個真正的「取消、先不決定」——原本
  // 只有 activate/skip/cancel 三顆按鈕，把「不發動」硬塞進 cancel 的位置，導致玩家
  // 沒辦法單純關掉視窗、之後再重新確認（見 room.js 呼叫端的修正註解）。這裡新增一顆
  // 獨立的 noActivate 按鈕，cancel 則恢復成單純的「先不決定」語意（回傳空字串）。
  noActivateLabel,
  cancelLabel,
  currentChoice = '',
  showActivate = true,
  showSkip = true,
  showNoActivate = false,
  cancelReturnsValue = '',
}) {
  return new Promise((resolve) => {
    const dialog = el.greenChoiceDialog;
    const allowActivate = Boolean(showActivate);
    const allowSkip = Boolean(showSkip);
    const allowNoActivate = Boolean(showNoActivate);
    if (!allowActivate && !allowSkip && !allowNoActivate) {
      resolve('');
      return;
    }
    const normalizedCurrent = String(currentChoice || '').trim().toLowerCase();
    const defaultSelection = normalizedCurrent === 'effect2'
      ? 'skip'
      : normalizedCurrent === 'effect1'
        ? 'activate'
        : normalizedCurrent;

    if (!(dialog instanceof HTMLDialogElement)) {
      resolve('');
      return;
    }

    if (el.greenChoiceTitle) el.greenChoiceTitle.textContent = title;
    if (el.greenChoiceMessage) el.greenChoiceMessage.textContent = message;
    if (el.greenChoiceActivateButton) {
      el.greenChoiceActivateButton.textContent = activateLabel;
      el.greenChoiceActivateButton.hidden = !allowActivate;
      el.greenChoiceActivateButton.disabled = !allowActivate;
    }
    if (el.greenChoiceSkipButton) {
      el.greenChoiceSkipButton.textContent = skipLabel;
      el.greenChoiceSkipButton.hidden = !allowSkip;
      el.greenChoiceSkipButton.disabled = !allowSkip;
    }
    if (el.greenChoiceNoActivateButton) {
      el.greenChoiceNoActivateButton.textContent = noActivateLabel || '';
      el.greenChoiceNoActivateButton.hidden = !allowNoActivate;
      el.greenChoiceNoActivateButton.disabled = !allowNoActivate;
    }
    if (el.greenChoiceCancelButton) el.greenChoiceCancelButton.textContent = cancelLabel;

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.greenChoiceActivateButton?.removeEventListener('click', onActivate);
      el.greenChoiceSkipButton?.removeEventListener('click', onSkip);
      el.greenChoiceNoActivateButton?.removeEventListener('click', onNoActivate);
      el.greenChoiceCancelButton?.removeEventListener('click', onCancelClick);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close(cancelReturnsValue);
    };
    const onClose = () => finish(dialog.returnValue || '');
    const onActivate = () => dialog.close('activate');
    const onSkip = () => dialog.close('skip');
    const onNoActivate = () => dialog.close('no_activate');
    const onCancelClick = () => dialog.close(cancelReturnsValue);

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.greenChoiceActivateButton?.addEventListener('click', onActivate);
    el.greenChoiceSkipButton?.addEventListener('click', onSkip);
    el.greenChoiceNoActivateButton?.addEventListener('click', onNoActivate);
    el.greenChoiceCancelButton?.addEventListener('click', onCancelClick);
    dialog.showModal();
  });
}

export function showConfirmDialog({
  el,
  title,
  message,
  confirmLabel,
  cancelLabel,
}) {
  return new Promise((resolve) => {
    const dialog = el.confirmDialog;
    if (!(dialog instanceof HTMLDialogElement)) {
      resolve(false);
      return;
    }

    if (el.confirmDialogTitle) el.confirmDialogTitle.textContent = title;
    if (el.confirmDialogMessage) el.confirmDialogMessage.textContent = message;
    if (el.confirmDialogConfirmButton) el.confirmDialogConfirmButton.textContent = confirmLabel;
    if (el.confirmDialogCancelButton) el.confirmDialogCancelButton.textContent = cancelLabel;

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.confirmDialogConfirmButton?.removeEventListener('click', onConfirm);
      el.confirmDialogCancelButton?.removeEventListener('click', onCancelClick);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close('cancel');
    };
    const onClose = () => finish(dialog.returnValue === 'confirm');
    const onConfirm = () => dialog.close('confirm');
    const onCancelClick = () => dialog.close('cancel');

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.confirmDialogConfirmButton?.addEventListener('click', onConfirm);
    el.confirmDialogCancelButton?.addEventListener('click', onCancelClick);
    dialog.showModal();
  });
}
export function showGmPlayerAdjustDialog({
  el,
  title,
  message,
  isAlive,
  isRevealed,
  currentDamage,
  maxHp,
  boomLabel,
  revealLabel,
  unrevealLabel,
  discardEquipmentLabel,
  giveEquipmentLabel,
  hasEquipment,
  canGiveEquipment,
  hpLabel,
  hpApplyLabel,
  cancelLabel,
}) {
  return new Promise((resolve) => {
    const dialog = el.gmPlayerAdjustDialog;
    if (!(dialog instanceof HTMLDialogElement)) {
      resolve(null);
      return;
    }

    if (el.gmPlayerAdjustTitle) el.gmPlayerAdjustTitle.textContent = title;
    if (el.gmPlayerAdjustMessage) el.gmPlayerAdjustMessage.textContent = message;
    if (el.gmPlayerAdjustBoomButton) {
      el.gmPlayerAdjustBoomButton.textContent = boomLabel;
      el.gmPlayerAdjustBoomButton.hidden = !isAlive;
    }
    if (el.gmPlayerAdjustRevealButton) {
      el.gmPlayerAdjustRevealButton.textContent = revealLabel;
      el.gmPlayerAdjustRevealButton.hidden = Boolean(isRevealed);
    }
    if (el.gmPlayerAdjustUnrevealButton) {
      el.gmPlayerAdjustUnrevealButton.textContent = unrevealLabel;
      el.gmPlayerAdjustUnrevealButton.hidden = !isAlive || !isRevealed;
    }
    // 2026-10-22 新增：GM 裝備管理——丟棄裝備只在玩家還活著且身上至少有一件裝備時顯示；
    // 給予裝備只在玩家還活著、且牌庫／棄牌堆至少還有一件可給的裝備卡時顯示。
    if (el.gmPlayerAdjustDiscardEquipmentButton) {
      el.gmPlayerAdjustDiscardEquipmentButton.textContent = discardEquipmentLabel;
      el.gmPlayerAdjustDiscardEquipmentButton.hidden = !isAlive || !hasEquipment;
    }
    if (el.gmPlayerAdjustGiveEquipmentButton) {
      el.gmPlayerAdjustGiveEquipmentButton.textContent = giveEquipmentLabel;
      el.gmPlayerAdjustGiveEquipmentButton.hidden = !isAlive || !canGiveEquipment;
    }
    if (el.gmPlayerAdjustHpLabel) el.gmPlayerAdjustHpLabel.textContent = hpLabel;
    if (el.gmPlayerAdjustHpApplyButton) el.gmPlayerAdjustHpApplyButton.textContent = hpApplyLabel;
    if (el.gmPlayerAdjustCancelButton) el.gmPlayerAdjustCancelButton.textContent = cancelLabel;
    if (el.gmPlayerAdjustHpInput) {
      const normalizedMax = Number.isFinite(maxHp) ? Math.max(0, Math.trunc(maxHp)) : null;
      const normalizedCurrent = Number.isFinite(currentDamage) ? Math.max(0, Math.trunc(currentDamage)) : 0;
      el.gmPlayerAdjustHpInput.min = '0';
      if (normalizedMax !== null) el.gmPlayerAdjustHpInput.max = String(normalizedMax);
      el.gmPlayerAdjustHpInput.value = String(normalizedCurrent);
    }

    const parseResult = (raw) => {
      const text = String(raw || '').trim();
      if (!text) return null;
      if (text.startsWith('adjust_hp:')) {
        const value = Number(text.slice('adjust_hp:'.length));
        if (!Number.isFinite(value)) return null;
        return { action: 'adjust_hp', value: Math.trunc(value) };
      }
      if (
        text === 'boom' ||
        text === 'reveal' ||
        text === 'unreveal' ||
        text === 'discard_equipment' ||
        text === 'give_equipment'
      ) {
        return { action: text };
      }
      return null;
    };

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.gmPlayerAdjustBoomButton?.removeEventListener('click', onBoom);
      el.gmPlayerAdjustRevealButton?.removeEventListener('click', onReveal);
      el.gmPlayerAdjustUnrevealButton?.removeEventListener('click', onUnreveal);
      el.gmPlayerAdjustDiscardEquipmentButton?.removeEventListener('click', onDiscardEquipment);
      el.gmPlayerAdjustGiveEquipmentButton?.removeEventListener('click', onGiveEquipment);
      el.gmPlayerAdjustHpApplyButton?.removeEventListener('click', onHpApply);
      el.gmPlayerAdjustCancelButton?.removeEventListener('click', onCancelClick);
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close('');
    };
    const onClose = () => finish(parseResult(dialog.returnValue || ''));
    const onCancelClick = () => dialog.close('');
    const onBoom = () => dialog.close('boom');
    const onReveal = () => dialog.close('reveal');
    const onUnreveal = () => dialog.close('unreveal');
    const onDiscardEquipment = () => dialog.close('discard_equipment');
    const onGiveEquipment = () => dialog.close('give_equipment');
    const onHpApply = () => {
      const raw = Number(el.gmPlayerAdjustHpInput?.value);
      if (!Number.isFinite(raw)) return;
      dialog.close(`adjust_hp:${Math.trunc(raw)}`);
    };

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.gmPlayerAdjustBoomButton?.addEventListener('click', onBoom);
    el.gmPlayerAdjustRevealButton?.addEventListener('click', onReveal);
    el.gmPlayerAdjustUnrevealButton?.addEventListener('click', onUnreveal);
    el.gmPlayerAdjustDiscardEquipmentButton?.addEventListener('click', onDiscardEquipment);
    el.gmPlayerAdjustGiveEquipmentButton?.addEventListener('click', onGiveEquipment);
    el.gmPlayerAdjustHpApplyButton?.addEventListener('click', onHpApply);
    el.gmPlayerAdjustCancelButton?.addEventListener('click', onCancelClick);
    dialog.showModal();
  });
}

export function showGmCharacterChoiceDialog({ el, title, message, groups, cancelLabel }) {
  return new Promise((resolve) => {
    const dialog = el.gmCharacterChoiceDialog;
    const optionsHost = el.gmCharacterChoiceOptions;
    const normalizeChoiceOption = (option) => {
      if (option && typeof option === 'object') {
        return {
          value: String(option.value || '').trim(),
          label: String(option.label || option.value || '').trim(),
        };
      }
      const value = String(option || '').trim();
      return { value, label: value };
    };
    const normalizedGroups = (Array.isArray(groups) ? groups : [])
      .map((group) => ({
        camp: String(group?.camp || '').trim(),
        label: String(group?.label || '').trim(),
        options: (Array.isArray(group?.options) ? group.options : [])
          .map(normalizeChoiceOption)
          .filter((option) => option.value),
      }))
      .filter((group) => group.options.length);
    if (!(dialog instanceof HTMLDialogElement) || !(optionsHost instanceof HTMLElement)) {
      resolve('');
      return;
    }

    if (el.gmCharacterChoiceTitle) el.gmCharacterChoiceTitle.textContent = title;
    if (el.gmCharacterChoiceMessage) el.gmCharacterChoiceMessage.textContent = message;
    if (el.gmCharacterChoiceCancelButton) el.gmCharacterChoiceCancelButton.textContent = cancelLabel;
    optionsHost.innerHTML = normalizedGroups
      .map((group) => `<div class="gm-character-choice-group" data-camp="${escapeAttr(group.camp)}"><div class="gm-character-choice-group-label">${escapeHtml(group.label)}</div><div class="equipment-choice-options gm-character-choice-group-options">${group.options
        .map((option) => `<button class="equipment-choice-option" type="button" data-gm-character-choice="${escapeAttr(option.value)}" aria-label="${escapeAttr(option.label)}">${escapeHtml(option.label)}</button>`)
        .join('')}</div></div>`)
      .join('');

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.gmCharacterChoiceCancelButton?.removeEventListener('click', onCancelClick);
      optionsHost.querySelectorAll('[data-gm-character-choice]').forEach((button) => {
        button.removeEventListener('click', onOptionClick);
      });
    };
    const finish = (value) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const onCancel = (event) => {
      event.preventDefault();
      dialog.close('');
    };
    const onClose = () => finish(dialog.returnValue || '');
    const onCancelClick = () => dialog.close('');
    const onOptionClick = (event) => {
      const target = event.currentTarget;
      if (!(target instanceof HTMLElement)) return;
      dialog.close(String(target.getAttribute('data-gm-character-choice') || ''));
    };

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.gmCharacterChoiceCancelButton?.addEventListener('click', onCancelClick);
    optionsHost.querySelectorAll('[data-gm-character-choice]').forEach((button) => {
      button.addEventListener('click', onOptionClick);
    });
    dialog.showModal();
  });
}
