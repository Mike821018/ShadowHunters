export function bindStageTurnControls({
  el,
  state,
  rollDiceFromCenter,
  runStageNextStep,
  updateStageNextStepButtonState,
}) {
  const diceCenter = document.querySelector('.stage-center-badges');
  if (diceCenter instanceof HTMLElement) {
    diceCenter.setAttribute('role', 'button');
    diceCenter.setAttribute('tabindex', '0');
    diceCenter.setAttribute('aria-label', '擲骰');
    diceCenter.addEventListener('click', () => {
      rollDiceFromCenter();
    });
    diceCenter.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      rollDiceFromCenter();
    });
  }

  const stageNextButton = el.stageNextStepButton;
  if (stageNextButton instanceof HTMLButtonElement) {
    stageNextButton.addEventListener('click', () => {
      runStageNextStep();
    });
  }

  updateStageNextStepButtonState(state);
}
