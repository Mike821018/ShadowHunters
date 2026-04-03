const HIGU_EMOJI_BASE_PATH = '/assets/emoji/higu';

export const HIGU_CHAT_EMOJIS = [
  { code: '[擦汗]', filename: 'b01.gif' },
  { code: '[:p]', filename: 'b02.gif' },
  { code: '[ˋ^^ˊ]', filename: 'b03.gif' },
  { code: '[..><..]', filename: 'b04.gif' },
  { code: '[o><o]', filename: 'b05.gif' },
  { code: '[ˋvˊ+]', filename: 'b06.gif' },
  { code: '[一_一]', filename: 'b07.gif' },
  { code: '[嘆]', filename: 'b08.gif' },
  { code: '[一_一+]', filename: 'b09.gif' },
  { code: '[@@]', filename: 'b10.gif' },
  { code: '[搖頭]', filename: 'b11.gif' },
  { code: '[寒]', filename: 'b13.gif' },
  { code: '[881]', filename: 'b17.gif' },
  { code: '[^v^]', filename: 'b32.gif' },
  { code: '[ˊoˋ]', filename: 'b18.gif' },
  { code: '[ˊˋ]', filename: 'b12.gif' },
  { code: '[= =]', filename: 'b38.gif' },
  { code: '[.....?]', filename: 'b15.gif' },
  { code: '[哼]', filename: 'b20.gif' },
  { code: '[不要]', filename: 'b28.gif' },
  { code: '[怒]', filename: 'b22.gif' },
  { code: '[T^T]', filename: 'b16.gif' },
  { code: '[= =|||]', filename: 'b27.gif' },
  { code: '[縮]', filename: 'b39.gif' },
  { code: '[逃]', filename: 'b49.gif' },
  { code: '[>///<]', filename: 'b21.gif' },
  { code: '[o_o?]', filename: 'b29.gif' },
  { code: '[=ˇ=]', filename: 'b25.gif' },
  { code: '[路過]', filename: 'b35.gif' },
  { code: '[乾杯]', filename: 'b47.gif' },
  { code: '[QB]', filename: 'QB.jpg' },
  { code: '[大鯨]', filename: 'taigei.jpg' },
  { code: '[大鯨失色]', filename: 'taigei2.jpg' },
  { code: '[嚼嚼]', filename: 'akagi.gif' },
  { code: '[問號]', filename: '35.gif' },
  { code: '[鈴谷]', filename: 'sanman.jpg' },
];

const HIGU_EMOJI_BY_CODE = new Map(HIGU_CHAT_EMOJIS.map((emoji) => [emoji.code, emoji]));
const HIGU_EMOJI_PATTERN = new RegExp(
  HIGU_CHAT_EMOJIS
    .map((emoji) => emoji.code)
    .sort((left, right) => right.length - left.length)
    .map((code) => code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|'),
  'g',
);

function buildEmojiImageHtml(emoji, esc) {
  const src = `${HIGU_EMOJI_BASE_PATH}/${emoji.filename}`;
  const alt = esc(emoji.code);
  const title = esc(emoji.code);
  const cls = 'chat-emoji-inline';
  return `<img class="${cls}" src="${src}" alt="${alt}" title="${title}">`;
}

function buildEmojiHtmlFromCode(code, esc) {
  const emoji = HIGU_EMOJI_BY_CODE.get(code);
  if (!emoji) return esc(code);
  return buildEmojiImageHtml(emoji, esc);
}

export function renderChatTextWithEmojis(text, esc) {
  const rawText = String(text || '');
  if (!rawText) return '';
  let result = '';
  let lastIndex = 0;
  rawText.replace(HIGU_EMOJI_PATTERN, (matched, offset) => {
    result += esc(rawText.slice(lastIndex, offset));
    result += buildEmojiHtmlFromCode(matched, esc);
    lastIndex = offset + matched.length;
    return matched;
  });
  result += esc(rawText.slice(lastIndex));
  return result.replace(/\r\n|\r|\n/g, '<br>');
}

export function getEmojiAssetPath(filename) {
  return `${HIGU_EMOJI_BASE_PATH}/${filename}`;
}
