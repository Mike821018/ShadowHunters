import { renderChatTextWithEmojis } from './chatEmoji.js';

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

  const pidPlain = (name) => {
    const rawName = decodeHtml(name);
    return `<span class="chat-pid">${esc(getDisplayNameByLabel(rawName))}</span>`;
  };

  const resolveAccountByLabel = (label) => {
    const normalized = String(label || '').trim();
    if (!normalized) return '';
    const byAccount = playerEntries.find(([account]) => account === normalized);
    if (byAccount) return String(byAccount[0] || '');
    const byName = playerEntries.find(([, player]) => String(player?.name || '').trim() === normalized);
    return byName ? String(byName[0] || '') : '';
  };

  const getVisibleRoleName = (label, accountHint = '') => {
    const account = String(accountHint || resolveAccountByLabel(label) || '').trim();
    if (!account) {
      const replayRole = String(replayRoleByName[String(label || '').trim()] || '').trim();
      if (!replayRole) return '';
      return getCharacterLocalizedName(replayRole, getCurrentUiLang());
    }
    const player = data?.players?.[account];
    if (!player) {
      const replayRole = String(replayRoleByAccount[account] || replayRoleByName[String(label || '').trim()] || '').trim();
      if (!replayRole) return '';
      return getCharacterLocalizedName(replayRole, getCurrentUiLang());
    }
    const selfRole = account === viewerAccount ? String(player?.self_character || '').trim() : '';
    const publicRole = String(player?.character || player?.character_name || '').trim();
    const roleName = publicRole || selfRole;
    if (!roleName) {
      const replayRole = String(replayRoleByAccount[account] || replayRoleByName[String(label || '').trim()] || '').trim();
      if (!replayRole) return '';
      return getCharacterLocalizedName(replayRole, getCurrentUiLang());
    }
    return getCharacterLocalizedName(roleName, getCurrentUiLang());
  };

  const pidRole = (name, accountHint = '', explicitRoleName = '') => {
    const rawName = decodeHtml(name);
    const normalizedName = String(rawName || '').trim();
    if (!normalizedName || normalizedName === '-') {
      return pidPlain(rawName || '-');
    }
    const rawHint = decodeHtml(accountHint);
    const roleName = String(explicitRoleName || '').trim() || getVisibleRoleName(rawName, rawHint);
    return `${pidPlain(rawName)}<span class="chat-role">(${esc(roleName || '???')})</span>`;
  };

  const pid = (name, accountHint = '') => {
    if (showRoleInSystemMessages) return pidRole(name, accountHint || name);
    return pidPlain(name);
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

    if ((m = text.match(/^\[(.+)\]\s*初始綠卡：(.+)$/))) return t('room.system.initial_green_card', { card: buildCardToken({ cardName: String(m[2] || '').trim(), cardColor: 'green', cardType: 'action' }) });
    if ((m = text.match(/^初始綠卡：(.+)$/))) return t('room.system.initial_green_card', { card: buildCardToken({ cardName: String(m[1] || '').trim(), cardColor: 'green', cardType: 'action' }) });

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
      return t('room.system.execute_green', { player: pidRole(esc(m[2]), m[2]), card: greenCardLabel(m[3], m[1], m[2]) });
    }

    if ((m = text.match(/^\[(.+)\] 使用卡片 (.+?)（(.+?)），目標：\[(.+)\]$/))) {
      const colorStr = cardColorLabel(m[3]);
      const normalizedColor = String(m[3] || '').trim().toLowerCase();
      const cardName = String(m[3] || '') === 'Green'
        ? greenCardLabel(m[2], m[1], m[4])
        : buildCardToken({ cardName: m[2], cardColor: normalizedColor });
      if (m[4] === '-') return t('room.system.used_card', { player: pidRole(esc(m[1]), m[1]), color: colorStr, card: cardName });
      return t('room.system.target_used_card', { player: pidRole(esc(m[4]), m[4]), color: colorStr, card: cardName });
    }

    if ((m = text.match(/^\[(.+)\] 在 (.+) 對 \[(.+)\] 執行效果：(.+)$/))) {
      return t('room.system.area_effect', { actor: pidRole(esc(m[1]), m[1]), target: pidRole(esc(m[3]), m[3]), area: areaLabel(m[2]) });
    }

    const abilityDamage = parseAbilityEffect(text, ') 角色能力效果受到 ');
    if (abilityDamage && / 點傷害$/.test(abilityDamage.amount)) {
      return t('room.system.ability_damage', {
        target: pidRole(esc(abilityDamage.target), abilityDamage.target),
        source: pidRole(esc(abilityDamage.source), abilityDamage.source, getCharacterLocalizedName(abilityDamage.character, lang)),
        amount: esc(abilityDamage.amount.replace(/ 點傷害$/, '')),
      });
    }
    const abilityHeal = parseAbilityEffect(text, ') 角色能力效果恢復 ');
    if (abilityHeal && / 點傷害$/.test(abilityHeal.amount)) {
      return t('room.system.ability_heal', {
        target: pidRole(esc(abilityHeal.target), abilityHeal.target),
        source: pidRole(esc(abilityHeal.source), abilityHeal.source, getCharacterLocalizedName(abilityHeal.character, lang)),
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
    if ((m = text.match(/^\[(.+)\] 因為 \[(.+)\]\(Fu-ka\) 角色能力效果傷害變為 (\d+)$/))) return t('room.system.fuka_set', { target: pidRole(esc(m[1]), m[1]), source: pidRole(esc(m[2]), m[2], getCharacterLocalizedName('Fu-ka', lang)), amount: esc(m[3]) });

    const declaredAttack = parseBracketedPair(text, '] 宣告攻擊 [', ']');
    if (declaredAttack && declaredAttack.rest === '') {
      return t('room.system.declared_attack', { attacker: pid(esc(declaredAttack.left), declaredAttack.left), target: pid(esc(declaredAttack.right), declaredAttack.right) });
    }
    if ((m = text.match(/^\[(.+)\] 攻擊擲骰：(.+?)，傷害=\d+$/))) return t('room.system.rolled_value', { player: pidRole(esc(m[1]), m[1]), value: esc(m[2]) });
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
    if ((m = text.match(/^\[(.+)\] 死亡，身份揭示為 (.+)$/))) return t('room.system.died_revealed', { player: pid(esc(m[1]), m[1]), role: esc(getCharacterLocalizedName(m[2], lang)) });
    if ((m = text.match(/^\[(.+)\] 回合超時，判定暴斃$/))) return t('room.system.timed_out_boom', { player: pid(esc(m[1]), m[1]) });
    const revealedIdentity = parseLeadingBracketedValue(text, '] 主動揭示身份：');
    if (revealedIdentity) {
      return t('room.system.revealed_identity', { player: pidRole(esc(revealedIdentity.value), revealedIdentity.value), role: esc(getCharacterLocalizedName(revealedIdentity.rest, lang)) });
    }

    if (/^遊戲開始，/.test(text)) return t('room.system.game_started');

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
          return pidRole(match[1], match[1], getCharacterLocalizedName(match[2], lang));
        }
        return pidRole(label, label);
      });
      return t('room.system.game_ended_winners', { winners: winners.join('、') });
    }

    const safeText = esc(text);
    return safeText.replace(/\[([^\]]+)\]/g, (_, n) => showRoleInSystemMessages ? pidRole(n, n) : `<span class="chat-pid">${n}</span>`);
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
    chatLines.push(`<div class="${cls}"><div class="chat-sender">${esc(name || '-')}<span class="chat-time">(${timeStr})</span>:</div><div class="chat-text">${chatTextHtml}</div></div>`);
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
    pushSystemLine(esc(t('room.info.turn_timeout_fmt', { who: timeoutCurrent || '-', n: Math.max(0, timeoutRemain) })), timeoutClass);
  }

  return { chatLines, systemLines };
}
