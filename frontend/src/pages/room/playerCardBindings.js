export function bindPlayerCardClickTargets({ el, onPlayerCardClick }) {
  // 2026-11-10 新增：場地卡上點擊玩家 token 彈出的完整卡片（stageOccupantCardPopupBody）
  // 也要走同一套點擊路由（攻擊／能力／卡片目標／GM 改角色），所以跟 roomCards、
  // battleCards 一樣加進這個清單，不用另外重寫一套點擊判斷邏輯。
  [el.roomCards, el.battleCards, el.stageOccupantCardPopupBody].forEach((cardsContainer) => {
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
