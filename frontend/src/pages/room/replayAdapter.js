function formatReplayDateTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const parsed = new Date(raw.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return raw;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  const hh = String(parsed.getHours()).padStart(2, '0');
  const mm = String(parsed.getMinutes()).padStart(2, '0');
  const ss = String(parsed.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

function mergeReplayChatMessages(finalState, record) {
  const finalStateMessages = Array.isArray(finalState?.chat_messages) ? finalState.chat_messages : [];
  const recordMessages = Array.isArray(record?.chat_messages) ? record.chat_messages : [];
  const merged = [];
  const seen = new Set();

  [...finalStateMessages, ...recordMessages].forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const key = [
      String(row.id || ''),
      String(row.type || ''),
      String(row.account || ''),
      String(row.name || ''),
      String(row.text || ''),
      String(row.timestamp || ''),
    ].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(row);
  });

  merged.sort((a, b) => {
    const ta = Number(a?.timestamp || 0);
    const tb = Number(b?.timestamp || 0);
    if (ta !== tb) return ta - tb;
    const ia = Number(a?.id || 0);
    const ib = Number(b?.id || 0);
    return ia - ib;
  });

  return merged;
}

const REPLAY_FIELD_INFO_BY_NAME = Object.freeze({
  "Hermit's Cabin": {
    display_name: '隱士小屋',
    description: '抽一張綠卡。',
  },
  'Underworld Gate': {
    display_name: '時空之門',
    description: '抽一張白卡、綠卡或黑卡。',
  },
  Church: {
    display_name: '教堂',
    description: '抽一張白卡。',
  },
  Cemetery: {
    display_name: '墓園',
    description: '抽一張黑卡。',
  },
  'Weird Woods': {
    display_name: '希望與絕望的森林',
    description: '指定任意一名玩家（包含自己），造成 2 傷害或回復 1 傷害。',
  },
  'Erstwhile Altar': {
    display_name: '古代祭壇',
    description: '奪取任意一名玩家的一件裝備（若有的話）。',
  },
});

const REPLAY_FIELD_INFO_ALIAS = Object.freeze({
  '隱士小屋': "Hermit's Cabin",
  '時空之門': 'Underworld Gate',
  教堂: 'Church',
  墓園: 'Cemetery',
  '希望與絕望的森林': 'Weird Woods',
  '古代祭壇': 'Erstwhile Altar',
  '隠者の庵': "Hermit's Cabin",
  '冥界の門': 'Underworld Gate',
  教会: 'Church',
  墓地: 'Cemetery',
  '希望と絶望の森': 'Weird Woods',
  '古の祭壇': 'Erstwhile Altar',
});

function enrichReplayFields(fields) {
  if (!Array.isArray(fields)) return [];
  return fields.map((field) => {
    if (!field || typeof field !== 'object') return field;
    const rawName = String(field.name || '').trim();
    const canonicalName = REPLAY_FIELD_INFO_ALIAS[rawName] || rawName;
    const fallbackInfo = REPLAY_FIELD_INFO_BY_NAME[canonicalName] || null;
    if (!fallbackInfo) return field;
    return {
      ...field,
      name: canonicalName || rawName,
      display_name: String(field.display_name || '').trim() || fallbackInfo.display_name,
      description: String(field.description || '').trim() || fallbackInfo.description,
    };
  });
}

export function buildReplayRoomState(record) {
  const parseBool = (value) => {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(normalized)) return false;
    return Boolean(value);
  };

  const parseTimeoutMinutes = (value) => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 3;
    return Math.max(2, Math.min(30, Math.round(n)));
  };

  const finalState = record && typeof record.final_state === 'object' ? record.final_state : null;
  const mergedReplayMessages = mergeReplayChatMessages(finalState, record);
  const legacyPlayers = Array.isArray(record?.players) ? record.players : [];
  const legacyRoleByAccount = {};
  const legacyRoleByJoinOrder = {};
  const replayRoleByName = {};
  const replayRoleByAccount = {};
  legacyPlayers.forEach((p, idx) => {
    const account = String(p?.player_id || `player_${idx + 1}`).trim();
    const playerName = String(p?.player_name || '').trim();
    const roleName = String(p?.character_name || '').trim();
    const roleCamp = String(p?.character_camp || '').trim().toLowerCase();
    if (!account) return;
    legacyRoleByAccount[account] = {
      character: roleName,
      camp: roleCamp,
    };
    if (roleName) {
      replayRoleByAccount[account] = roleName;
    }
    if (playerName && roleName) {
      replayRoleByName[playerName] = roleName;
    }
    legacyRoleByJoinOrder[idx + 1] = {
      character: roleName,
      camp: roleCamp,
    };
  });
  const finalStatePlayers = finalState?.players;
  const hasStructuredFinalStatePlayers = (
    finalState
    && finalState.room
    && finalStatePlayers
    && typeof finalStatePlayers === 'object'
    && !Array.isArray(finalStatePlayers)
    && Object.keys(finalStatePlayers).length > 0
  );

  if (hasStructuredFinalStatePlayers) {
    const replayWinners = Array.isArray(record?.winner_players) && record.winner_players.length
      ? record.winner_players
      : (Array.isArray(finalState?.winners) ? finalState.winners : []);
    const winnerSet = new Set(replayWinners.map((value) => String(value || '').trim()).filter(Boolean));
    const serializedPlayers = {};
    Object.entries(finalStatePlayers || {}).forEach(([account, p], idx) => {
      const key = String(account || '').trim() || `player_${idx + 1}`;
      const joinOrder = Number(p?.join_order || idx + 1);
      const legacyRole = legacyRoleByAccount[key] || legacyRoleByJoinOrder[joinOrder] || legacyRoleByJoinOrder[idx + 1] || {};
      const resolvedCharacter = String(p?.character || p?.character_name || legacyRole.character || '').trim();
      const resolvedCamp = String(p?.character_camp || p?.camp || legacyRole.camp || '').trim().toLowerCase();
      serializedPlayers[key] = {
        account: key,
        trip_display: String(p?.trip_display || '-'),
        name: String(p?.name || key),
        join_order: Number(p?.join_order || idx + 1),
        avatar_no: Number(p?.avatar_no || 1),
        color: String(p?.color || 'white'),
        is_ready: Boolean(p?.is_ready),
        alive: Boolean(p?.alive),
        status: Number(p?.status || 0),
        damage: Number(p?.damage ?? 0),
        hp: Number(p?.hp ?? 0),
        invulnerability_source: String(p?.invulnerability_source || ''),
        zone: Number(p?.zone || 0),
        area: p?.area ? String(p.area) : null,
        is_village_manager: false,
        character_reveal: true,
        character: resolvedCharacter,
        character_name: resolvedCharacter,
        character_camp: resolvedCamp,
        can_use_ability: p?.can_use_ability == null ? null : Boolean(p.can_use_ability),
        ability_status: String(p?.ability_status || ''),
        character_ability_timing: Number(p?.character_ability_timing || 0),
        character_ability_target: String(p?.character_ability_target || ''),
        self_character: null,
        self_character_camp: null,
        self_can_use_ability: null,
        self_character_ability_timing: null,
        self_character_ability_target: null,
        is_invulnerable: Boolean(p?.is_invulnerable),
        invulnerability_sources: [],
        equipment: Array.isArray(p?.equipment) ? p.equipment : [],
        replay_winner: winnerSet.has(key),
        boomed: Boolean(p?.boomed),
      };
    });

    return {
      room: {
        room_id: Number(finalState?.room?.room_id || record?.room_id || 0),
        room_name: String(finalState?.room?.room_name || record?.game_settings?.room_name || `${Number(record?.room_id || 0)}村`),
        room_status: 3,
        player_count: Object.keys(serializedPlayers).length,
        max_players: Number(finalState?.room?.max_players || 8),
        room_comment: String(finalState?.room?.room_comment || record?.game_settings?.room_comment || '-'),
        require_trip: parseBool(record?.game_settings?.require_trip ?? finalState?.room?.require_trip),
        expansion_mode: String(record?.game_settings?.expansion_mode || finalState?.room?.expansion_mode || 'all'),
        enable_initial_green_card: parseBool(record?.game_settings?.enable_initial_green_card ?? finalState?.room?.enable_initial_green_card),
        enable_neutral_chaos_mode: parseBool(record?.game_settings?.enable_neutral_chaos_mode ?? finalState?.room?.enable_neutral_chaos_mode),
        turn_timeout_minutes: parseTimeoutMinutes(record?.game_settings?.turn_timeout_minutes ?? finalState?.room?.turn_timeout_minutes),
        replay_notice: `歷史回放：${formatReplayDateTime(record?.game_date)}`,
        is_chat_room: false,
      },
      turn: {
        current_trip_display: String(finalState?.turn?.current_trip_display || '-'),
        current_account: finalState?.turn?.current_account ? String(finalState.turn.current_account) : null,
        status: Number(finalState?.turn?.status || 0),
      },
      action_order: Array.isArray(finalState?.action_order) ? finalState.action_order : Object.keys(serializedPlayers),
      move_options: [],
      compass_options: [],
      pending_kill_loot: null,
      pending_steal: null,
      winners: replayWinners,
      area_prompt: null,
      card_prompt: null,
      green_confirm_prompt: null,
      attack_prompt: null,
      active_card_display: null,
      active_card: null,
      dice: {
        D6: Number(finalState?.dice?.D6 || 1),
        D4: Number(finalState?.dice?.D4 || 1),
      },
      fields: enrichReplayFields(finalState?.fields),
      card_piles: finalState?.card_piles && typeof finalState.card_piles === 'object' ? finalState.card_piles : {},
      replay_role_by_name: replayRoleByName,
      replay_role_by_account: replayRoleByAccount,
      players: serializedPlayers,
      chat_messages: mergedReplayMessages,
    };
  }

  const players = legacyPlayers;
  const winnerSet = new Set(Array.isArray(record?.winner_players) ? record.winner_players.map((value) => String(value || '').trim()) : []);
  const colorPool = ['red', 'blue', 'green', 'yellow', 'black', 'white', 'purple', 'orange'];

  const serializedPlayers = {};
  players.forEach((p, idx) => {
    const account = String(p?.player_id || `player_${idx + 1}`).trim();
    serializedPlayers[account] = {
      account,
      trip_display: String(p?.trip_display || '-'),
      name: String(p?.player_name || account),
      join_order: idx + 1,
      avatar_no: Number(p?.avatar_no || 1),
      color: colorPool[idx % colorPool.length],
      is_ready: false,
      alive: Boolean(p?.is_alive),
      status: 0,
      damage: Number(p?.damage_taken ?? 0),
      hp: Number((Number(p?.final_hp ?? 0) || 0) + (Number(p?.damage_taken ?? 0) || 0)),
      invulnerability_source: '',
      zone: 0,
      area: null,
      is_village_manager: false,
      character_reveal: true,
      character: String(p?.character_name || ''),
      character_name: String(p?.character_name || ''),
      character_camp: String(p?.character_camp || '').toLowerCase(),
      self_character: null,
      self_character_camp: null,
      self_can_use_ability: null,
      self_character_ability_timing: null,
      self_character_ability_target: null,
      is_invulnerable: false,
      invulnerability_sources: [],
      equipment: Array.isArray(p?.cards_equipped) ? p.cards_equipped : [],
      replay_winner: winnerSet.has(account),
      boomed: Boolean(p?.boomed),
    };
  });

  return {
    room: {
      room_id: Number(record?.room_id || 0),
      room_name: String(record?.game_settings?.room_name || `${Number(record?.room_id || 0)}村`),
      room_status: 3,
      player_count: players.length,
      max_players: 8,
      room_comment: String(record?.game_settings?.room_comment || '-'),
      require_trip: parseBool(record?.game_settings?.require_trip ?? finalState?.room?.require_trip),
      expansion_mode: String(record?.game_settings?.expansion_mode || finalState?.room?.expansion_mode || 'all'),
      enable_initial_green_card: parseBool(record?.game_settings?.enable_initial_green_card ?? finalState?.room?.enable_initial_green_card),
      enable_neutral_chaos_mode: parseBool(record?.game_settings?.enable_neutral_chaos_mode ?? finalState?.room?.enable_neutral_chaos_mode),
      turn_timeout_minutes: parseTimeoutMinutes(record?.game_settings?.turn_timeout_minutes ?? finalState?.room?.turn_timeout_minutes),
      replay_notice: `歷史回放：${formatReplayDateTime(record?.game_date)}`,
      is_chat_room: false,
    },
    turn: {
      current_trip_display: '-',
      current_account: null,
      status: 0,
    },
    action_order: Object.keys(serializedPlayers),
    move_options: [],
    compass_options: [],
    pending_kill_loot: null,
    pending_steal: null,
    winners: Array.isArray(record?.winner_players) ? record.winner_players : [],
    area_prompt: null,
    card_prompt: null,
    green_confirm_prompt: null,
    attack_prompt: null,
    active_card_display: null,
    active_card: null,
    dice: { D6: 1, D4: 1 },
    fields: enrichReplayFields(finalState?.fields),
    card_piles: {},
    replay_role_by_name: replayRoleByName,
    replay_role_by_account: replayRoleByAccount,
    players: serializedPlayers,
    chat_messages: mergedReplayMessages,
  };
}