// 2026-10-19 新增：側欄暴斃倒數、系統訊息面板的倒數、右下角浮動聊天室鏡像的
// 倒數，這三個地方原本各自獨立呼叫 Date.now() 來蓋 data-remain-synced-at 時間戳，
// 間隔通常只有幾毫秒、幾乎不會有肉眼可見的誤差，但 Mike 要求「接到同一個 clock
// 變數」，改成單一真相來源更乾淨、也徹底排除任何潛在誤差。room.js 的
// renderState() 每次重新渲染畫面時，在呼叫 renderVillageInfo／renderChatStage
// 之前先呼叫一次 markRenderSyncedAt()，兩邊渲染邏輯都改成讀
// getRenderSyncedAtMs() 而不是各自呼叫 Date.now()，確保三個地方蓋的時間戳記
// 完全相同，room.js 裡那個每秒 tick 一次的本機倒數計時器算出來的秒數也就一定
// 一致。

let currentSyncedAtMs = Date.now();

export function markRenderSyncedAt(ms = Date.now()) {
  currentSyncedAtMs = Number.isFinite(ms) ? ms : Date.now();
}

export function getRenderSyncedAtMs() {
  return currentSyncedAtMs;
}
