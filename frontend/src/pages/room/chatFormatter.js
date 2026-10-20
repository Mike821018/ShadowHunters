import { renderChatTextWithEmojis } from './chatEmoji.js';
import { PLAYER_COLOR_HEX, DEPARTED_PLAYER_COLOR_HEX } from '../../constants.js';
import { getCharacterInfo } from '../../characterInfo.js';
import { getRenderSyncedAtMs } from './renderClock.js';

export function buildChatStageLines({
  messages,
  data,
  state,
  esc,
  t,
  isReplayView,
  getCurrentUiLang,
  getCharacterLocalizedName,
  getLocalizedCardName,
}) {
  const lang = getCurrentUiLang();
  const AREA_NAMES = {
    "Hermit's Cabin": { zh: '隱士小屋', en: "Hermit's Cabin", jp: '隠者の庵' },
    Church: { zh: '教堂', en: 'Church', jp: '教会' },
    Cemetery: { zh: '墓園', en: 'Cemetery', jp: '墓地' },
    'Underworld Gate': { zh: '時空之門', en: 'Underworld Gate', jp: '冥界の門' },
    'Weird Woods': { zh: '希望與絕望的森林', en: 'Weird Woods', jp: '希望と絶望の森' },
    'Erstwhile Altar': { zh: '古代祭壇', en: 'Erstwhile Altar', jp: '古の祭壇' },
  };

  const CARD_COLORS = {
    Green: { zh: '綠卡', en: 'Green', jp: '緑カード' },
    White: { zh: '白卡', en: 'White', jp: '白カード' },
    Black: { zh: '黑卡', en: 'Black', jp: '黒カード' },
  };

  const GREEN_CARD_SOURCE_NAMES = new Set([
    'Aid', 'Anger', 'Blackmail', 'Bully', 'Exorcism', 'Greed', 'Huddle',
    'Nurturance', 'Prediction', 'Slap', 'Spell', 'Tough Lesson',
  ]);

  const EQUIPMENT_CARD_NAMES = new Set([
    'Talisman', 'Fortune Brooch', 'Mystic Compass', 'Holy Robe', 'Silver Rosary', 'Spear of Longinus',
    'Chainsaw', 'Butcher Knife', 'Rusted Broad Axe', 'Masamune', 'Machine Gun', 'Handgun',
  ]);

  // 把玩家選的顏色轉成在聊天室白色背景上也看得清楚的文字顏色：顏色太亮（例如黃色）
  // 時會往黑色方向調暗一些，其他顏色基本維持原樣，盡量保留 Mike 原本選的那個顏色。
  // （原本白色、灰色這兩個沒有色相的顏色調暗後會跟黑色混淆，這裡一度加過例外表處理；
  // 後來直接把 constants.js 裡白色、灰色的色碼本身換成玫紅色／靛藍色，色塊選取列跟這裡
  // 都會用新顏色，不需要再另外處理，所以把例外表拿掉了。）
  const toReadableTextHex = (hex) => {
    const match = /^#([0-9a-fA-F]{6})$/.exec(String(hex || '').trim());
    if (!match) return hex;
    const r = parseInt(match[1].slice(0, 2), 16);
    const g = parseInt(match[1].slice(2, 4), 16);
    const b = parseInt(match[1].slice(4, 6), 16);
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (luma <= 0.6) return hex;
    const darkenFactor = Math.min(0.75, ((luma - 0.6) / 0.4) * 0.75);
    const scale = 1 - darkenFactor;
    const toHex = (value) => Math.max(0, Math.round(value * scale)).toString(16).padStart(2, '0');
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  // 目前玩家（有開場後選的顏色）回傳對應的可讀文字顏色；已經離開房間、不在目前玩家
  // 名單裡的帳號，統一回傳「路人」顏色，不特別分辨是誰。
  const getPlayerLabelColor = (account) => {
    const acc = String(account || '').trim();
    if (!acc) return null;
    const player = data?.players?.[acc];
    if (!player) return DEPARTED_PLAYER_COLOR_HEX;
    const hex = PLAYER_COLOR_HEX[player.color];
    return hex ? toReadableTextHex(hex) : null;
  };

  const fmtTime = (ts) => {
    const d = new Date((ts || 0) * 1000);
    return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
  };

  const fmtDate = (ts) => {
    const d = new Date((ts || 0) * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${fmtTime(ts)}`;
  };

  const decodeHtml = (value) => {
    const text = document.createElement('textarea');
    text.innerHTML = String(value || '');
    return text.value;
  };

  const getDisplayNameByLabel = (label) => String(label || '').trim();

  const playerEntries = Object.entries(data?.players || {});
  const viewerAccount = String(state?.account || '').trim();
  const roomStatus = Number(data?.room?.room_status || 0);
  const isGameFinished = roomStatus === 3;
  const showRoleInSystemMessages = isGameFinished || isReplayView;
  const replayRoleByName = data?.replay_role_by_name && typeof data.replay_role_by_name === 'object'
    ? data.replay_role_by_name
    : {};
  const replayRoleByAccount = data?.replay_role_by_account && typeof data.replay_role_by_account === 'object'
    ? data.replay_role_by_account
    : {};
  const initialGreenCardBySource = new Map();
  const initialGreenCardByTarget = new Map();

  const pidPlain = (name, accountHint = '') => {
    const rawName = decodeHtml(name);
    const rawHint = decodeHtml(accountHint);
    // accountHint 如果剛好是目前真的在房間裡的帳號（例如勝利者清單那種情境），優先用它；
    // 否則照原本的方式用名字去反查帳號（多數系統訊息只有名字，沒有真正的帳號可用）。
    const hintedAccount = String(rawHint || '').trim();
    const resolvedAccount = (hintedAccount && data?.players?.[hintedAccount]) ? hintedAccount : resolveAccountByLabel(rawName);
    const colorHex = resolvedAccount ? getPlayerLabelColor(resolvedAccount) : DEPARTED_PLAYER_COLOR_HEX;
    const styleAttr = colorHex ? ` style="color:${colorHex}"` : '';
    return `<span class="chat-pid"${styleAttr}>${esc(getDisplayNameByLabel(rawName))}</span>`;
  };

  const resolveAccountByLabel = (label) => {
    const normalized = String(label || '').trim();
    if (!normalized) return '';
    const byAccount = playerEntries.find(([account]) => account === normalized);
    if (byAccount) return String(byAccount[0] || '');
    const byName = playerEntries.find(([, player]) => String(player?.name || '').trim() === normalized);
    return byName ? String(byName[0] || '') : '';
  };

  // 2026-10-17：系統訊息（遊戲結束／回放模式顯示真實身分時）原本只查得到角色的「本地化
  // 名稱」，沒有保留英文原名，沒辦法用來查陣營（陣營表 characterInfo.js 是用英文名當
  // key）。拆成兩層：getVisibleRoleEnglishName() 只負責找出英文原名（不做任何翻譯），
  // getVisibleRoleName() 在這之上做本地化，呼叫端不變；pidRole() 改用英文版本去查陣營。
  const getVisibleRoleEnglishName = (label, accountHint = '') => {
    const account = String(resolveAccountByLabel(label) || accountHint || '').trim();
    if (!account) {
      return String(replayRoleByName[String(label || '').trim()] || '').trim();
    }
    const player = data?.players?.[account];
    if (!player) {
      return String(replayRoleByAccount[account] || replayRoleByName[String(label || '').trim()] || '').trim();
    }
    const selfRole = account === viewerAccount ? String(player?.self_character || '').trim() : '';
    const publicRole = String(player?.character || player?.character_name || '').trim();
    const roleName = publicRole || selfRole;
    if (!roleName) {
      return String(replayRoleByAccount[account] || replayRoleByName[String(label || '').trim()] || '').trim();
    }
    return roleName;
  };

  const getVisibleRoleName = (label, accountHint = '') => {
    const englishName = getVisibleRoleEnglishName(label, accountHint);
    if (!englishName) return '';
    return getCharacterLocalizedName(englishName, getCurrentUiLang());
  };

  // 2026-10-17：系統訊息的角色標示原本固定灰色（chat-role），跟聊天室裡（10-15 新增）
  // 每則發言名字後面「(角色)」的陣營配色不一致——Mike 回報要求系統訊息也要上陣營顏色。
  // 從角色英文名查陣營，直接取 characterInfo.js 的 camp.en（'Shadow'/'Hunter'/'Civilian'），
  // 轉小寫後正好對應 theme.css 既有的 chat-role-shadow/chat-role-hunter/chat-role-civilian
  // 三個 class，跟聊天室共用同一套配色，不用另外定義樣式。
  const getCampClassForEnglishRole = (englishName) => {
    const info = getCharacterInfo(englishName);
    return String(info?.camp?.en || '').trim().toLowerCase();
  };

  const getRoleRevealStatusLabel = (label, accountHint = '') => {
    const account = String(resolveAccountByLabel(label) || accountHint || '').trim();
    if (!account) {
      return showRoleInSystemMessages ? t('ui.role_reveal_revealed') : t('ui.role_reveal_hidden');
    }
    const player = data?.players?.[account];
    if (!player) {
      return showRoleInSystemMessages ? t('ui.role_reveal_revealed') : t('ui.role_reveal_hidden');
    }
    const isRevealed = Boolean(player?.settlement_character_reveal ?? player?.character_reveal ?? false);
    return t(isRevealed ? 'ui.role_reveal_revealed' : 'ui.role_reveal_hidden');
  };

  const pidRole = (name, accountHint = '', explicitEnglishRoleName = '') => {
    const rawName = decodeHtml(name);
    const normalizedName = String(rawName || '').trim();
    if (!normalizedName || normalizedName === '-') {
      return pidPlain(rawName || '-');
    }
    const rawHint = decodeHtml(accountHint);
    // 2026-10-17：GM 沒有陣營，系統訊息遇到 GM 名字時跟聊天室（getChatRoleHtml）一樣
    // 直接顯示「(GM)」、固定用 chat-role-gm 青色樣式，不要掉進下面查不到角色就顯示
    // 「(???)」的灰色分支——不然 GM 在系統訊息裡看起來永遠像「身分沒揭露」。
    const resolvedAccount = String(resolveAccountByLabel(rawName) || rawHint || '').trim();
    const resolvedPlayer = resolvedAccount ? data?.players?.[resolvedAccount] : null;
    if (resolvedPlayer?.is_gm) {
      return `${pidPlain(rawName, rawHint)}<span class="chat-role chat-role-gm">(GM)</span>`;
    }
    // explicitEnglishRoleName：呼叫端如果已經知道角色的英文原名（而不是本地化後的顯示
    // 名稱），直接傳進來，這裡統一做本地化＋查陣營，呼叫端不用自己呼叫
    // getCharacterLocalizedName。
    const englishRoleName = String(explicitEnglishRoleName || '').trim() || getVisibleRoleEnglishName(rawName, rawHint);
    const roleName = englishRoleName ? getCharacterLocalizedName(englishRoleName, lang) : '';
    const campClass = englishRoleName ? getCampClassForEnglishRole(englishRoleName) : '';
    const roleSpanClass = campClass ? `chat-role chat-role-${esc(campClass)}` : 'chat-role';
    return `${pidPlain(rawName, rawHint)}<span class="${roleSpanClass}">(${esc(roleName || '???')})</span>`;
  };

  const pid = (name, accountHint = '') => {
    if (showRoleInSystemMessages) return pidRole(name, accountHint || name);
    return pidPlain(name, accountHint);
  };

  const parseLeadingBracketedValue = (text, suffixToken) => {
    const rawText = String(text || '');
    if (!rawText.startsWith('[')) return null;
    const boundary = rawText.lastIndexOf(suffixToken);
    if (boundary <= 0) return null;
    return {
      value: rawText.slice(1, boundary),
      rest: rawText.slice(boundary + suffixToken.length),
    };
  };

  const parseBracketedPair = (text, middleToken, tailToken) => {
    const rawText = String(text || '');
    if (!rawText.startsWith('[')) return null;
    const middleIndex = rawText.indexOf(middleToken);
    if (middleIndex <= 0) return null;
    const left = rawText.slice(1, middleIndex);
    const remaining = rawText.slice(middleIndex + middleToken.length);
    const tailIndex = remaining.lastIndexOf(tailToken);
    if (tailIndex < 0) return null;
    return {
      left,
      right: remaining.slice(0, tailIndex),
      rest: remaining.slice(tailIndex + tailToken.length),
    };
  };

  const parseAbilityEffect = (text, effectToken) => {
    const rawText = String(text || '');
    const prefix = parseBracketedPair(rawText, '] 因為 [', '](');
    if (!prefix) return null;
    const tailIndex = prefix.rest.lastIndexOf(effectToken);
    if (tailIndex < 0) return null;
    return {
      target: prefix.left,
      source: prefix.right,
      character: prefix.rest.slice(0, tailIndex),
      amount: prefix.rest.slice(tailIndex + effectToken.length),
    };
  };

  const canRevealGreenCardName = (sourceLabel = '', targetLabel = '') => {
    if (isGameFinished) return true;
    if (!viewerAccount) return false;
    const viewerName = String(data?.players?.[viewerAccount]?.name || '').trim();
    const normalizedSource = String(decodeHtml(sourceLabel || '') || '').trim();
    const normalizedTarget = String(decodeHtml(targetLabel || '') || '').trim();
    const sourceAccount = resolveAccountByLabel(normalizedSource) || (viewerName && normalizedSource === viewerName ? viewerAccount : '');
    const targetAccount = resolveAccountByLabel(normalizedTarget) || (viewerName && normalizedTarget === viewerName ? viewerAccount : '');
    return viewerAccount === sourceAccount || viewerAccount === targetAccount;
  };

  const areaLabel = (rawAreaName) => {
    const normalized = String(rawAreaName || '').trim();
    const mapped = AREA_NAMES[normalized];
    return mapped?.[lang] || mapped?.zh || esc(normalized);
  };

  const cardColorLabel = (rawColor) => {
    const key = String(rawColor || '').trim();
    return CARD_COLORS[key]?.[lang] || CARD_COLORS[key]?.zh || esc(key);
  };

  const settingToggleLabel = (rawValue) => {
    const normalized = String(rawValue || '').trim().toLowerCase();
    if (normalized === 'on') return esc(t('room.info.setting_on'));
    if (normalized === 'off') return esc(t('room.info.setting_off'));
    return esc(String(rawValue || '').trim() || '-');
  };

  const formatRoomCardPoolLabel = (rawValue) => {
    const normalized = String(rawValue || '').trim().replace(/^Card:/i, '');
    const tokens = normalized
      .split('+')
      .map((token) => String(token || '').replace(/[\[\]]/g, '').trim().toUpperCase())
      .filter(Boolean);
    const labels = [];
    if (tokens.includes('B')) labels.push(t('lobby.create.expansion_mode_basic'));
    if (tokens.includes('E')) labels.push(t('lobby.create.expansion_mode_extend'));
    if (tokens.includes('C')) labels.push(t('room.info.neutral_chaos_mode'));
    return esc(labels.length ? labels.join(' + ') : (normalized || '-'));
  };

  const buildCardToken = ({ cardName = '', cardColor = '', cardType = '', masked = false, forceLabel = '' } = {}) => {
    const rawName = String(cardName || '').trim();
    if (!rawName && !forceLabel) {
      return esc(t('room.active_card.hidden'));
    }
    const normalizedColor = String(cardColor || '').trim().toLowerCase();
    const resolvedType = String(cardType || (EQUIPMENT_CARD_NAMES.has(rawName) ? 'equipment' : 'action')).trim().toLowerCase();
    const displayLabel = String(forceLabel || '').trim() || esc(getLocalizedCardName(rawName));
    const classes = ['chat-card-token'];
    if (masked) classes.push('is-masked');
    const attrs = [
      `class="${classes.join(' ')}"`,
      `data-card-color="${esc(normalizedColor)}"`,
      `data-card-type="${esc(resolvedType)}"`,
    ];
    if (masked) {
      attrs.push('aria-disabled="true"');
      attrs.push('data-card-masked="true"');
    } else {
      attrs.push('role="button"');
      attrs.push('tabindex="0"');
      attrs.push(`data-card-name="${esc(rawName)}"`);
    }
    return `<span ${attrs.join(' ')}>${displayLabel}</span>`;
  };

  const greenCardLabel = (cardName, sourceLabel = '', targetLabel = '') => {
    const canReveal = canRevealGreenCardName(sourceLabel, targetLabel);
    return buildCardToken({
      cardName,
      cardColor: 'green',
      cardType: 'action',
      masked: !canReveal,
      forceLabel: canReveal ? esc(getLocalizedCardName(cardName)) : '???',
    });
  };

  const labelKey = (label) => {
    const raw = String(decodeHtml(label || '') || '').trim();
    return String(resolveAccountByLabel(raw) || raw || '').trim();
  };

  const rememberInitialGreenCard = (sourceLabel, cardName) => {
    const key = labelKey(sourceLabel);
    const normalizedCard = String(cardName || '').trim();
    if (!key || !normalizedCard) return;
    initialGreenCardBySource.set(key, normalizedCard);
  };

  const getRememberedInitialGreenCard = (sourceLabel) => {
    const key = labelKey(sourceLabel);
    if (!key) return '';
    return String(initialGreenCardBySource.get(key) || '').trim();
  };

  const rememberInitialGreenTargetCard = (sourceLabel, targetLabel, cardName) => {
    const key = labelKey(targetLabel);
    if (!key) return;
    initialGreenCardByTarget.set(key, {
      sourceLabel: String(sourceLabel || '').trim(),
      cardName: String(cardName || '').trim(),
    });
  };

  const getRememberedInitialGreenTargetCard = (targetLabel) => {
    const key = labelKey(targetLabel);
    if (!key) return null;
    return initialGreenCardByTarget.get(key) || null;
  };

  const initialGreenCardLabel = ({ cardName = '', sourceLabel = '', targetLabel = '' } = {}) => {
    const normalizedCard = String(cardName || '').trim();
    if (normalizedCard) {
      return greenCardLabel(normalizedCard, sourceLabel, targetLabel);
    }
    return buildCardToken({
      cardName: 'Initial Green Card',
      cardColor: 'green',
      cardType: 'action',
      masked: true,
      forceLabel: '???',
    });
  };

  const resolveCardEffectSource = (sourceName, targetLabel = '') => {
    const normalized = String(sourceName || '').trim();
    if (!normalized) return '';
    const hasCardPrefix = /^卡片\s+/.test(normalized) || /^card\s+/i.test(normalized);
    if (!hasCardPrefix) return '';
    const plainCardName = normalized
      .replace(/^卡片\s+/, '')
      .replace(/^card\s+/i, '')
      .trim();
    if (!plainCardName) return '';
    if (/^(初始綠卡|initial green card)$/i.test(plainCardName)) {
      const remembered = getRememberedInitialGreenTargetCard(targetLabel) || {};
      return t('room.system.card_source', {
        card: initialGreenCardLabel({
          cardName: remembered.cardName || '',
          sourceLabel: remembered.sourceLabel || '',
          targetLabel,
        }),
      });
    }
    if (GREEN_CARD_SOURCE_NAMES.has(plainCardName)) {
      if (canRevealGreenCardName('', targetLabel)) {
        return t('room.system.card_source', { card: buildCardToken({ cardName: plainCardName, cardColor: 'green', cardType: 'action' }) });
      }
      return t('room.system.card_source', {
        card: buildCardToken({ cardName: plainCardName, cardColor: 'green', cardType: 'action', masked: true, forceLabel: '???' }),
      });
    }
    return t('room.system.card_source', { card: buildCardToken({ cardName: plainCardName }) });
  };

  const formatSystem = (text, ts) => {
    let m;
    if (/已準備$|未準備$|取消準備$/.test(text)) return null;
    if (/^首位行動玩家：/.test(text)) return null;
    if (/^\[.+\] 因為 卡片 First Aid 效果(?:受到|恢復) \d+ 點傷害$/.test(text)) return null;
    if (/對綠卡.+選擇：/.test(text)) return null;
    if (/^\[.+\] 更換顏色為 /.test(text)) return null;
    if (/^\[.+\] 放棄掠奪 \[.+\] 的裝備/.test(text)) return null;
    if (/^\[.+\] 在 .+ 對 \[.+\] 執行效果：(?:Heal|Hurt)$/.test(text)) return null;

    if (/^村莊已建立：/.test(text)) return t('room.system.village_created_at', { date: fmtDate(ts) });
    if ((m = text.match(/^\[(.+)\] 進入了村莊$/))) return t('room.system.joined_lobby', { player: pid(esc(m[1]), m[1]) });
    if ((m = text.match(/^\[(.+)\] 離開了村莊$/))) return t('room.system.left_lobby', { player: pid(esc(m[1]), m[1]) });
    if ((m = text.match(/^\[(.+)\] 投票剔除 \[(.+)\]/))) return t('room.system.voted_kick', { actor: pid(esc(m[1]), m[1]), target: pid(esc(m[2]), m[2]) });
    if ((m = text.match(/^\[(.+)\] 已被投票剔除$/))) return t('room.system.kicked', { target: pid(esc(m[1]), m[1]) });
    if ((m = text.match(/^村長 \[(.+)\] 剔除了 \[(.+)\]$/))) return t('room.system.manager_kicked', { actor: pid(esc(m[1]), m[1]), target: pid(esc(m[2]), m[2]) });
    if ((m = text.match(/^村長 \[(.+)\] 發起點名/))) return t('room.system.roll_call');
    if ((m = text.match(/^村長 延長目前回合倒數：\[(.+)\] 重新開始計時$/))) {
      return t('room.system.extend_turn_timeout', { target: pid(esc(m[1]), m[1]) });
    }
    if ((m = text.match(/^村長 \[(.+)\] 延長目前回合倒數：\[(.+)\] 重新開始計時$/))) {
      return t('room.system.extend_turn_timeout', { target: pid(esc(m[2]), m[2]) });
    }
    // 2026-10-15：村長更新房間設定的摘要字串（後端 _format_room_settings_summary()）
    // 後來陸續補了「隨機初始位置」「人數上限」兩個欄位，這裡的正規表達式跟翻譯字串
    // 原本沒有同步更新，導致訊息比對不到，整句掉進最後面的通用 fallback（直接顯示
    // 後端原始文字，沒有翻譯也沒有排版）。這裡把這兩個欄位補進來；「人數上限」統一
    // 放在最後，跟後端摘要字串的欄位順序一致，兩個新欄位都用 (?:...)? 包起來，舊的
    // 歷史系統訊息（還沒有這兩個欄位時留下的）一樣可以正常比對、只是這兩項顯示預設值。
    if ((m = text.match(/^村長更新房間設定：Card:(.+?) \/ 初始綠卡=(On|Off)(?: \/ 中立大亂鬥=(On|Off))?(?: \/ 徽章唯一=(On|Off))?(?: \/ 隨機初始位置=(On|Off))? \/ 暴斃時間=(\d+)分(?: \/ 人數上限=(\d+)人)?$/))) {
      return t('room.system.updated_room_settings', {
        card_pool: formatRoomCardPoolLabel(m[1]),
        initial_green: settingToggleLabel(m[2]),
        neutral_chaos: settingToggleLabel(m[3] || 'Off'),
        badge_unique: settingToggleLabel(m[4] || 'Off'),
        random_position: settingToggleLabel(m[5] || 'Off'),
        timeout: esc(t('room.info.boom_timeout_fmt_minutes', { n: m[6] })),
        max_players: esc(m[7] || '-'),
      });
    }
    if ((m = text.match(/^本場配置：Card:(.+?) \/ 初始綠卡=(On|Off)(?: \/ 中立大亂鬥=(On|Off))?(?: \/ 徽章唯一=(On|Off))? \/ 暴斃時間=(\d+)分$/))) {
      return t('room.system.game_config_settings', {
        card_pool: formatRoomCardPoolLabel(m[1]),
        initial_green: settingToggleLabel(m[2]),
        neutral_chaos: settingToggleLabel(m[3] || 'Off'),
        badge_unique: settingToggleLabel(m[4] || 'Off'),
        timeout: esc(t('room.info.boom_timeout_fmt_minutes', { n: m[5] })),
      });
    }
    if ((m = text.match(/^本場配置：暗影=(\d+) \/ 獵人=(\d+) \/ 中立=(\d+)$/))) {
      return t('room.system.game_config_camps', {
        shadow: esc(m[1]),
        hunter: esc(m[2]),
        civilian: esc(m[3]),
      });
    }
    if (/^初始綠卡流程開始$/.test(text)) return t('room.system.initial_green_flow_started');

    if ((m = text.match(/^\[(.+)\]\s*初始綠卡：(.+)$/))) {
      const cardName = String(m[2] || '').trim();
      rememberInitialGreenCard(m[1], cardName);
      return t('room.system.initial_green_card_drawn', { player: pidRole(esc(m[1]), m[1]), card: greenCardLabel(cardName, m[1], '') });
    }
    if ((m = text.match(/^初始綠卡：(.+)$/))) {
      const cardName = String(m[1] || '').trim();
      return t('room.system.initial_green_card', { card: greenCardLabel(cardName, '', '') });
    }

    if ((m = text.match(/^\[(.+)\] 擲移動骰：(.+)$/))) return t('room.system.rolled_value', { player: pidRole(esc(m[1]), m[1]), value: esc(m[2]) });
    if ((m = text.match(/^\[(.+)\] 擲出 7，可任選區域$/))) return null;

    if ((m = text.match(/^\[(.+)\] 羅盤擲骰：(.+)$/))) return t('room.system.compass_rolled_value', { player: pidRole(esc(m[1]), m[1]), value: esc(m[2]) });
    if ((m = text.match(/^\[(.+)\] 羅盤擲出 7，可任選區域$/))) return null;
    if ((m = text.match(/^\[(.+)\] 羅盤擲到區域：(.+)$/))) return t('room.system.compass_area', { player: pidRole(esc(m[1]), m[1]), area: areaLabel(m[2]) });

    if ((m = text.match(/^\[(.+)\] (?:移動到|選擇移動到|使用神祕羅盤移動到|發動能力並移動到) (.+)$/))) {
      return t('room.system.moved_to', { player: pidRole(esc(m[1]), m[1]), area: areaLabel(m[2]) });
    }

    if ((m = text.match(/^\[(.+)\] 在 .+ 抽到 (.+?)（(.+)\)$/))) {
      const colorStr = cardColorLabel(m[3]);
      const normalizedColor = String(m[3] || '').trim().toLowerCase();
      const cardName = String(m[3] || '') === 'Green'
        ? greenCardLabel(m[2], m[1], '')
        : buildCardToken({ cardName: m[2], cardColor: normalizedColor });
      return t('room.system.drew_card', { player: pidRole(esc(m[1]), m[1]), color: colorStr, card: cardName });
    }

    if ((m = text.match(/^\[(.+)\] 指定 \[(.+)\] 接收綠卡 (.+)$/))) {
      rememberInitialGreenTargetCard(m[1], m[2], String(m[3] || '').trim());
      return t('room.system.execute_green', {
        actor: pidRole(esc(m[1]), m[1]),
        target: pidRole(esc(m[2]), m[2]),
        card: greenCardLabel(m[3], m[1], m[2]),
      });
    }

    if ((m = text.match(/^\[(.+)\] 使用初始綠卡，目標：\[(.+)\]$/))) {
      const rememberedCardName = getRememberedInitialGreenCard(m[1]);
      rememberInitialGreenTargetCard(m[1], m[2], rememberedCardName);
      return t('room.system.target_used_card', {
        actor: pidRole(esc(m[1]), m[1]),
        target: pidRole(esc(m[2]), m[2]),
        color: cardColorLabel('Green'),
        card: initialGreenCardLabel({
          cardName: rememberedCardName,
          sourceLabel: m[1],
          targetLabel: m[2],
        }),
      });
    }

    if ((m = text.match(/^\[(.+)\] 使用卡片 (.+?)（(.+?)），目標：\[(.+)\]$/))) {
      const colorStr = cardColorLabel(m[3]);
      const normalizedColor = String(m[3] || '').trim().toLowerCase();
      const isGreenCard = String(m[3] || '').trim() === 'Green';
      if (isGreenCard && m[4] !== '-') {
        rememberInitialGreenTargetCard(m[1], m[4], String(m[2] || '').trim());
      }
      const cardName = isGreenCard
        ? greenCardLabel(m[2], m[1], m[4])
        : buildCardToken({ cardName: m[2], cardColor: normalizedColor });
      if (m[4] === '-') return t('room.system.used_card', { player: pidRole(esc(m[1]), m[1]), color: colorStr, card: cardName });
      return t('room.system.target_used_card', {
        actor: pidRole(esc(m[1]), m[1]),
        target: pidRole(esc(m[4]), m[4]),
        color: colorStr,
        card: cardName,
      });
    }

    if ((m = text.match(/^\[(.+)\] 在 (.+) 對 \[(.+)\] 執行效果：(.+)$/))) {
      return t('room.system.area_effect', { actor: pidRole(esc(m[1]), m[1]), target: pidRole(esc(m[3]), m[3]), area: areaLabel(m[2]) });
    }
    if ((m = text.match(/^\[(.+)\] 發動能力，目標：\[(.+)\]$/))) {
      return t('room.system.activated_ability_target', {
        player: pidRole(esc(m[1]), m[1]),
        target: pidRole(esc(m[2]), m[2]),
      });
    }
    if ((m = text.match(/^\[(.+)\] 發動能力$/))) {
      return t('room.system.activated_ability', {
        player: pidRole(esc(m[1]), m[1]),
      });
    }

    const abilityDamage = parseAbilityEffect(text, ') 角色能力效果受到 ');
    if (abilityDamage && / 點傷害$/.test(abilityDamage.amount)) {
      return t('room.system.ability_damage', {
        target: pidRole(esc(abilityDamage.target), abilityDamage.target),
        source: pidRole(esc(abilityDamage.source), abilityDamage.source, abilityDamage.character),
        amount: esc(abilityDamage.amount.replace(/ 點傷害$/, '')),
      });
    }
    const abilityHeal = parseAbilityEffect(text, ') 角色能力效果恢復 ');
    if (abilityHeal && / 點傷害$/.test(abilityHeal.amount)) {
      return t('room.system.ability_heal', {
        target: pidRole(esc(abilityHeal.target), abilityHeal.target),
        source: pidRole(esc(abilityHeal.source), abilityHeal.source, abilityHeal.character),
        amount: esc(abilityHeal.amount.replace(/ 點傷害$/, '')),
      });
    }

    if ((m = text.match(/^\[(.+)\] 因為 (.+) 效果(治癒|恢復) (\d+) 點傷害$/))) {
      const sourceLabel = resolveCardEffectSource(m[2], m[1]) || areaLabel(m[2]);
      return t('room.system.effect_healed', { player: pidRole(esc(m[1]), m[1]), source: sourceLabel, amount: esc(m[4]) });
    }
    if ((m = text.match(/^\[(.+)\] 因為 (.+) 效果受到 (\d+) 點傷害$/))) {
      const sourceLabel = resolveCardEffectSource(m[2], m[1]) || areaLabel(m[2]);
      return t('room.system.effect_damaged', { player: pidRole(esc(m[1]), m[1]), source: sourceLabel, amount: esc(m[3]) });
    }

    if ((m = text.match(/^\[(.+)\] 因為 白卡\(Blessing\) 恢復 (\d+) 點傷害$/))) {
      return t('room.system.blessing_healed', {
        player: pidRole(esc(m[1]), m[1]),
        card: `${cardColorLabel('White')}(${buildCardToken({ cardName: 'Blessing', cardColor: 'white', cardType: 'action' })})`,
        amount: esc(m[2]),
      });
    }
    if ((m = text.match(/^\[(.+)\] 因為 白卡\(First Aid\) 傷害變為 (\d+)$/))) return t('room.system.first_aid_set', { player: pidRole(esc(m[1]), m[1]), card: buildCardToken({ cardName: 'First Aid', cardColor: 'white', cardType: 'action' }), amount: esc(m[2]) });
    if ((m = text.match(/^\[(.+)\] 因為 \[(.+)\]\(Fu-ka\) 角色能力效果傷害變為 (\d+)$/))) return t('room.system.fuka_set', { target: pidRole(esc(m[1]), m[1]), source: pidRole(esc(m[2]), m[2], 'Fu-ka'), amount: esc(m[3]) });

    const declaredAttack = parseBracketedPair(text, '] 宣告攻擊 [', ']');
    if (declaredAttack && declaredAttack.rest === '') {
      return t('room.system.declared_attack', { attacker: pid(esc(declaredAttack.left), declaredAttack.left), target: pid(esc(declaredAttack.right), declaredAttack.right) });
    }
    if ((m = text.match(/^\[(.+)\] 攻擊擲骰：(.+?)，傷害=\d+$/))) return t('room.system.rolled_value', { player: pidRole(esc(m[1]), m[1]), value: esc(m[2]) });
    if ((m = text.match(/^\[(.+)\] 對 \[(.+)\] 造成 (\d+) 點傷害（基礎:(\d+) \/ 增減傷:([+-]?\d+) \/ 防禦:(\d+)）$/))) {
      return t('room.system.attack_damage_detail', {
        attacker: pidRole(esc(m[1]), m[1]),
        target: pidRole(esc(m[2]), m[2]),
        amount: esc(m[3]),
        base: esc(m[4]),
        modifier: esc(m[5]),
        defence: esc(m[6]),
      });
    }
    if ((m = text.match(/^\[(.+)\] 對 \[(.+)\] 的攻擊使傷害減少 (\d+)（基礎:(\d+) \/ 增減傷:([+-]?\d+) \/ 防禦:(\d+)）$/))) {
      return t('room.system.attack_damage_reduced_detail', {
        attacker: pidRole(esc(m[1]), m[1]),
        target: pidRole(esc(m[2]), m[2]),
        amount: esc(m[3]),
        base: esc(m[4]),
        modifier: esc(m[5]),
        defence: esc(m[6]),
      });
    }
    if ((m = text.match(/^\[(.+)\] 攻擊 \[(.+)\] 未造成傷害（基礎:(\d+) \/ 增減傷:([+-]?\d+) \/ 防禦:(\d+)）$/))) {
      return t('room.system.attack_no_damage_detail', {
        attacker: pidRole(esc(m[1]), m[1]),
        target: pidRole(esc(m[2]), m[2]),
        base: esc(m[3]),
        modifier: esc(m[4]),
        defence: esc(m[5]),
      });
    }
    const attackDamage = parseBracketedPair(text, '] 對 [', '] 造成 ');
    if (attackDamage && /^\d+ 點傷害$/.test(attackDamage.rest)) {
      return t('room.system.took_attack_damage', {
        target: pid(esc(attackDamage.right), attackDamage.right),
        attacker: pid(esc(attackDamage.left), attackDamage.left),
        amount: esc(attackDamage.rest.replace(/ 點傷害$/, '')),
      });
    }

    if ((m = text.match(/^\[(.+)\] 裝備了 (.+)$/))) return t('room.system.equipped', { player: pidRole(esc(m[1]), m[1]), card: buildCardToken({ cardName: m[2], cardType: 'equipment' }) });
    if ((m = text.match(/^\[(.+)\] 因為 卡片 (.+) 效果 從 \[(.+)\] 取得裝備 (.+)$/))) {
      const cardLabel = GREEN_CARD_SOURCE_NAMES.has(m[2])
        ? (canRevealGreenCardName(m[3], m[1])
          ? t('room.system.card_source', { card: buildCardToken({ cardName: m[2], cardColor: 'green', cardType: 'action' }) })
          : t('room.system.card_source', { card: buildCardToken({ cardName: m[2], cardColor: 'green', cardType: 'action', masked: true, forceLabel: '???' }) }))
        : t('room.system.card_source', { card: buildCardToken({ cardName: m[2] }) });
      return t('room.system.took_equipment_from_card', { player: pidRole(esc(m[1]), m[1]), card_source: cardLabel, from: pidRole(esc(m[3]), m[3]), card: buildCardToken({ cardName: m[4], cardType: 'equipment' }) });
    }
    if ((m = text.match(/^\[(.+)\] 從 \[(.+)\] 取得裝備 (.+)$/))) return t('room.system.took_equipment', { player: pidRole(esc(m[1]), m[1]), from: pidRole(esc(m[2]), m[2]), card: buildCardToken({ cardName: m[3], cardType: 'equipment' }) });
    if ((m = text.match(/^\[(.+)\] 掠奪了 \[(.+)\] 的全部裝備$/))) return t('room.system.looted_all', { looter: pidRole(esc(m[1]), m[1]), target: pidRole(esc(m[2]), m[2]) });
    if ((m = text.match(/^\[(.+)\] 掠奪 \[(.+)\] 的裝備 (.+)$/))) return t('room.system.looted_one', { looter: pidRole(esc(m[1]), m[1]), target: pidRole(esc(m[2]), m[2]), card: buildCardToken({ cardName: m[3], cardType: 'equipment' }) });

    if ((m = text.match(/^\[(.+)\] 本回合放棄攻擊$/))) return t('room.system.skipped_attack', { player: pidRole(esc(m[1]), m[1]) });
    if ((m = text.match(/^\[(.+)\] 擲到目前區域，自動重擲後：D4=(\d+) D6=(\d+)$/))) {
      return t('room.system.rerolled_same_area', {
        player: pidRole(esc(m[1]), m[1]),
        d4: esc(m[2]),
        d6: esc(m[3]),
      });
    }
    if ((m = text.match(/^\[(.+)\] 羅盤擲到目前區域，自動重擲後：D4=(\d+) D6=(\d+)$/))) {
      return t('room.system.compass_rerolled_same_area', {
        player: pidRole(esc(m[1]), m[1]),
        d4: esc(m[2]),
        d6: esc(m[3]),
      });
    }
    if ((m = text.match(/^\[Spiritual Doll\] 擲出 D6=(\d+)，目標承受效果$/))) {
      return t('room.system.spiritual_doll_target_effect', {
        card: buildCardToken({ cardName: 'Spiritual Doll', cardType: 'action' }),
        value: esc(m[1]),
      });
    }
    if ((m = text.match(/^\[Spiritual Doll\] 擲出 D6=(\d+)，改為自己承受效果$/))) {
      return t('room.system.spiritual_doll_self_effect', {
        card: buildCardToken({ cardName: 'Spiritual Doll', cardType: 'action' }),
        value: esc(m[1]),
      });
    }
    // 2026-10-09 修正：炸藥的擲骰訊息（[Dynamite] 擲出 D4=... D6=...）跟上面的
    // Spiritual Doll 是同一種模式——後端用卡名當作 [中括號] 裡的角色名稱方便記錄，
    // 但前端沒有專門處理，掉進下面「把 [名稱] 當成玩家名字」的通用規則，變成顯示
    // 「Dynamite(???)」這種看起來像是某個神秘玩家在講話的奇怪畫面。補上專用規則。
    if ((m = text.match(/^\[Dynamite\] 擲出 D4=(\d+) D6=(\d+)（合計=7），啞彈無事發生$/))) {
      return t('room.system.dynamite_dud', {
        card: buildCardToken({ cardName: 'Dynamite', cardType: 'action' }),
        d4: esc(m[1]),
        d6: esc(m[2]),
      });
    }
    if ((m = text.match(/^\[Dynamite\] 擲出 D4=(\d+) D6=(\d+)（合計=(\d+)）$/))) {
      return t('room.system.dynamite_rolled', {
        card: buildCardToken({ cardName: 'Dynamite', cardType: 'action' }),
        d4: esc(m[1]),
        d6: esc(m[2]),
        total: esc(m[3]),
      });
    }
    if ((m = text.match(/^\[(.+)\] 死亡，身份揭示為 (.+)$/))) return t('room.system.died_revealed', { player: pid(esc(m[1]), m[1]), role: esc(getCharacterLocalizedName(m[2], lang)) });
    if ((m = text.match(/^\[(.+)\] 回合超時，判定暴斃$/))) return t('room.system.timed_out_boom', { player: pid(esc(m[1]), m[1]) });
    const revealedIdentity = parseLeadingBracketedValue(text, '] 主動揭示身份：');
    if (revealedIdentity) {
      return t('room.system.revealed_identity', { player: pidRole(esc(revealedIdentity.value), revealedIdentity.value), role: esc(getCharacterLocalizedName(revealedIdentity.rest, lang)) });
    }

    // 2026-10-09 修正：這兩則訊息原本共用同一個翻譯字串，畫面上看起來像「遊戲開始」
    // 顯示了兩次（其實是兩個不同時機點的訊息：全員準備完成 vs. 真正發放角色進入回合），
    // 容易讓人誤會是 bug。改成各自獨立的文字，意思分開但不互相重複。
    if (/^全員準備完成，遊戲開始/.test(text)) return t('room.system.all_players_ready');
    if (/^遊戲開始(?:，|$)/.test(text)) return t('room.system.game_started');

    if ((m = text.match(/^遊戲結束，勝利者：(.+)$/))) {
      const winnerAccounts = Array.isArray(data?.winners)
        ? data.winners.map((value) => String(value || '').trim()).filter(Boolean)
        : [];

      if (winnerAccounts.length > 0) {
        const winnerTokens = winnerAccounts.map((account) => {
          const player = data?.players?.[account] || {};
          const label = String(player?.name || account || '').trim() || account;
          return pidRole(label, account);
        });
        return t('room.system.game_ended_winners', { winners: winnerTokens.join('、') });
      }

      const labels = String(m[1] || '')
        .split(/[、,，]/)
        .map((label) => String(label || '').trim())
        .filter(Boolean);
      const winners = labels.map((label) => {
        const match = label.match(/^(.+?)\(([^()]+)\)$/);
        if (match) {
          return pidRole(match[1], match[1], match[2]);
        }
        return pidRole(label, label);
      });
      return t('room.system.game_ended_winners', { winners: winners.join('、') });
    }

    const safeText = esc(text);
    return safeText.replace(/\[([^\]]+)\]/g, (_, n) => showRoleInSystemMessages ? pidRole(n, n) : pidPlain(n, n));
  };

  const chatLines = [];
  const systemLines = [];
  const nowTs = Math.floor(Date.now() / 1000);
  const pushSystemLine = (htmlText, extraClass = '', ts = nowTs, mirrorToChat = false) => {
    const tsLabel = fmtTime(Number(ts) || nowTs);
    const cls = extraClass ? `system-line ${extraClass}` : 'system-line';
    systemLines.push(`<div class="${cls}">[${esc(tsLabel)}] ${htmlText}</div>`);
    if (mirrorToChat) {
      const chatCls = extraClass ? `chat-line chat-line-system ${extraClass}` : 'chat-line chat-line-system';
      chatLines.push(`<div class="${chatCls}">[${esc(tsLabel)}] ${htmlText}</div>`);
    }
  };

  // 2026-10-15：聊天室每則訊息的發言者名字後面補上一個「(角色)」，跟村民卡片一樣用 can_view_character 的規則做遮罩（後端在 p.character 有沒有值的時候，就已經檢查過本人是不是看得到了，所以這裡直接沿用同一套邏輯）：還沒揭露時顯示灰色的「(???)」；揭露了就顯示角色名稱，顏色跟陣營走；GM 沒有陣營，直接顯示「(GM)」。
  const getChatRoleHtml = (account) => {
    const acc = String(account || '').trim();
    if (!acc) return '';
    const player = data?.players?.[acc];
    if (!player) return '';
    if (player.is_gm) {
      return '<span class="chat-role chat-role-gm">(GM)</span>';
    }
    const isSelfPlayer = acc === viewerAccount;
    const resolvedCharacter = String(player.character || player.character_name || '').trim();
    const hasKnownRole = Boolean(resolvedCharacter);
    const roleNameEn = hasKnownRole ? resolvedCharacter : (isSelfPlayer ? String(player.self_character || '').trim() : '');
    if (!roleNameEn) {
      return '<span class="chat-role">(???)</span>';
    }
    const roleCamp = hasKnownRole ? player.character_camp : (isSelfPlayer ? player.self_character_camp : '');
    const campClass = String(roleCamp || '').trim().toLowerCase() || 'civilian';
    const roleDisplay = getCharacterLocalizedName(roleNameEn, lang);
    return `<span class="chat-role chat-role-${esc(campClass)}">(${esc(roleDisplay)})</span>`;
  };

  messages.forEach((message) => {
    const msgType = String(message?.type || 'chat').toLowerCase();
    const ts = Number(message?.timestamp || 0);
    const text = String(message?.text || '').trim();
    if (msgType === 'system') {
      const formatted = formatSystem(text, ts);
      if (formatted) pushSystemLine(formatted, '', ts, true);
      return;
    }
    const account = String(message?.account || '').trim();
    const mappedName = String(data?.players?.[account]?.name || '').trim();
    const rawMessageName = String(message?.name || '').trim();
    const resolvedFromName = String(data?.players?.[rawMessageName]?.name || '').trim();
    const name = mappedName || resolvedFromName || rawMessageName || account || '';
    const timeStr = fmtTime(ts);
    const isSelf = Boolean(state?.account) && account === String(state.account || '');
    const cls = isSelf ? 'chat-line chat-line-self' : 'chat-line';
    const chatTextHtml = renderChatTextWithEmojis(text, esc);
    const senderColorHex = account ? getPlayerLabelColor(account) : null;
    const senderStyleAttr = senderColorHex ? ` style="color:${senderColorHex}"` : '';
    const chatRoleHtml = getChatRoleHtml(account);
    chatLines.push(`<div class="${cls}"><div class="chat-sender"${senderStyleAttr}>${esc(name || '-')}${chatRoleHtml}<span class="chat-time">(${timeStr})</span>:</div><div class="chat-text">${chatTextHtml}</div></div>`);
  });

  const timeoutRemain = Number(data?.turn_timeout?.remaining_seconds);
  if (Number.isFinite(timeoutRemain)) {
    const timeoutCurrentAccount = String(data?.turn_timeout?.current_account || '').trim();
    const timeoutCurrent = String(data?.turn_timeout?.current_name || data?.turn_timeout?.current_account || data?.turn_timeout?.current_trip_display || '-').trim();
    const viewerName = String(data?.players?.[viewerAccount]?.name || '').trim();
    const isViewerTimeout = Boolean(viewerAccount) && (
      (timeoutCurrentAccount && timeoutCurrentAccount === viewerAccount)
      || (viewerName && timeoutCurrent === viewerName)
    );
    const timeoutClass = isViewerTimeout ? 'system-timeout system-timeout-self' : 'system-timeout';
    // 2026-10-10 修正：Mike 回報回合暴斃倒數（尤其是輪到自己時顯示的紅色提示）只會
    // 出現在房間頁主畫面的「系統訊息」面板，右下角浮動聊天室完全看不到；因為浮動
    // 聊天室（floatingChat.js）只取用 buildChatStageLines() 回傳的 chatLines，原本
    // 這則倒數訊息只放進 systemLines、沒有 mirrorToChat，所以浮動聊天室看不到。
    // 補上 mirrorToChat=true，讓它跟其他系統訊息一樣同時鏡像一份進聊天室；
    // chat-line-system 搭配 system-timeout-self 本來就有對應的紅色樣式可以直接套用。
    // 2026-10-19 修正：這裡原本是把 {n} 直接算好代入、整段文字當靜態字串塞進去，
    // 只有房間快照推播進來、這個函式重新整個跑一次時數字才會換，看起來像是跳著
    // 倒數，不是每秒讀秒——跟側欄暴斃倒數之前的問題（見 villageInfoRendering.js
    // 2026-10-13 修正）一樣。改成同一套做法：只把秒數包成帶 data-remain-base／
    // data-remain-synced-at 的 <span>，交給 room.js 裡同一個每秒 tick 的本機倒數
    // 計時器去算，不用等下一次推播；用 class 不用 id，因為這則訊息系統面板跟
    // 浮動聊天室各有一份鏡像，同時間 DOM 裡會有兩個，計時器那邊已經改成用
    // querySelectorAll 選取所有符合的元素，不限定單一 id。
    const timeoutRemainDisplay = Math.max(0, timeoutRemain);
    const timeoutRemainSpan = '<span class="chat-turn-timeout-remain" data-remain-base="'
      + timeoutRemainDisplay + '" data-remain-synced-at="' + getRenderSyncedAtMs() + '">' + timeoutRemainDisplay + '</span>';
    const timeoutTextTemplate = esc(t('room.info.turn_timeout_fmt', { who: timeoutCurrent || '-' }));
    const timeoutTextHtml = timeoutTextTemplate.replace('{n}', timeoutRemainSpan);
    pushSystemLine(timeoutTextHtml, timeoutClass, nowTs, true);
  }

  return { chatLines, systemLines };
}
