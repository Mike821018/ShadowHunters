export function createAppState() {
  const rawPage = document.body?.dataset?.page || 'lobby';
  return {
    roomId: null,
    account: '',
    roomAccounts: {},
    transportMode: 'auto',
    skipTargetConfirm: false,
    autoEndTurn: true,
    // 2026-11-11 新增：手機版快速選取玩家列點頭像時，先彈出完整卡片還是直接動作（見
    // ui.js 的 renderMobilePlayerQuickBar／room.js 的 openOccupantCardPopup）。Mike 要求
    // 預設開啟（先彈出完整卡片），要改回直接動作可以在房間頁的「自動更新」設定關掉。
    quickAvatarPopupFirst: true,
    eventSeq: 0,
    avatarPage: 1,
    page: rawPage,
  };
}
