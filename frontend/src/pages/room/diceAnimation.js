export function createDiceAnimationSystem({
  getDiceRollInterval,
  setDiceRollInterval,
  getDiceRollTimeout,
  setDiceRollTimeout,
  getDiceRollAnimating,
  setDiceRollAnimating,
  onRenderStateRequired,
}) {
  const DICE_ANIMATION_DURATION_MS = 900;
  const DICE_ANIMATION_TICK_MS = 70;

  function normalizeDiceValue(value, sides) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 1;
    return Math.max(1, Math.min(sides, Math.round(n)));
  }

  function getTableDiceElements() {
    const root = document;
    const d6El = root.getElementById('stageDiceD6');
    const d4El = root.getElementById('stageDiceD4');
    const badgeWrap = root.querySelector('.stage-center-badges');
    return { d6El, d4El, badgeWrap };
  }

  function setTableDiceDisplay(d6, d4) {
    const { d6El, d4El } = getTableDiceElements();
    if (!d6El || !d4El) return;
    d6El.textContent = String(d6);
    d4El.textContent = String(d4);
    d6El.setAttribute('aria-label', `六面骰 ${d6}`);
    d4El.parentElement?.setAttribute('aria-label', `四面骰 ${d4}`);
  }

  function getTableDiceDisplay() {
    const { d6El, d4El } = getTableDiceElements();
    const currentD6 = normalizeDiceValue(d6El?.textContent, 6);
    const currentD4 = normalizeDiceValue(d4El?.textContent, 4);
    return { currentD6, currentD4 };
  }

  function clearDiceAnimation() {
    const interval = getDiceRollInterval();
    if (interval) {
      window.clearInterval(interval);
      setDiceRollInterval(null);
    }
    const timeout = getDiceRollTimeout();
    if (timeout) {
      window.clearTimeout(timeout);
      setDiceRollTimeout(null);
    }
    setDiceRollAnimating(false);
    const { badgeWrap } = getTableDiceElements();
    badgeWrap?.classList.remove('is-rolling');
  }

  function waitDiceAnimationComplete() {
    return new Promise((resolve) => {
      window.setTimeout(resolve, DICE_ANIMATION_DURATION_MS);
    });
  }

  function playDiceAnimation(finalD6, finalD4, mode = 'both') {
    clearDiceAnimation();
    setDiceRollAnimating(true);
    const { badgeWrap } = getTableDiceElements();
    badgeWrap?.classList.add('is-rolling');
    const { currentD6, currentD4 } = getTableDiceDisplay();
    const animateD6 = mode === 'both' || mode === 'd6';
    const animateD4 = mode === 'both' || mode === 'd4';

    const interval = window.setInterval(() => {
      const randomD6 = animateD6 ? 1 + Math.floor(Math.random() * 6) : currentD6;
      const randomD4 = animateD4 ? 1 + Math.floor(Math.random() * 4) : currentD4;
      setTableDiceDisplay(randomD6, randomD4);
    }, DICE_ANIMATION_TICK_MS);
    setDiceRollInterval(interval);

    const timeout = window.setTimeout(() => {
      clearDiceAnimation();
      const displayD6 = animateD6 ? finalD6 : currentD6;
      const displayD4 = animateD4 ? finalD4 : currentD4;
      setTableDiceDisplay(displayD6, displayD4);
    }, DICE_ANIMATION_DURATION_MS);
    setDiceRollTimeout(timeout);
  }

  function getAbilityDiceAnimationMode(characterName) {
    const normalized = String(characterName || '').trim();
    if (normalized === 'Franklin') return 'd6';
    if (normalized === 'George') return 'd4';
    return '';
  }

  function getCardDiceAnimationMeta(cardName) {
    const normalized = String(cardName || '').trim();
    if (normalized === 'Blessing') {
      return { labelKey: 'room.table_next_step.roll_heal_dice', mode: 'd6' };
    }
    if (normalized === 'Spiritual Doll') {
      return { labelKey: 'room.table_next_step.roll_damage_dice', mode: 'd6' };
    }
    if (normalized === 'Dynamite') {
      return { labelKey: 'room.table_next_step.roll_area_dice', mode: 'both' };
    }
    return null;
  }

  function renderTableDice(data) {
    const d6 = normalizeDiceValue(data?.dice?.D6, 6);
    const d4 = normalizeDiceValue(data?.dice?.D4, 4);
    if (getDiceRollAnimating()) return;
    setTableDiceDisplay(d6, d4);
  }

  function setPendingDiceAction(action, latestRoomSnapshot) {
    if (onRenderStateRequired) {
      onRenderStateRequired(action || null, latestRoomSnapshot);
    }
  }

  return {
    DICE_ANIMATION_DURATION_MS,
    DICE_ANIMATION_TICK_MS,
    normalizeDiceValue,
    getTableDiceElements,
    setTableDiceDisplay,
    getTableDiceDisplay,
    clearDiceAnimation,
    waitDiceAnimationComplete,
    playDiceAnimation,
    getAbilityDiceAnimationMode,
    getCardDiceAnimationMeta,
    renderTableDice,
    setPendingDiceAction,
  };
}
