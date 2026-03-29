import { apiFetch } from './utils.js';

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

export const STATIC_AVATAR_OPTIONS = AVATAR_NAMES.map((name, index) => {
  const id = index + 1;
  return {
    id,
    name,
    // 現有頭像色碼已固化於資料結構；新頭像可由上傳者直接提供 color。
    color: AVATAR_COLORS[index] || '#9aa4ad',
    imageSrc: `./assets/avatars/${id}.gif`,
  };
});

export const AVATAR_OPTIONS = STATIC_AVATAR_OPTIONS;

export const AVATAR_PAGE_SIZE = 100;

let avatarCatalog = [...STATIC_AVATAR_OPTIONS];

function normalizeAvatarOption(raw) {
  const id = Number(raw?.id || 0);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    name: String(raw?.name || '').trim() || `Avatar ${id}`,
    color: String(raw?.color || '#9aa4ad') || '#9aa4ad',
    imageSrc: String(raw?.imageSrc || raw?.image_src || `./assets/avatars/${id}.gif`),
    isCustom: Boolean(raw?.isCustom),
  };
}

function mergeCatalog(extraAvatars = []) {
  const byId = new Map();
  [...STATIC_AVATAR_OPTIONS, ...extraAvatars]
    .map(normalizeAvatarOption)
    .filter(Boolean)
    .forEach((avatar) => {
      byId.set(Number(avatar.id), avatar);
    });
  return Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
}

export function getAvatarOptions() {
  return avatarCatalog.slice();
}

export function getAvatarById(id) {
  return avatarCatalog.find((item) => Number(item.id) === Number(id)) || STATIC_AVATAR_OPTIONS[0] || null;
}

export function getAvatarColorById(id) {
  return String(getAvatarById(id)?.color || '#222');
}

export function getAvatarImageSrcById(id) {
  return String(getAvatarById(id)?.imageSrc || `./assets/avatars/${Number(id || 1)}.gif`);
}

export async function loadAvatarCatalog() {
  try {
    const response = await apiFetch('/api/avatar_catalog', { cache: 'no-store' });
    if (!response.ok) throw new Error(`avatar catalog http ${response.status}`);
    const data = await response.json();
    avatarCatalog = mergeCatalog(Array.isArray(data?.avatars) ? data.avatars : []);
  } catch {
    avatarCatalog = mergeCatalog([]);
  }
  return getAvatarOptions();
}

export function addUploadedAvatar(avatar) {
  avatarCatalog = mergeCatalog([avatar, ...avatarCatalog]);
  return getAvatarOptions();
}
