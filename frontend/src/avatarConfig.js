export const AVATAR_NAMES = [
  '明灰',
  '暗灰',
  '黄色',
  'オレンジ',
  '赤',
  '水色',
  '青',
  '緑',
  '紫',
  'さくら色',
];

export const AVATAR_COLORS = [
  '#dcdedc',
  '#848284',
  '#fcfe04',
  '#fc8244',
  '#fc0204',
  '#84dafc',
  '#0402fc',
  '#04fe04',
  '#fc02fc',
  '#fcd6fc',
];

export const AVATAR_OPTIONS = AVATAR_NAMES.map((name, index) => {
  const id = index + 1;
  return {
    id,
    name,
    // 現有頭像色碼已固化於資料結構；新頭像可由上傳者直接提供 color。
    color: AVATAR_COLORS[index] || '#9aa4ad',
    imageSrc: `./assets/avatars/${id}.gif`,
  };
});

export const AVATAR_PAGE_SIZE = 100;
