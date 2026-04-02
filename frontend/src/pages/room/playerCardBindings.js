export function bindPlayerCardClickTargets({ el, onPlayerCardClick }) {
  [el.roomCards, el.battleCards].forEach((cardsContainer) => {
    if (!(cardsContainer instanceof HTMLElement)) return;
    cardsContainer.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.player-trip-link')) {
        return;
      }
      if (event.target instanceof Element && event.target.closest('.player-role-trigger, .player-role-name, .player-role-info, .player-role-popover')) {
        return;
      }
      const card = event.target instanceof Element ? event.target.closest('[data-player-account]') : null;
      if (!card) return;
      const account = card.getAttribute('data-player-account');
      if (account) onPlayerCardClick(account);
    });
  });
}
