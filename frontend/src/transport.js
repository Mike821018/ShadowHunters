import { t } from './i18n.js';
import { PLAYER_COLORS } from './constants.js';
import { apiFetch } from './utils.js';

const APP_VERSION = '1.1.0';
const DEMO_STORE_KEY = 'sh.demoStore.v1';
const DEMO_IDLE_TIMEOUT_MS = 15 * 60 * 1000;

const DEMO_CAMP_SETTING = {
  4: { Shadow: 2, Hunter: 2, Civilian: 0 },
  5: { Shadow: 2, Hunter: 2, Civilian: 1 },
  6: { Shadow: 2, Hunter: 2, Civilian: 2 },
  7: { Shadow: 2, Hunter: 2, Civilian: 3 },
  8: { Shadow: 3, Hunter: 3, Civilian: 2 },
};

const DEMO_ROLE_POOL = {
  Shadow: [
    { name: 'Wight', cap: 'W', extend: true, hp: 14, camp: 'Shadow' },
    { name: 'Vampire', cap: 'V', extend: false, hp: 13, camp: 'Shadow' },
    { name: 'Werewolf', cap: 'W', extend: false, hp: 14, camp: 'Shadow' },
    { name: 'Ultra Soul', cap: 'U', extend: true, hp: 11, camp: 'Shadow' },
    { name: 'Unknown', cap: 'U', extend: false, hp: 11, camp: 'Shadow' },
    { name: 'Valkyrie', cap: 'V', extend: false, hp: 11, camp: 'Shadow' },
  ],
  Hunter: [
    { name: 'Gregor', cap: 'G', extend: true, hp: 14, camp: 'Hunter' },
    { name: 'Emi', cap: 'E', extend: false, hp: 10, camp: 'Hunter' },
    { name: 'George', cap: 'G', extend: false, hp: 14, camp: 'Hunter' },
    { name: 'Franklin', cap: 'F', extend: false, hp: 12, camp: 'Hunter' },
    { name: 'Ellen', cap: 'E', extend: true, hp: 10, camp: 'Hunter' },
    { name: 'Fu-ka', cap: 'F', extend: true, hp: 10, camp: 'Hunter' },
  ],
  Civilian: [
    { name: 'Agnes', cap: 'A', extend: true, hp: 8, camp: 'Civilian' },
    { name: 'Allie', cap: 'A', extend: false, hp: 8, camp: 'Civilian' },
    { name: 'Charles', cap: 'C', extend: false, hp: 11, camp: 'Civilian' },
    { name: 'Bryan', cap: 'B', extend: true, hp: 10, camp: 'Civilian' },
    { name: 'Bob', cap: 'B', extend: false, hp: 10, camp: 'Civilian' },
    { name: 'Catherine', cap: 'C', extend: true, hp: 11, camp: 'Civilian' },
    { name: 'Daniel', cap: 'D', extend: false, hp: 13, camp: 'Civilian' },
    { name: 'David', cap: 'D', extend: true, hp: 13, camp: 'Civilian' },
  ],
};

const DEMO_AREA_DECK = [
  { name: "Hermit's Cabin", display_name: '隱士小屋', description: '你可以抽取一張隱士卡牌', numbers: [2, 3] },
  { name: "Hermit's Cabin", display_name: '隱士小屋', description: '你可以抽取一張隱士卡牌', numbers: [2, 3] },
  { name: 'Underworld Gate', display_name: '時空之門', description: '你可以抽取任意一張卡牌(黑色卡片、白色卡片、隱士卡片)', numbers: [4, 5] },
  { name: 'Underworld Gate', display_name: '時空之門', description: '你可以抽取任意一張卡牌(黑色卡片、白色卡片、隱士卡片)', numbers: [4, 5] },
  { name: 'Church', display_name: '教堂', description: '你可以抽取一張白色卡牌', numbers: [6] },
  { name: 'Cemetery', display_name: '墓園', description: '你可以抽取一張黑色卡牌', numbers: [8] },
  { name: 'Weird Woods', display_name: '希望與絕望的森林', description: '你可以對一位玩家造成2點傷害，或是治癒玩家1點血量', numbers: [9] },
  { name: 'Erstwhile Altar', display_name: '古代祭壇', description: '你可以拿取任何一位玩家的一張裝備', numbers: [10] },
];

function normalizeExpansionMode(mode) {
  const normalized = String(mode || 'all').trim().toLowerCase();
  if (normalized === 'replace') return 'all';
  if (['no_extend', 'noextend', 'none', 'basic', 'base'].includes(normalized)) return 'no_extend';
  return 'all';
}

function sampleWithoutReplacement(items, count) {
  const pool = [...items];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function resolveDemoRolePoolByMode(campRoles, expansionMode) {
  const mode = normalizeExpansionMode(expansionMode);
  if (mode === 'all') return [...campRoles];
  const base = campRoles.filter((role) => !role.extend);
  return base.length ? base : [...campRoles];
}

function assignDemoCharactersForRoom(room, areaNames) {
  const accounts = Object.keys(room.players || {});
  const config = DEMO_CAMP_SETTING[accounts.length];
  if (!config) throw new Error('demo requires 4 to 8 players');
  const mode = normalizeExpansionMode(room.expansion_mode);

  const pickedRoles = [];
  for (const camp of ['Shadow', 'Hunter', 'Civilian']) {
    const count = Number(config[camp] || 0);
    if (!count) continue;
    const pool = resolveDemoRolePoolByMode(DEMO_ROLE_POOL[camp] || [], mode);
    if (pool.length < count) throw new Error('insufficient character pool for selected expansion mode');
    pickedRoles.push(...sampleWithoutReplacement(pool, count));
  }

  const shuffledRoles = sampleWithoutReplacement(pickedRoles, pickedRoles.length);
  room.room_status = 2;
  room.actionOrder = [...accounts];
  room.turnIndex = 0;
  room.actionOrder.forEach((account, idx) => {
    const p = room.players[account];
    const role = shuffledRoles[idx];
    p.is_ready = false;
    p.status = idx === 0 ? 1 : 0;
    p.character = role?.name || null;
    p.character_camp = role?.camp || null;
    p.character_reveal = false;
    p.hp = Number(role?.hp || p.hp || 0);
    p.area = idx === 0 ? areaNames[0] : null;
    p.zone = p.area ? ((idx % 3) + 1) : 0;
  });
  room.fields = sampleWithoutReplacement(DEMO_AREA_DECK, 6).map((field) => ({
    ...field,
    numbers: Array.isArray(field.numbers) ? [...field.numbers] : [],
  }));
}

function nowIso() {
  return new Date().toISOString();
}

function sha1Hex(input) {
  const msg = unescape(encodeURIComponent(String(input || '')));
  const words = [];
  for (let i = 0; i < msg.length; i += 1) {
    words[i >> 2] |= msg.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  const bitLen = msg.length * 8;
  words[bitLen >> 5] |= 0x80 << (24 - (bitLen % 32));
  words[(((bitLen + 64) >> 9) << 4) + 15] = bitLen;

  const rotl = (n, s) => (n << s) | (n >>> (32 - s));
  const toHex = (n) => (`00000000${(n >>> 0).toString(16)}`).slice(-8);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;

  for (let i = 0; i < words.length; i += 16) {
    const w = new Array(80);
    for (let t = 0; t < 16; t += 1) w[t] = words[i + t] | 0;
    for (let t = 16; t < 80; t += 1) w[t] = rotl(w[t - 3] ^ w[t - 8] ^ w[t - 14] ^ w[t - 16], 1);

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let t = 0; t < 80; t += 1) {
      let f;
      let k;
      if (t < 20) {
        f = (b & c) | ((~b) & d);
        k = 0x5a827999;
      } else if (t < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (t < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }

      const temp = (rotl(a, 5) + f + e + k + w[t]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = temp;
    }

    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
  }

  return `${toHex(h0)}${toHex(h1)}${toHex(h2)}${toHex(h3)}${toHex(h4)}`;
}

function encryptTripLikeHigu(trip) {
  const text = String(trip || '').trim();
  if (!text) return '';
  const hex = sha1Hex(text);
  return btoa(hex).slice(1, 9);
}

function envelope(ok, event, data = null, error = null) {
  return {
    ok,
    event,
    data,
    error,
    meta: { timestamp: new Date().toISOString(), version: APP_VERSION },
  };
}

function fail(event, code, detail, status = 400) {
  return envelope(false, event, null, {
    title: 'Request Failed',
    status,
    detail,
    code,
    errors: [],
  });
}

function translateApiErrorMessage(error) {
  if (!error) return 'request failed';
  const code = String(error.code || '').trim();
  if (code) {
    const key = `api_error.${code}`;
    const params = {};
    if (code === 'TRIP_GAME_COUNT_NOT_ENOUGH') {
      const matchedMin = String(error.detail || '').match(/(\d+)/);
      if (matchedMin) {
        params.min = matchedMin[1];
      }
    }
    const translated = t(key, params);
    if (translated !== key) {
      return translated;
    }
  }
  return error.detail || code || 'request failed';
}

function createEmptyDemoStore() {
  return { nextRoomId: 1, rooms: new Map() };
}

function loadDemoStore() {
  try {
    const raw = localStorage.getItem(DEMO_STORE_KEY);
    if (!raw) return createEmptyDemoStore();
    const parsed = JSON.parse(raw);
    const nextRoomId = Math.max(1, Number(parsed?.nextRoomId || 1));
    const roomsArray = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
    const rooms = new Map();
    roomsArray.forEach((room) => {
      if (!room || room.room_id == null) return;
      rooms.set(Number(room.room_id), room);
    });
    return { nextRoomId, rooms };
  } catch {
    return createEmptyDemoStore();
  }
}

function saveDemoStore(demoStore) {
  try {
    const snapshot = {
      nextRoomId: Number(demoStore.nextRoomId || 1),
      rooms: Array.from(demoStore.rooms.values()),
    };
    localStorage.setItem(DEMO_STORE_KEY, JSON.stringify(snapshot));
  } catch {
  }
}

function isManagerTripMatched(room, trip) {
  const managerTrip = String(room.manager_trip || '').trim();
  if (!managerTrip || !trip) return false;
  const encrypted = room.manager_trip_encrypted !== false;
  return encrypted ? managerTrip === trip : (managerTrip === trip || encryptTripLikeHigu(managerTrip) === trip);
}

function touchRoom(room) {
  if (!room) return;
  room.last_activity_at = nowIso();
}

function cleanupInactiveRooms(demoStore) {
  const now = Date.now();
  Array.from(demoStore.rooms.entries()).forEach(([roomId, room]) => {
    if (!room || room.is_chat_room) return;
    const status = Number(room.room_status || 0);
    if (status !== 1 && status !== 2) return;
    const lastActivityMs = Date.parse(room.last_activity_at || '') || 0;
    if (!lastActivityMs) return;
    if ((now - lastActivityMs) >= DEMO_IDLE_TIMEOUT_MS) {
      demoStore.rooms.delete(roomId);
    }
  });
}

function removeKickVotesByVoter(room, voterAccount) {
  if (!room?.kickVotes || !voterAccount) return;
  Object.keys(room.kickVotes).forEach((target) => {
    room.kickVotes[target] = (room.kickVotes[target] || []).filter((v) => v !== voterAccount);
    if (!room.kickVotes[target].length) delete room.kickVotes[target];
  });
}

function removeKickVotesForTarget(room, targetAccount) {
  if (!room?.kickVotes || !targetAccount) return;
  delete room.kickVotes[targetAccount];
}

function clearKickVotes(room) {
  room.kickVotes = {};
}

function resetAllReady(room) {
  Object.values(room.players || {}).forEach((p) => {
    p.is_ready = false;
  });
}

function kickPlayer(room, account) {
  if (!room?.players?.[account]) return false;
  delete room.players[account];
  room.actionOrder = (room.actionOrder || []).filter((acc) => acc !== account);
  removeKickVotesByVoter(room, account);
  removeKickVotesForTarget(room, account);
  return true;
}

function buildRoomState(room, viewerAccount = null) {
  const currentAccount = room.turnIndex >= 0 ? room.actionOrder[room.turnIndex] : null;
  const currentPlayer = currentAccount ? room.players[currentAccount] : null;
  const hideTrip = room.hide_trip !== false;
  const shouldMaskTrip = hideTrip && Number(room.room_status || 0) !== 3;
  const maskTrip = (tripDisplay) => (shouldMaskTrip ? '-' : (tripDisplay || ''));
  const players = Object.fromEntries(
    Object.entries(room.players).map(([account, p]) => [
      account,
      (() => {
        // eslint-disable-next-line no-unused-vars
        const { password: _omit, ...pSafe } = p;
        const canViewCharacter = Boolean(p.character_reveal || (viewerAccount && account === viewerAccount));
        return {
          ...pSafe,
          trip_display: (viewerAccount && account === viewerAccount) ? (p.trip_display || '') : maskTrip(p.trip_display),
          hp: canViewCharacter ? p.hp : null,
          character: canViewCharacter ? p.character : null,
          character_camp: canViewCharacter ? (p.character_camp || null) : null,
          self_character: account === viewerAccount ? (p.character || null) : null,
          self_character_camp: account === viewerAccount ? (p.character_camp || null) : null,
        };
      })(),
    ])
  );

  let attackPrompt = null;
  if (currentPlayer && Number(currentPlayer.status || 0) === 4) {
    const targetAccounts = Object.entries(room.players || {})
      .filter(([account, player]) => {
        if (account === currentAccount || !player?.alive) return false;
        const attackerZone = Number(currentPlayer.zone || 0);
        const targetZone = Number(player.zone || 0);
        if (!attackerZone || !targetZone) return false;
        if (currentPlayer.eqp_range_atk) return attackerZone !== targetZone;
        return attackerZone === targetZone;
      })
      .map(([account]) => account);

    attackPrompt = {
      target_accounts: targetAccounts,
      force: Boolean(currentPlayer.eqp_force_atk),
    };
  }

  let areaPrompt = null;
  if (currentPlayer && Number(currentPlayer.status || 0) === 3 && !room.active_card && currentPlayer.area === 'Weird Woods') {
    const targetAccounts = Object.entries(room.players || {})
      .filter(([, player]) => Boolean(player?.alive))
      .map(([account]) => account);

    areaPrompt = {
      kind: 'weird-woods',
      area_name: 'Weird Woods',
      target_accounts: targetAccounts,
      options: ['Heal', 'Hurt'],
    };
  }
  if (currentPlayer && Number(currentPlayer.status || 0) === 3 && !room.active_card && currentPlayer.area === 'Erstwhile Altar') {
    const targetAccounts = Object.entries(room.players || {})
      .filter(([account, player]) => account !== currentAccount && Boolean(player?.alive) && Array.isArray(player?.equipment) && player.equipment.length > 0)
      .map(([account]) => account);

    areaPrompt = {
      kind: 'altar',
      area_name: 'Erstwhile Altar',
      target_accounts: targetAccounts,
      options: [],
    };
  }

  let cardPrompt = null;
  if (currentPlayer && room.active_card) {
    const cardTarget = String(room.active_card.target || '').trim();
    let targetAccounts = [];
    if (cardTarget === 'other' || cardTarget === 'one') {
      targetAccounts = Object.entries(room.players || {})
        .filter(([account, player]) => Boolean(player?.alive) && (cardTarget !== 'other' || account !== currentAccount))
        .map(([account]) => account);
    }
    cardPrompt = {
      name: String(room.active_card.name || ''),
      target: cardTarget,
      target_accounts: targetAccounts,
    };
  }

  const pendingSteal = room.pending_steal || null;

  // viewer-aware active card display
  const activeCardDisplay = (() => {
    if (!room.active_card) return null;
    const color = String(room.active_card.color || '').toLowerCase();
    const isGreen = color === 'green';
    const cardTargetAccounts = cardPrompt ? (cardPrompt.target_accounts || []) : [];
    const canSeeName = !isGreen || viewerAccount === currentAccount || Boolean(viewerAccount && cardTargetAccounts.includes(viewerAccount));
    return {
      color,
      type: String(room.active_card.type || ''),
      name: canSeeName ? String(room.active_card.name || '') : null,
    };
  })();


  return {
    room: {
      room_id: room.room_id,
      room_name: room.room_name,
      room_comment: room.room_comment || '',
      room_status: room.room_status,
      is_chat_room: Boolean(room.is_chat_room),
      max_players: Number(room.max_players || (room.is_chat_room ? 50 : 8)),
      require_trip: Boolean(room.require_trip),
      hide_trip: hideTrip,
      trip_min_games: Number(room.trip_min_games || 0),
      manager_trip_enabled: Boolean(room.manager_trip),
      manager_trip_encrypted: room.manager_trip_encrypted !== false,
      player_count: Object.keys(room.players).length,
      players: Object.keys(room.players),
    },
    turn: {
      current_trip_display: currentPlayer ? maskTrip(currentPlayer.trip_display) : '',
      current_account: currentAccount,
      status: currentPlayer ? currentPlayer.status : null,
    },
    action_order: room.actionOrder || [],
    move_options: room.moveOptions || [],
    compass_options: room.compassOptions || [],
    pending_kill_loot: room.pendingKillLoot || null,
    pending_steal: pendingSteal,
    area_prompt: areaPrompt,
    card_prompt: cardPrompt,
    attack_prompt: attackPrompt,
    active_card_display: activeCardDisplay,
    active_card: room.active_card ? {
      name: String(room.active_card.name || ''),
      type: String(room.active_card.type || ''),
      color: String(room.active_card.color || ''),
      target: String(room.active_card.target || ''),
    } : null,
    dice: {
      D6: Number(room?.dice?.D6 || 1),
      D4: Number(room?.dice?.D4 || 1),
    },
    fields: Array.isArray(room.fields) ? room.fields.map((field) => (field ? {
      ...field,
      numbers: Array.isArray(field.numbers) ? [...field.numbers] : [],
    } : null)) : [],
    card_piles: room.card_piles || {
      Green: { deck: 0, discard: 0 },
      White: { deck: 0, discard: 0 },
      Black: { deck: 0, discard: 0 },
    },
    players,
  };
}

export function createDispatch({ state, setStatus, pushLog, toast, withVillageSuffix, areaNames }) {
  const demoStore = loadDemoStore();

  function demoDispatch(action, payload = {}) {
    cleanupInactiveRooms(demoStore);

    if (action === 'list_rooms') {
      return envelope(
        true,
        action,
        Array.from(demoStore.rooms.values()).map((r) => ({
          room_id: r.room_id,
          room_name: r.room_name,
          room_comment: r.room_comment || '',
          room_status: r.room_status,
          is_chat_room: Boolean(r.is_chat_room),
          max_players: Number(r.max_players || (r.is_chat_room ? 50 : 8)),
          require_trip: Boolean(r.require_trip),
          hide_trip: r.hide_trip !== false,
          trip_min_games: Number(r.trip_min_games || 0),
          manager_trip_enabled: Boolean(r.manager_trip),
          manager_trip_encrypted: r.manager_trip_encrypted !== false,
          expansion_mode: normalizeExpansionMode(r.expansion_mode),
          player_count: Object.keys(r.players).length,
          players: Object.keys(r.players),
        }))
      );
    }

    if (action === 'create_room') {
      const room_name = withVillageSuffix(payload.room_name);
      const room_comment = String(payload.room_comment || '').trim();
      const require_trip = Boolean(payload.require_trip);
      const hide_trip = payload.hide_trip !== false;
      const trip_min_games = Math.max(0, Number.parseInt(String(payload.trip_min_games ?? '0'), 10) || 0);
      let manager_trip = String(payload.manager_trip || '').trim();
      let manager_trip_encrypted = payload.manager_trip_encrypted !== false;
      if (manager_trip && !manager_trip_encrypted) {
        manager_trip = encryptTripLikeHigu(manager_trip);
        manager_trip_encrypted = true;
      }
      const is_chat_room = Boolean(payload.is_chat_room);
      const expansion_mode = normalizeExpansionMode(payload.expansion_mode || 'all');
      if (!room_name) return fail(action, 'ROOM_NAME_REQUIRED', 'room_name is required');

      const room = {
        room_id: demoStore.nextRoomId++,
        room_name,
        room_comment,
        room_status: 1,
        is_chat_room,
        max_players: is_chat_room ? 50 : 8,
        require_trip,
        hide_trip,
        trip_min_games,
        manager_trip,
        manager_trip_encrypted,
        expansion_mode,
        last_activity_at: nowIso(),
        kickVotes: {},
        joinSeq: 0,
        players: {},
        actionOrder: [],
        turnIndex: -1,
        moveOptions: [],
        compassOptions: [],
        pendingKillLoot: null,
        fields: [],
        dice: { D6: 1, D4: 1 },
      };
      demoStore.rooms.set(room.room_id, room);
      saveDemoStore(demoStore);
      return envelope(true, action, {
        room_id: room.room_id,
        room_name: room.room_name,
        room_comment: room.room_comment,
        room_status: room.room_status,
        is_chat_room: room.is_chat_room,
        max_players: room.max_players,
        require_trip: room.require_trip,
        hide_trip: room.hide_trip !== false,
        trip_min_games: room.trip_min_games,
        manager_trip_enabled: Boolean(room.manager_trip),
        manager_trip_encrypted: room.manager_trip_encrypted !== false,
        expansion_mode: room.expansion_mode,
        player_count: 0,
        players: [],
      });
    }

    if (action === 'join_room') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      const tripRaw = String(payload.player_info?.trip || '').trim();
      const trip = tripRaw ? encryptTripLikeHigu(tripRaw) : '';
      const name = String(payload.player_info?.name || '').trim();
      const account = String(payload.player_info?.account || '').trim();
      const password = String(payload.player_info?.password || '');
      const internalAccount = account;
      if (!account || !name) return fail(action, 'INVALID_PAYLOAD', '缺少帳號或暱稱');
      if (Object.keys(room.players).length >= Number(room.max_players || (room.is_chat_room ? 50 : 8))) {
        return fail(action, 'ROOM_FULL', '房間人數已滿，無法住民登記，請直接登入既有帳號', 400);
      }
      if (room.require_trip && !trip) {
        return fail(action, 'TRIP_REQUIRED', '此村子需要填寫 TRIP 才能加入');
      }

      if (trip && Object.values(room.players).some((player) => player.trip_display === trip)) {
        return fail(action, 'TRIP_ALREADY_EXISTS', 'TRIP 已重複，請更換');
      }
      if (Object.values(room.players).some((player) => player.account === account)) {
        return fail(action, 'ACCOUNT_ALREADY_EXISTS', '帳號已存在，請更換');
      }
      if (name && Object.values(room.players).some((player) => player.name === name)) {
        return fail(action, 'NAME_ALREADY_EXISTS', '暱稱已存在，請更換');
      }
      const takenColors = new Set(Object.values(room.players).map((pl) => pl.color));
      const assignedColor = PLAYER_COLORS.find((c) => !takenColors.has(c)) || '';
      room.joinSeq = Number(room.joinSeq || 0) + 1;
      room.players[internalAccount] = {
        trip_display: trip,
        name,
        account,
        join_order: room.joinSeq,
        password,
        avatar_no: Number(payload.player_info?.avatar_no || 1),
        is_village_manager: isManagerTripMatched(room, trip),
        is_ready: false,
        color: assignedColor,
        alive: true,
        status: 0,
        damage: 0,
        hp: 12,
        zone: 0,
        area: null,
        character_reveal: false,
        character: null,
        equipment: [],
      };
      touchRoom(room);
      saveDemoStore(demoStore);
      return envelope(true, action, { ...buildRoomState(room, internalAccount), join_account: internalAccount });
    }

    if (action === 'leave_room') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      const account = String(payload.account || '').trim();
      if (!account) return fail(action, 'INVALID_PAYLOAD', '缺少帳號');
      if (!room.players[account]) return fail(action, 'LEAVE_FAILED', 'leave room failed', 400);
      kickPlayer(room, account);
      resetAllReady(room);
      touchRoom(room);
      // 不再於最後一位玩家離開時自動刪除房間。
      // TODO: 待實作獨立廢村機制後再由該機制處理房間生命週期。
      saveDemoStore(demoStore);
      return envelope(true, action, { room_id: Number(payload.room_id), account });
    }

    if (action === 'start_game') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', 'room not found', 404);
      if (room.is_chat_room) return fail(action, 'CHAT_ROOM_NO_GAME', '聊天村不可開始遊戲', 400);
      const accounts = Object.keys(room.players);
      if (accounts.length < 4 || accounts.length > 8) return fail(action, 'BAD_REQUEST', 'demo requires 4 to 8 players');
      const usedColors = new Set(
        Object.values(room.players)
          .map((p) => p.color)
          .filter((c) => PLAYER_COLORS.includes(c))
      );
      const remainColors = PLAYER_COLORS.filter((c) => !usedColors.has(c));
      let remainIdx = 0;
      accounts.forEach((account, idx) => {
        const p = room.players[account];
        if (!PLAYER_COLORS.includes(p.color)) {
          p.color = remainColors[remainIdx] || PLAYER_COLORS[idx % PLAYER_COLORS.length];
          remainIdx += 1;
        }
      });
      assignDemoCharactersForRoom(room, areaNames);
      touchRoom(room);
      saveDemoStore(demoStore);
      return envelope(true, action, buildRoomState(room, String(payload.account || payload.viewer_account || '').trim() || null));
    }

    if (
      action === 'get_room_state'
      || action === 'card_effect'
      || action === 'loot_from_kill'
      || action === 'steal_equipment'
      || action === 'set_green_card_choice'
      || action === 'confirm_green_card'
      || action === 'confirm_equipment'
    ) {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      touchRoom(room);
      saveDemoStore(demoStore);
      return envelope(true, action, buildRoomState(room, String(payload.account || payload.viewer_account || '').trim() || null));
    }

    if (action === 'next_step') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      if (room.turnIndex < 0) return fail(action, 'BAD_REQUEST', '遊戲尚未開始');
      const currentAccount = room.actionOrder[room.turnIndex];
      const p = room.players[currentAccount];
      const target = payload.target || { kind: 'none' };

      if (p.status === 1) p.status = 2;
      else if (p.status === 2) {
        room.dice = {
          D6: 1 + Math.floor(Math.random() * 6),
          D4: 1 + Math.floor(Math.random() * 4),
        };
        if (target.kind === 'area' && target.id) {
          p.area = target.id;
          p.zone = (areaNames.indexOf(target.id) % 3) + 1;
          room.moveOptions = [];
          p.status = 3;
      touchRoom(room);
        } else {
          room.moveOptions = areaNames.filter((a) => a !== p.area);
        }
      } else if (p.status === 3) p.status = 4;
      else if (p.status === 4) p.status = 5;
      else if (p.status === 5) p.status = 6;
      else if (p.status === 6) {
        p.status = 0;
        room.turnIndex = (room.turnIndex + 1) % room.actionOrder.length;
        room.players[room.actionOrder[room.turnIndex]].status = 1;
      }

      saveDemoStore(demoStore);

      return envelope(true, action, buildRoomState(room, String(payload.account || payload.viewer_account || '').trim() || null));
    }

    if (action === 'change_color') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      const { account, color } = payload;
      if (room.room_status !== 1) return fail(action, 'NOT_RECRUITING', '游戲已開始，無法更換顏色', 400);
      if (!PLAYER_COLORS.includes(color)) return fail(action, 'INVALID_COLOR', '無效的顏色', 400);
      const colorTaken = Object.entries(room.players).some(([acc, p]) => acc !== account && p.color === color);
      if (colorTaken) return fail(action, 'COLOR_TAKEN', '此顏色已被他人選用', 400);
      if (!room.players[account]) return fail(action, 'PLAYER_NOT_FOUND', '玩家不存在', 404);
      if (room.players[account].is_ready) return fail(action, 'PLAYER_READY', '已準備完成的玩家不可更換顏色', 400);
      room.players[account].color = color;
      touchRoom(room);
      saveDemoStore(demoStore);
      return envelope(true, action, buildRoomState(room, String(account || payload.viewer_account || '').trim() || null));
    }

    if (action === 'toggle_ready') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      const account = String(payload.account || '').trim();
      if (!account) return fail(action, 'INVALID_PAYLOAD', '缺少帳號', 400);
      if (room.room_status !== 1) return fail(action, 'NOT_RECRUITING', '僅招募中可設定準備狀態', 400);
      const player = room.players[account];
      if (!player) return fail(action, 'PLAYER_NOT_FOUND', '玩家不存在', 404);

      player.is_ready = !player.is_ready;

      const accounts = Object.keys(room.players);
      const allReady = !room.is_chat_room && accounts.length >= 4 && accounts.every((acc) => room.players[acc]?.is_ready);
      if (allReady) {
        const usedColors = new Set(
          Object.values(room.players)
            .map((p) => p.color)
            .filter((c) => PLAYER_COLORS.includes(c))
        );
        const remainColors = PLAYER_COLORS.filter((c) => !usedColors.has(c));
        let remainIdx = 0;
        room.actionOrder = [...accounts];
        room.turnIndex = 0;
        room.actionOrder.forEach((acc, idx) => {
          const p = room.players[acc];
          if (!PLAYER_COLORS.includes(p.color)) {
            p.color = remainColors[remainIdx] || PLAYER_COLORS[idx % PLAYER_COLORS.length];
            remainIdx += 1;
          }
        });
        assignDemoCharactersForRoom(room, areaNames);
      }

      touchRoom(room);
      saveDemoStore(demoStore);
      return envelope(true, action, buildRoomState(room, account || null));
    }

    if (action === 'vote_kick') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      if (room.room_status !== 1) return fail(action, 'NOT_RECRUITING', '僅招募中可投票剔除', 400);
      const voterAccount = String(payload.voter_account || '').trim();
      const targetAccount = String(payload.target_account || '').trim();
      if (!voterAccount || !targetAccount) return fail(action, 'INVALID_PAYLOAD', '缺少必要參數', 400);
      if (voterAccount === targetAccount) return fail(action, 'BAD_REQUEST', '不可對自己投票剔除', 400);
      const voter = room.players[voterAccount];
      const target = room.players[targetAccount];
      if (!voter || !target) return fail(action, 'PLAYER_NOT_FOUND', '玩家不存在', 404);

      if (voter.is_village_manager) {
        if (!kickPlayer(room, targetAccount)) return fail(action, 'KICK_FAILED', '剔除失敗', 400);
        clearKickVotes(room);
        resetAllReady(room);
        touchRoom(room);
        saveDemoStore(demoStore);
        return envelope(true, action, buildRoomState(room, voterAccount || null));
      }

      removeKickVotesByVoter(room, voterAccount);
      const targetVotes = room.kickVotes[targetAccount] || [];
      if (!targetVotes.includes(voterAccount)) targetVotes.push(voterAccount);
      room.kickVotes[targetAccount] = targetVotes;

      if (targetVotes.length >= 3) {
        if (!kickPlayer(room, targetAccount)) return fail(action, 'KICK_FAILED', '剔除失敗', 400);
        clearKickVotes(room);
        resetAllReady(room);
      }

      touchRoom(room);
      saveDemoStore(demoStore);
      return envelope(true, action, buildRoomState(room, voterAccount || null));
    }

    if (action === 'abolish_room') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      const account = String(payload.account || '').trim();
      if (!account) return fail(action, 'INVALID_PAYLOAD', '缺少帳號', 400);
      const requester = room.players[account];
      if (!requester || !requester.is_village_manager) {
        return fail(action, 'NOT_VILLAGE_MANAGER', '只有村長可以廢除村莊', 403);
      }
      demoStore.rooms.delete(Number(payload.room_id));
      saveDemoStore(demoStore);
      return envelope(true, action, { room_id: Number(payload.room_id) });
    }

    if (action === 'login_room') {
      const room = demoStore.rooms.get(Number(payload.room_id));
      if (!room) return fail(action, 'ROOM_NOT_FOUND', '房間不存在', 404);
      const account = String(payload.account || '').trim();
      const password = String(payload.password || '');
      const matchedAccount = Object.entries(room.players).find(
        ([, p]) => p.account === account && p.password === password
      )?.[0];
      if (!matchedAccount) return fail(action, 'LOGIN_FAILED', '帳號密碼錯誤', 401);
      return envelope(true, action, { ...buildRoomState(room, matchedAccount), login_account: matchedAccount });
    }

    return fail(action, 'ACTION_NOT_SUPPORTED', 'action is not supported', 404);
  }

  async function transportHttp(req) {
    const resp = await apiFetch('/api/dispatch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    let body = null;
    try {
      body = await resp.json();
    } catch {
    }
    if (body && typeof body === 'object' && 'ok' in body) {
      return body;
    }
    if (!resp.ok) return fail(req.action, 'HTTP_ERROR', `status ${resp.status}`, resp.status);
    return envelope(true, req.action, body);
  }

  async function transport(req) {
    if (state.transportMode === 'demo') return demoDispatch(req.action, req.payload);
    if (state.transportMode === 'http') return transportHttp(req);

    if (window.SHADOW_API_DISPATCH && typeof window.SHADOW_API_DISPATCH === 'function') {
      return await window.SHADOW_API_DISPATCH(req.action, req.payload);
    }

    try {
      const result = await transportHttp(req);
      if (!result.ok && result.error?.code === 'HTTP_ERROR') {
        return demoDispatch(req.action, req.payload);
      }
      return result;
    } catch {
      return demoDispatch(req.action, req.payload);
    }
  }

  return async function dispatch(action, payload = {}, options = {}) {
    const responseEnvelope = await transport({ action, payload });
    if (!responseEnvelope.ok) {
      const msg = translateApiErrorMessage(responseEnvelope?.error);
      if (!options.silent) {
        pushLog(action, `失敗：${msg}`);
        toast(msg, 'error');
      }
      const err = new Error(msg);
      err.code = responseEnvelope?.error?.code;
      throw err;
    }
    if (!options.silent) {
      setStatus(`最後事件: ${responseEnvelope.event}`);
      pushLog(action, '成功');
    }
    return responseEnvelope.data;
  };
}
