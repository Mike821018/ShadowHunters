export function bindStageInteractions({
  state,
  getLatestRoomSnapshot,
  getPendingAbilityActivation,
  getMoveAreaPromptState,
  getAbilityAreaPromptState,
  moveToPromptArea,
  selectAbilityAreaTarget,
  drawCardFromPile,
  openActiveCardDialog,
}) {
  const tableStage = document.querySelector('.table-stage');
  if (!(tableStage instanceof HTMLElement)) return;

  tableStage.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('.stage-field-number')) return;

    const latestRoomSnapshot = getLatestRoomSnapshot();
    const activeCardEl = event.target instanceof Element ? event.target.closest('#activeCardDisplay') : null;
    if (activeCardEl instanceof HTMLElement) {
      const cardName = String(latestRoomSnapshot?.active_card_display?.name || '').trim();
      if (cardName) {
        event.preventDefault();
        event.stopPropagation();
        openActiveCardDialog();
      }
      return;
    }

    const pileCard = event.target instanceof Element ? event.target.closest('[data-pile-type="deck"][data-card-color]') : null;
    if (pileCard instanceof HTMLElement) {
      const colorKey = String(pileCard.getAttribute('data-card-color') || '').toLowerCase();
      const color = colorKey === 'green' ? 'Green' : colorKey === 'white' ? 'White' : colorKey === 'black' ? 'Black' : '';
      if (color) {
        event.preventDefault();
        event.stopPropagation();
        drawCardFromPile(color);
        return;
      }
    }

    const moveFieldCard = event.target instanceof Element ? event.target.closest('[data-field-slot]') : null;
    if (moveFieldCard instanceof HTMLElement) {
      const slot = Number(moveFieldCard.getAttribute('data-field-slot'));
      const field = Array.isArray(latestRoomSnapshot?.fields) ? latestRoomSnapshot.fields[slot] : null;
      const areaName = String(field?.name || '').trim();
      if (areaName) {
        const movePrompt = getMoveAreaPromptState(state);
        if (movePrompt.active && movePrompt.areaNames.includes(areaName)) {
          event.preventDefault();
          event.stopPropagation();
          moveToPromptArea(areaName);
          return;
        }
      }
    }

    const pendingAbilityActivation = getPendingAbilityActivation();
    if (!pendingAbilityActivation || pendingAbilityActivation.targetType !== 'area') return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const abilityFieldCard = target.closest('[data-field-slot]');
    if (!(abilityFieldCard instanceof HTMLElement)) return;
    event.preventDefault();
    event.stopPropagation();
    const slot = Number(abilityFieldCard.getAttribute('data-field-slot'));
    const field = Array.isArray(latestRoomSnapshot?.fields) ? latestRoomSnapshot.fields[slot] : null;
    const areaName = String(field?.name || '').trim();
    const abilityAreaPrompt = getAbilityAreaPromptState(state);
    if (areaName && abilityAreaPrompt.active && abilityAreaPrompt.areaNames.includes(areaName)) {
      selectAbilityAreaTarget(areaName);
    }
  }, true);

  tableStage.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (!(target instanceof Element)) return;

    const latestRoomSnapshot = getLatestRoomSnapshot();
    const moveFieldCardByKey = target.closest('[data-field-slot]');
    if (moveFieldCardByKey instanceof HTMLElement) {
      const slot = Number(moveFieldCardByKey.getAttribute('data-field-slot'));
      const field = Array.isArray(latestRoomSnapshot?.fields) ? latestRoomSnapshot.fields[slot] : null;
      const areaName = String(field?.name || '').trim();
      const movePrompt = getMoveAreaPromptState(state);
      if (areaName && movePrompt.active && movePrompt.areaNames.includes(areaName)) {
        event.preventDefault();
        event.stopPropagation();
        moveToPromptArea(areaName);
        return;
      }
      const pendingAbilityActivation = getPendingAbilityActivation();
      if (pendingAbilityActivation && pendingAbilityActivation.targetType === 'area') {
        const abilityAreaPrompt = getAbilityAreaPromptState(state);
        if (areaName && abilityAreaPrompt.active && abilityAreaPrompt.areaNames.includes(areaName)) {
          event.preventDefault();
          event.stopPropagation();
          selectAbilityAreaTarget(areaName);
          return;
        }
      }
    }

    const activeCardEl = target.closest('#activeCardDisplay');
    if (!(activeCardEl instanceof HTMLElement)) return;
    const cardName = String(latestRoomSnapshot?.active_card_display?.name || '').trim();
    if (!cardName) return;
    event.preventDefault();
    event.stopPropagation();
    openActiveCardDialog();
  });
}
