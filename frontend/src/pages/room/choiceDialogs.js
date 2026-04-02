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
  cancelLabel,
  currentChoice = '',
  showActivate = true,
  showSkip = true,
  cancelReturnsValue = '',
}) {
  return new Promise((resolve) => {
    const dialog = el.greenChoiceDialog;
    const allowActivate = Boolean(showActivate);
    const allowSkip = Boolean(showSkip);
    if (!allowActivate && !allowSkip) {
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
    if (el.greenChoiceCancelButton) el.greenChoiceCancelButton.textContent = cancelLabel;

    let settled = false;
    const cleanup = () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      el.greenChoiceActivateButton?.removeEventListener('click', onActivate);
      el.greenChoiceSkipButton?.removeEventListener('click', onSkip);
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
    const onCancelClick = () => dialog.close(cancelReturnsValue);

    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    el.greenChoiceActivateButton?.addEventListener('click', onActivate);
    el.greenChoiceSkipButton?.addEventListener('click', onSkip);
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