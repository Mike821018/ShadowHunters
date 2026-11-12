export function bindPlayerCardClickTargets({ el, onPlayerCardClick }) {
  // 2026-11-10 新增：場地卡上點擊玩家 token 彈出的完整卡片（stageOccupantCardPopupBody）
  // 也要走同一套點擊路由（攻擊／能力／卡片目標／GM 改角色），所以跟 roomCards、
  // battleCards 一樣加進這個清單，不用另外重寫一套點擊判斷邏輯。
  // 2026-11-11 新增：手機板遊戲桌面上方的簡化玩家 icon 排（mobilePlayerQuickBar）
  // 同樣加進這個清單，點擊就能直接沿用同一套攻擊／能力／卡片／GM 操作判斷邏輯。
  [el.roomCards, el.battleCards, el.stageOccupantCardPopupBody, el.mobilePlayerQuickBar].forEach((cardsContainer) => {
    if (!(cardsContainer instanceof HTMLElement)) return;
    cardsContainer.addEventListener('click', (event) => {
      if (event.target instanceof Element && event.target.closest('.player-trip-link')) {
        return;
      }
      // 2026-11-12 修正：角色說明改成點擊彈出後，只有「真的有資訊可以顯示」的
      // .player-role-trigger（帶 data-role-info-available，見 ui.js 的點擊處理）
      // 才需要在這裡排除、讓它自己的點擊事件處理（彈出說明視窗）。角色還沒揭露、
      // 沒有資訊可顯示時這顆按鈕原本整個都被排除在外，點了完全沒反應——這正是
      // Mike 回報「偶爾點玩家卡片沒反應、多點幾次才會成功」的另一個成因：點擊剛好
      // 落在角色名稱/狀態這塊區域、又還沒揭露，就會被這裡擋下來，什麼事都不會發生。
      // 現在改成只排除真的有彈窗可開的情況，其餘（角色未揭露）會正常落到下面，跟
      // 點卡片其他地方一樣處理。
      if (event.target instanceof Element && event.target.closest('.player-role-trigger[data-role-info-available]')) {
        return;
      }
      const card = event.target instanceof Element ? event.target.closest('[data-player-account]') : null;
      if (!card) return;
      const account = card.getAttribute('data-player-account');
      if (account) onPlayerCardClick(account);
    });
  });
}
