// 玩家顏色代號採用跟顏色本身無關的通用代號 Color1~Color9（2026-10-03 從直接對應顏色
// 的舊代號 White/Black/... 改過來），避免以後又出現「代號名稱」跟「實際顏色」對不上的
// 狀況；backend/room_manager.py 的 PLAYER_COLORS 需要維持同樣的順序。
export const PLAYER_COLORS = ['Color1', 'Color2', 'Color3', 'Color4', 'Color5', 'Color6', 'Color7', 'Color8', 'Color9'];

export const PLAYER_COLOR_HEX = {
  Color1: '#9d174d', // 原本的白色，原本 #f0f0f0 太淺跟黑色分不清楚，改成玫紅色
  Color2: '#444444', // 原本的黑色
  Color3: '#e74c3c', // 原本的紅色
  Color4: '#3498db', // 原本的藍色
  Color5: '#f1c40f', // 原本的黃色
  Color6: '#2ecc71', // 原本的綠色
  Color7: '#9b59b6', // 原本的紫色
  Color8: '#e67e22', // 原本的橘色
  Color9: '#4338ca', // 原本的灰色，原本 #a0a0a0 太容易跟黑色混淆，改成靛藍色
};

// 離開房間的路人（已經不在目前玩家名單裡），聊天室／系統訊息裡統一用這個顏色標示。
export const DEPARTED_PLAYER_COLOR_HEX = '#78716c';

// GM（村長之上的管理身分，尚未實作）專用顏色，先保留起來跟玩家顏色區分。
export const GM_COLOR_HEX = '#0e7490';

export const STATUS_TEXT = {
  0: 'Waiting',
  1: 'Start',
  2: 'Move',
  3: 'Area',
  4: 'Attack',
  5: 'Damage',
  6: 'End',
};

export const AREA_NAMES = [
  "Hermit's Cabin",
  'Underworld Gate',
  'Church',
  'Cemetery',
  'Weird Woods',
  'Erstwhile Altar',
];

export const DAMAGE_TRACK_VALUES = Array.from({ length: 15 }, (_, index) => index);

export const DAMAGE_ROLE_MARKERS = [
  { camp: 'Shadow', initial: 'W', hp: 14 },
  { camp: 'Shadow', initial: 'V', hp: 13 },
  { camp: 'Shadow', initial: 'U', hp: 11 },
  { camp: 'Hunter', initial: 'G', hp: 14 },
  { camp: 'Hunter', initial: 'F', hp: 12 },
  { camp: 'Hunter', initial: 'E', hp: 10 },
  { camp: 'Civilian', initial: 'D', hp: 13 },
  { camp: 'Civilian', initial: 'C', hp: 11 },
  { camp: 'Civilian', initial: 'B', hp: 10 },
  { camp: 'Civilian', initial: 'A', hp: 8 },
];
