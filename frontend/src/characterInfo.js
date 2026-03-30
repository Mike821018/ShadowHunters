const CHARACTER_INFO = {
  'Wight': {
    names: { en: 'Wight', zh: '屍妖', jp: 'ワイト' },
    camp: { en: 'Shadow', zh: '暗影', jp: 'シャドウ' },
    win: {
      en: 'All Hunters die, or at least 3 Neutrals die.',
      zh: '所有獵人死亡，或至少 3 位中立死亡。',
      jp: 'ハンター全滅、または中立 3 名以上死亡。',
    },
    ability: {
      en: 'At end phase, gain extra turns equal to total dead characters (once).',
      zh: '在你的回合結束時，額外進行等同於死亡角色數量的回合。(每場遊戲限用一次)',
      jp: '終了時、死亡人数分の追加ターンを得る（1回）。',
    },
  },
  'Vampire': {
    names: { en: 'Vampire', zh: '吸血鬼', jp: 'ヴァンパイア' },
    camp: { en: 'Shadow', zh: '暗影', jp: 'シャドウ' },
    win: {
      en: 'All Hunters die, or at least 3 Neutrals die.',
      zh: '所有獵人死亡，或至少 3 位中立死亡。',
      jp: 'ハンター全滅、または中立 3 名以上死亡。',
    },
    ability: {
      en: 'When your attack deals damage, heal 2 damage.',
      zh: '當你攻擊一位角色並造成傷害時，治癒你受到的2點傷害。',
      jp: '攻撃でダメージを与えた時、自分のダメージを 2 回復。',
    },
  },
  'Werewolf': {
    names: { en: 'Werewolf', zh: '狼男', jp: 'ウェアウルフ' },
    camp: { en: 'Shadow', zh: '暗影', jp: 'シャドウ' },
    win: {
      en: 'All Hunters die, or at least 3 Neutrals die.',
      zh: '所有獵人死亡，或至少 3 位中立死亡。',
      jp: 'ハンター全滅、または中立 3 名以上死亡。',
    },
    ability: {
      en: 'After being attacked, you may immediately counterattack the attacker.',
      zh: '當你遭受攻擊之後，你可以馬上攻擊那位攻擊你的角色。',
      jp: '攻撃された後、攻撃者へ即時反撃できる。',
    },
  },
  'Ultra Soul': {
    names: { en: 'Ultra Soul', zh: '究極靈魂', jp: 'ウルトラソウル' },
    camp: { en: 'Shadow', zh: '暗影', jp: 'シャドウ' },
    win: {
      en: 'All Hunters die, or at least 3 Neutrals die.',
      zh: '所有獵人死亡，或至少 3 位中立死亡。',
      jp: 'ハンター全滅、または中立 3 名以上死亡。',
    },
    ability: {
      en: 'At start phase, choose a player in Underworld Gate and deal 3 damage.',
      zh: '在你的回合一開始，選擇一位身處於「時空之門」的玩家，對他造成3點傷害。',
      jp: '開始時、時空の門にいるプレイヤー 1 人に 3 ダメージ。',
    },
  },
  'Unknown': {
    names: { en: 'Unknown', zh: '謎', jp: 'アンノウン' },
    camp: { en: 'Shadow', zh: '暗影', jp: 'シャドウ' },
    win: {
      en: 'All Hunters die, or at least 3 Neutrals die.',
      zh: '所有獵人死亡，或至少 3 位中立死亡。',
      jp: 'ハンター全滅、または中立 3 名以上死亡。',
    },
    ability: {
      en: 'When receiving a green card, you may lie about your identity.',
      zh: '當你收到隱士卡時，你可以選擇說謊。(使用此項能力不需要展示身分)',
      jp: 'グリーンカード時、正体を偽れる（公開不要）。',
    },
  },
  'Valkyrie': {
    names: { en: 'Valkyrie', zh: '女武神', jp: 'ヴァルキリー' },
    camp: { en: 'Shadow', zh: '暗影', jp: 'シャドウ' },
    win: {
      en: 'All Hunters die, or at least 3 Neutrals die.',
      zh: '所有獵人死亡，或至少 3 位中立死亡。',
      jp: 'ハンター全滅、または中立 3 名以上死亡。',
    },
    ability: {
      en: 'Attack with only 1D4 instead of normal attack dice.',
      zh: '當你攻擊的時後，只擲四面骰，直接造成骰面的傷害。',
      jp: '攻撃は 1D4 のみでダメージ計算。',
    },
  },
  'Gregor': {
    names: { en: 'Gregor', zh: '葛雷格', jp: 'グレゴール' },
    camp: { en: 'Hunter', zh: '獵人', jp: 'ハンター' },
    win: {
      en: 'All Shadow characters die.',
      zh: '所有暗影角色死亡。',
      jp: 'シャドウ陣営が全滅する。',
    },
    ability: {
      en: 'At end phase, become immune to all damage until your next turn starts (once).',
      zh: '在你的回合結束時使用，直到你的下一個回合開始，你不會受到任何傷害。(每場遊戲限用一次)',
      jp: '終了時発動、次の自分の開始まで全ダメージ無効（1回）。',
    },
  },
  'Emi': {
    names: { en: 'Emi', zh: '映魅', jp: 'エミ' },
    camp: { en: 'Hunter', zh: '獵人', jp: 'ハンター' },
    win: {
      en: 'All Shadow characters die.',
      zh: '所有暗影角色死亡。',
      jp: 'シャドウ陣営が全滅する。',
    },
    ability: {
      en: 'During movement, you may move to an adjacent area directly.',
      zh: '當你移動時，你可以擲骰進行一般的移動，或是直接移動至接臨的地區。',
      jp: '移動時、隣接エリアへ直接移動できる。',
    },
  },
  'George': {
    names: { en: 'George', zh: '喬治', jp: 'ジョージ' },
    camp: { en: 'Hunter', zh: '獵人', jp: 'ハンター' },
    win: {
      en: 'All Shadow characters die.',
      zh: '所有暗影角色死亡。',
      jp: 'シャドウ陣営が全滅する。',
    },
    ability: {
      en: 'At start phase, deal 1D4 direct damage to one target (once).',
      zh: '在你的回合一開始，你可以選擇一位角色，擲一枚四面骰，並對他造成骰面上的傷害。(每場遊戲限用一次)',
      jp: '開始時、対象 1 人に 1D4 の直接ダメージ（1回）。',
    },
  },
  'Franklin': {
    names: { en: 'Franklin', zh: '法蘭克林', jp: 'フランクリン' },
    camp: { en: 'Hunter', zh: '獵人', jp: 'ハンター' },
    win: {
      en: 'All Shadow characters die.',
      zh: '所有暗影角色死亡。',
      jp: 'シャドウ陣営が全滅する。',
    },
    ability: {
      en: 'At start phase, deal 1D6 direct damage to one target (once).',
      zh: '在你的回合一開始，你可以選擇一位角色，擲一枚六面骰，並對他造成骰面上的傷害。(每場遊戲限用一次)',
      jp: '開始時、対象 1 人に 1D6 の直接ダメージ（1回）。',
    },
  },
  'Ellen': {
    names: { en: 'Ellen', zh: '艾蓮', jp: 'エレン' },
    camp: { en: 'Hunter', zh: '獵人', jp: 'ハンター' },
    win: {
      en: 'All Shadow characters die.',
      zh: '所有暗影角色死亡。',
      jp: 'シャドウ陣営が全滅する。',
    },
    ability: {
      en: 'At start phase, disable one target’s special ability until game end (once).',
      zh: '在你的回合一開始，選擇一位角色，該角色不能使用特殊能力直到遊戲結束。(每場遊戲限用一次)',
      jp: '開始時、対象 1 人の能力をゲーム終了まで封印（1回）。',
    },
  },
  'Fu-ka': {
    names: { en: 'Fu-ka', zh: '楓花', jp: 'フウカ' },
    camp: { en: 'Hunter', zh: '獵人', jp: 'ハンター' },
    win: {
      en: 'All Shadow characters die.',
      zh: '所有暗影角色死亡。',
      jp: 'シャドウ陣営が全滅する。',
    },
    ability: {
      en: 'At start phase, set one target’s damage value to 7 (once).',
      zh: '在你的回合一開始，選擇一位玩家，將該玩家的HP值調整為7。(每場遊戲限用一次)',
      jp: '開始時、対象 1 人のダメージ値を 7 にする（1回）。',
    },
  },
  'Agnes': {
    names: { en: 'Agnes', zh: '艾妮絲', jp: 'アグネス' },
    camp: { en: 'Civilian', zh: '中立', jp: 'ニュートラル' },
    win: {
      en: 'You win when the previous player wins (or next player if ability used).',
      zh: '上一位玩家獲勝時你獲勝（用能力後改為下一位）。',
      jp: '前のプレイヤー勝利で勝利（能力使用後は次のプレイヤー）。',
    },
    ability: {
      en: 'At start phase, switch your win condition target from previous to next.',
      zh: '回合開始可切換勝利條件目標（上家→下家）。',
      jp: '開始時、勝利条件の対象を前→次に切り替える。',
    },
  },
  'Allie': {
    names: { en: 'Allie', zh: '艾莉', jp: 'アリー' },
    camp: { en: 'Civilian', zh: '中立', jp: 'ニュートラル' },
    win: {
      en: 'Be alive when the game ends.',
      zh: '遊戲結束時仍然存活。',
      jp: 'ゲーム終了時に生存している。',
    },
    ability: {
      en: 'Heal all your damage (once).',
      zh: '回復自己所有傷害（一次）。',
      jp: '自分のダメージを全回復（1回）。',
    },
  },
  'Charles': {
    names: { en: 'Charles', zh: '查爾斯', jp: 'チャールズ' },
    camp: { en: 'Civilian', zh: '中立', jp: 'ニュートラル' },
    win: {
      en: 'Kill a character and total dead players are 3 or more.',
      zh: '你造成角色死亡且總死亡人數達 3 以上。',
      jp: '自分がキルし、死亡者合計が 3 人以上になる。',
    },
    ability: {
      en: 'After attacking, take 2 damage to attack the same target again.',
      zh: '攻擊後可自傷 2 點，對同目標再攻擊一次。',
      jp: '攻撃後に自傷 2 で同一対象へ再攻撃。',
    },
  },
  'Bryan': {
    names: { en: 'Bryan', zh: '布萊恩', jp: 'ブライアン' },
    camp: { en: 'Civilian', zh: '中立', jp: 'ニュートラル' },
    win: {
      en: 'Kill a character with HP > 13, or be in Erstwhile Altar when game ends.',
      zh: '殺死 HP>13 角色，或結束時身處古代祭壇。',
      jp: 'HP13超のキャラを倒す、または終了時に古代祭壇にいる。',
    },
    ability: {
      en: 'When your attack kills a character with HP < 12, reveal yourself.',
      zh: '攻擊殺死 HP<12 角色時，必須揭露。',
      jp: 'HP12未満のキャラを倒した時、自分を公開する。',
    },
  },
  'Bob': {
    names: { en: 'Bob', zh: '巴布', jp: 'ボブ' },
    camp: { en: 'Civilian', zh: '中立', jp: 'ニュートラル' },
    win: {
      en: 'Have more than 4 equipments (or more than 5 after using ability).',
      zh: '持有超過 4 件裝備（用過能力後需超過 5 件）。',
      jp: '装備 4 枚超（能力使用後は 5 枚超）。',
    },
    ability: {
      en: 'When your attack kills someone, take all that player’s equipment.',
      zh: '攻擊造成死亡時，取得對方全部裝備。',
      jp: '攻撃で倒した相手の装備をすべて獲得。',
    },
  },
  'Catherine': {
    names: { en: 'Catherine', zh: '凱薩琳', jp: 'キャサリン' },
    camp: { en: 'Civilian', zh: '中立', jp: 'ニュートラル' },
    win: {
      en: 'Be the first dead character, or survive among the last two players.',
      zh: '成為第一位死亡角色，或最後剩 2 人時你仍存活。',
      jp: '最初の死亡者になる、または最終 2 人で生存する。',
    },
    ability: {
      en: 'At start phase, heal 1 damage.',
      zh: '回合開始回復 1 點傷害。',
      jp: '開始時にダメージを 1 回復。',
    },
  },
  'Daniel': {
    names: { en: 'Daniel', zh: '丹尼爾', jp: 'ダニエル' },
    camp: { en: 'Civilian', zh: '中立', jp: 'ニュートラル' },
    win: {
      en: 'Be the first dead character, or all Shadows die while you survive.',
      zh: '成為第一位死亡角色，或所有暗影死亡且你存活。',
      jp: '最初の死亡者になる、またはシャドウ全滅時に生存。',
    },
    ability: {
      en: 'When another character dies, you must reveal yourself.',
      zh: '有其他角色死亡時，必須揭露。',
      jp: '他キャラ死亡時に自分を公開する。',
    },
  },
  'David': {
    names: { en: 'David', zh: '大衛', jp: 'デイビッド' },
    camp: { en: 'Civilian', zh: '中立', jp: 'ニュートラル' },
    win: {
      en: 'Own 3 or more among these 4 equipments: Holy Robe / Silver Rosary / Talisman / Spear of Longinus.',
      zh: '持有以下 4 件裝備中的任意 3 件以上：神聖法袍／秘銀念珠／辟邪護符／隆基努司之槍。',
      jp: '次の4装備のうち任意3種以上を所持する：賢者のローブ／銀のロザリオ／護符／ロンギヌスの槍。',
    },
    ability: {
      en: 'Take one chosen equipment from discard (once).',
      zh: '從棄牌堆取得一張指定裝備（一次）。',
      jp: '捨て札から指定した装備 1 枚を獲得（1回）。',
    },
  },
};

function normalizeLang(langHint) {
  const lower = String(langHint || '').toLowerCase();
  if (lower.startsWith('ja') || lower === 'jp') return 'jp';
  if (lower.startsWith('en')) return 'en';
  return 'zh';
}

export function getCurrentUiLang() {
  return normalizeLang(document?.documentElement?.lang || 'zh');
}

export function getCharacterInfo(characterEnName) {
  return CHARACTER_INFO[String(characterEnName || '').trim()] || null;
}

export function getAllCharacterInfos() {
  return Object.entries(CHARACTER_INFO).map(([key, info]) => ({ key, info }));
}

export function getCharacterLocalizedName(characterEnName, langHint = 'zh') {
  const info = getCharacterInfo(characterEnName);
  const lang = normalizeLang(langHint);
  const englishName = info?.names?.en || String(characterEnName || '').trim() || '???';
  if (lang === 'en') return englishName;
  return info?.names?.[lang] || englishName;
}

export function getCharacterTooltipName(characterEnName, langHint = 'zh') {
  const info = getCharacterInfo(characterEnName);
  const lang = normalizeLang(langHint);
  const englishName = info?.names?.en || String(characterEnName || '').trim() || '???';
  const localizedName = getCharacterLocalizedName(characterEnName, lang);
  const initial = String(englishName || '?').trim().charAt(0).toUpperCase() || '?';
  const tail = String(englishName || '').trim().slice(1);
  const codedEnglish = `(${initial})${tail || englishName}`;
  if (lang !== 'en' && localizedName && localizedName !== englishName) {
    return `${codedEnglish}(${localizedName})`;
  }
  return codedEnglish;
}

export function getCharacterTooltipInfo(characterEnName, langHint = 'zh') {
  const info = getCharacterInfo(characterEnName);
  if (!info) return null;
  const lang = normalizeLang(langHint);
  return {
    name: getCharacterTooltipName(characterEnName, lang),
    camp: info.camp?.[lang] || info.camp?.en || '-',
    win: info.win?.[lang] || info.win?.en || '-',
    ability: info.ability?.[lang] || info.ability?.en || '-',
  };
}
