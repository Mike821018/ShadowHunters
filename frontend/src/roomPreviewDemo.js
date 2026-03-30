import { loadAvatarCatalog } from './avatarConfig.js';
import { getCharacterLocalizedName, getCurrentUiLang } from './characterInfo.js';
import { applyI18n, bindLangSwitcher, initI18n, t } from './i18n.js';
import { renderPlayerCards } from './ui.js';
import { esc, getInitial, withVillageSuffix } from './utils.js';
import { DAMAGE_ROLE_MARKERS, DAMAGE_TRACK_VALUES, PLAYER_COLOR_HEX } from './constants.js';

const state = {
  page: 'room-preview',
  roomId: 999,
  account: 'manager_alice',
};

const FIELD_ORDER = [0, 1, 5, 2, 4, 3];
const FIELD_NAMES = {
  "Hermit's Cabin": { zh: '隱士小屋', en: "Hermit's Cabin", jp: '隠者の庵' },
  Church: { zh: '教堂', en: 'Church', jp: '教会' },
  Cemetery: { zh: '墓園', en: 'Cemetery', jp: '墓地' },
  'Underworld Gate': { zh: '時空之門', en: 'Underworld Gate', jp: '冥界の門' },
  'Weird Woods': { zh: '希望與絕望的森林', en: 'Weird Woods', jp: '希望と絶望の森' },
  'Erstwhile Altar': { zh: '古代祭壇', en: 'Erstwhile Altar', jp: '古の祭壇' },
};

function getLocalizedAreaName(areaName) {
  const lang = getCurrentUiLang();
  const localized = FIELD_NAMES[String(areaName || '').trim()];
  return localized?.[lang] || localized?.zh || String(areaName || '').trim() || '-';
}

function createFakeRoomData() {
  return {
    room: {
      room_id: 999,
      room_name: '預覽展示',
      room_status: 2,
      player_count: 6,
      max_players: 8,
      room_comment: '這是獨立假資料頁，不會連動正式房間或真實 API。',
      replay_notice: 'UI Preview / Fake Data',
      require_trip: true,
      expansion_mode: 'all',
      enable_initial_green_card: true,
      turn_timeout_minutes: 3,
      is_chat_room: false,
    },
    turn: {
      current_account: 'manager_alice',
      current_trip_display: '◆ALICE',
      status: 3,
    },
    winners: [],
    action_order: ['manager_alice', 'hunter_gregor', 'shadow_vamp', 'neutral_allie', 'hunter_emi', 'shadow_wight'],
    dice: { D6: 5, D4: 2 },
    active_card_display: { name: 'Blessing', color: 'white' },
    card_piles: {
      White: { deck: 7, discard: 2 },
      Black: { deck: 9, discard: 3 },
      Green: { deck: 11, discard: 1 },
    },
    turn_timeout: {
      remaining_seconds: 41,
      current_name: 'Alice',
    },
    boomed_notice: {
      name: 'Bob',
    },
    fields: [
      {
        name: "Hermit's Cabin",
        display_name: getLocalizedAreaName("Hermit's Cabin"),
        numbers: [2, 3],
        description: '測試他人身份的綠卡來源。適合在前期交換情報。 ',
      },
      {
        name: 'Church',
        display_name: getLocalizedAreaName('Church'),
        numbers: [4, 5],
        description: '偏向支援與防禦的白卡來源。',
      },
      {
        name: 'Cemetery',
        display_name: getLocalizedAreaName('Cemetery'),
        numbers: [6, 7],
        description: '黑卡與高風險進攻節奏的代表場地。',
      },
      {
        name: 'Underworld Gate',
        display_name: getLocalizedAreaName('Underworld Gate'),
        numbers: [8, 9],
        description: '可觸發特殊移動與部分角色能力。',
      },
      {
        name: 'Weird Woods',
        display_name: getLocalizedAreaName('Weird Woods'),
        numbers: [10, 11],
        description: '可選擇傷害或治癒，常用於製造判讀。',
      },
      {
        name: 'Erstwhile Altar',
        display_name: getLocalizedAreaName('Erstwhile Altar'),
        numbers: [12, 13],
        description: '與裝備、奪取與節奏逆轉有關。',
      },
    ],
    players: {
      manager_alice: {
        name: 'Alice',
        trip_display: '◆ALICE',
        join_order: 1,
        avatar_no: 5,
        color: 'Red',
        is_ready: true,
        alive: true,
        status: 3,
        damage: 2,
        hp: 14,
        area: 'Church',
        character: 'Gregor',
        character_name: 'Gregor',
        character_camp: 'hunter',
        equipment: ['Holy Robe'],
        can_use_ability: true,
        ability_status: 'ready',
        is_invulnerable: true,
        invulnerability_source: 'Guardian Angel',
      },
      hunter_gregor: {
        name: 'Mika',
        trip_display: '◆MIKA',
        join_order: 2,
        avatar_no: 6,
        color: 'Blue',
        is_ready: true,
        alive: true,
        status: 4,
        damage: 5,
        hp: 13,
        area: "Hermit's Cabin",
        character: 'Emi',
        character_name: 'Emi',
        character_camp: 'hunter',
        equipment: ['Mystic Compass'],
        can_use_ability: false,
        ability_status: 'disabled',
      },
      shadow_vamp: {
        name: 'Rin',
        trip_display: '◆RIN',
        join_order: 3,
        avatar_no: 4,
        color: 'Orange',
        is_ready: true,
        alive: true,
        status: 2,
        damage: 3,
        hp: 14,
        area: 'Weird Woods',
        character: 'Vampire',
        character_name: 'Vampire',
        character_camp: 'shadow',
        equipment: ['Handgun'],
      },
      neutral_allie: {
        name: 'Yui',
        trip_display: '◆YUI',
        join_order: 4,
        avatar_no: 10,
        color: 'Pink',
        is_ready: true,
        alive: true,
        status: 6,
        damage: 1,
        hp: 10,
        area: 'Erstwhile Altar',
        character: 'Allie',
        character_name: 'Allie',
        character_camp: 'civilian',
        equipment: [],
      },
      hunter_emi: {
        name: 'Shin',
        trip_display: '◆SHIN',
        join_order: 5,
        avatar_no: 8,
        color: 'Green',
        is_ready: true,
        alive: true,
        status: 1,
        damage: 4,
        hp: 12,
        area: 'Church',
        character: 'Franklin',
        character_name: 'Franklin',
        character_camp: 'hunter',
        equipment: ['Silver Rosary'],
      },
      shadow_wight: {
        name: 'Kuro',
        trip_display: '◆KURO',
        join_order: 6,
        avatar_no: 2,
        color: 'Black',
        is_ready: true,
        alive: false,
        status: 0,
        damage: 14,
        hp: 14,
        area: 'Cemetery',
        character: 'Wight',
        character_name: 'Wight',
        character_camp: 'shadow',
        equipment: ['Chainsaw'],
      },
    },
    chat_messages: [
      { id: 1, type: 'system', timestamp: 1711795200, text: '遊戲開始，這裡是獨立預覽頁。' },
      { id: 2, type: 'system', timestamp: 1711795212, text: 'Alice 在教堂抽到白卡 Blessing。' },
      { id: 3, type: 'chat', account: 'manager_alice', name: 'Alice', timestamp: 1711795220, text: '我先補一下狀態，等等看誰像暗影。' },
      { id: 4, type: 'chat', account: 'shadow_vamp', name: 'Rin', timestamp: 1711795232, text: '別急著打我，我只是路過森林。' },
      { id: 5, type: 'system', timestamp: 1711795240, text: 'Mika 宣告攻擊 Rin，造成 3 點傷害。' },
      { id: 6, type: 'system', timestamp: 1711795250, text: 'Bob 超時未行動，已被判定暴斃。' },
      { id: 7, type: 'chat', account: 'neutral_allie', name: 'Yui', timestamp: 1711795260, text: '這些系統訊息目前都是假資料，只用來看版面。' },
    ],
  };
}

function getStatusTextMap() {
  return {
    0: t('status.0'),
    1: t('status.1'),
    2: t('status.2'),
    3: t('status.3'),
    4: t('status.4'),
    5: t('status.5'),
    6: t('status.6'),
  };
}

function renderVillageInfo(data) {
  const host = document.getElementById('villageInfoList');
  if (!host) return;
  const room = data.room;
  const roomSettings = [
    `TRIP:${room.require_trip ? 'On' : 'Off'}`,
    `Mode:${String(room.expansion_mode || 'all')}`,
    `初始綠卡:${room.enable_initial_green_card ? 'On' : 'Off'}`,
    `暴斃時間:${Number(room.turn_timeout_minutes || 3)}分`,
  ].join(' / ');
  host.innerHTML = `
    <li class="village-info-row village-info-row-primary">
      <span class="village-info-item"><strong>${esc(t('room.info.name'))}</strong><span class="village-info-value">${esc(withVillageSuffix(room.room_name || ''))}</span></span>
      <span class="village-info-item"><strong>${esc(t('room.info.desc'))}</strong><span class="village-info-value">${esc(room.room_comment || '-')}</span></span>
      <span class="village-info-item"><strong>${esc(t('room.info.replay_notice'))}</strong>${esc(room.replay_notice || '-')}</span>
    </li>
    <li class="village-info-row village-info-row-meta">
      <span class="village-info-item"><strong>${esc(t('room.info.room_id'))}</strong>${esc(room.room_id)}</span>
      <span class="village-info-item"><strong>${esc(t('room.info.status'))}</strong>${esc(t('room.info.status_playing'))}</span>
      <span class="village-info-item"><strong>${esc(t('room.info.count'))}</strong>${esc(room.player_count)}/${esc(room.max_players)}</span>
      <span class="village-info-settings-line">(${esc(roomSettings)})</span>
    </li>
    <li class="village-info-row village-info-row-actions">
      <span class="lighttxt">這是純前端預覽：資料、聊天室與系統訊息皆為假資料，不會寫入正式房間。</span>
    </li>
  `;
}

function renderStage(data) {
  const playerAreas = new Map();
  Object.entries(data.players || {}).forEach(([account, player]) => {
    const areaName = String(player?.area || '').trim();
    if (!player?.alive || !areaName) return;
    const existing = playerAreas.get(areaName) || [];
    existing.push({
      account,
      name: player.name || account,
      color: player.color || '',
    });
    playerAreas.set(areaName, existing);
  });

  document.querySelectorAll('.table-stage [data-field-slot]').forEach((cardEl) => {
    const slot = Number(cardEl.getAttribute('data-field-slot'));
    const field = data.fields?.[slot];
    const nameEl = cardEl.querySelector('.stage-field-name');
    const numberListEl = cardEl.querySelector('.stage-field-number-list');
    const occupantsEl = cardEl.querySelector('.stage-field-occupants');
    if (!field) return;

    if (nameEl) nameEl.textContent = field.display_name || field.name || '-';
    if (numberListEl) {
      numberListEl.innerHTML = (field.numbers || [])
        .map((number) => `<button class="stage-field-number" type="button" data-field-open="${slot}" data-field-number="${number}">${number}</button>`)
        .join('');
    }
    if (occupantsEl) {
      const occupants = playerAreas.get(field.name) || [];
      occupantsEl.innerHTML = Array.from({ length: 8 }, (_, index) => {
        const occupant = occupants[index];
        if (!occupant) return '<span class="stage-field-occupant is-empty" aria-hidden="true"></span>';
        return `<span class="stage-field-occupant" title="${esc(occupant.name)}"></span>`;
      }).join('');
    }
  });

  const d6El = document.getElementById('stageDiceD6');
  const d4El = document.getElementById('stageDiceD4');
  if (d6El) d6El.textContent = String(data.dice?.D6 || 1);
  if (d4El) d4El.textContent = String(data.dice?.D4 || 1);

  document.querySelectorAll('.table-stage [data-pile-type][data-card-color]').forEach((cardEl) => {
    const pileType = String(cardEl.getAttribute('data-pile-type') || '').toLowerCase();
    const colorKey = String(cardEl.getAttribute('data-card-color') || '').toLowerCase();
    const colorName = colorKey === 'white' ? 'White' : colorKey === 'black' ? 'Black' : 'Green';
    const pileInfo = data.card_piles?.[colorName] || {};
    const count = pileType === 'discard' ? pileInfo.discard : pileInfo.deck;
    const countEl = cardEl.querySelector('.stage-pile-count');
    if (countEl) countEl.textContent = String(Number(count || 0));
  });

  const activeCardDisplay = document.getElementById('activeCardDisplay');
  const activeCardName = document.getElementById('activeCardName');
  if (activeCardDisplay && activeCardName) {
    activeCardDisplay.hidden = false;
    activeCardDisplay.dataset.cardColor = String(data.active_card_display?.color || '').toLowerCase();
    const rawName = String(data.active_card_display?.name || '').trim();
    activeCardName.textContent = rawName ? t(`room.active_card.names.${rawName}`) : '';
  }
}

function bindFieldDetail(data) {
  const panel = document.getElementById('stageFieldDetail');
  const nameEl = document.getElementById('stageFieldDetailName');
  const numbersEl = document.getElementById('stageFieldDetailNumbers');
  const descEl = document.getElementById('stageFieldDetailDescription');
  const closeBtn = document.getElementById('stageFieldDetailClose');
  if (!panel || !nameEl || !numbersEl || !descEl) return;

  document.querySelectorAll('.stage-field-number[data-field-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const slot = Number(button.getAttribute('data-field-open'));
      const field = data.fields?.[slot];
      if (!field) return;
      nameEl.textContent = field.display_name || field.name || '-';
      numbersEl.innerHTML = (field.numbers || []).map((number) => `<span class="stage-field-detail-number">${esc(number)}</span>`).join('');
      descEl.textContent = field.description || '-';
      panel.hidden = false;
    });
  });

  closeBtn?.addEventListener('click', () => {
    panel.hidden = true;
  });
}

function renderChat(data) {
  const host = document.getElementById('chatMessages');
  const input = document.getElementById('chatInput');
  const sendButton = document.getElementById('chatSendButton');
  if (!host) return;
  const messages = (data.chat_messages || []).filter((message) => String(message.type || '').toLowerCase() !== 'system');
  host.innerHTML = messages.map((message) => {
    const date = new Date(Number(message.timestamp || 0) * 1000);
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':');
    const selfClass = message.account === state.account ? ' chat-line-self' : '';
    return `
      <div class="chat-line${selfClass}">
        <div class="chat-sender">${esc(message.name || message.account || '-')}<span class="chat-time">(${time})</span>:</div>
        <div class="chat-text">${esc(message.text || '')}</div>
      </div>
    `;
  }).join('');
  if (input) {
    input.disabled = true;
    input.value = '';
    input.placeholder = '預覽頁不送出訊息';
  }
  if (sendButton) sendButton.disabled = true;
}

function renderSystemMessages(data) {
  const host = document.getElementById('systemMessages');
  if (!host) return;
  const systemMessages = (data.chat_messages || []).filter((message) => String(message.type || '').toLowerCase() === 'system');
  const lines = systemMessages.map((message) => {
    const date = new Date(Number(message.timestamp || 0) * 1000);
    const time = [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, '0')).join(':');
    const extraClass = /暴斃|超時/.test(String(message.text || '')) ? ' system-boomed' : '';
    return `<div class="system-line${extraClass}">[${time}] ${esc(message.text || '')}</div>`;
  });
  if (data.turn_timeout?.remaining_seconds != null) {
    lines.push(`<div class="system-line system-timeout">${esc(t('room.info.turn_timeout_fmt', { who: data.turn_timeout.current_name || '-', n: data.turn_timeout.remaining_seconds }))}</div>`);
  }
  host.innerHTML = lines.join('');
}

function clampDamageValue(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 0;
  return Math.max(0, Math.min(14, Math.round(numericValue)));
}

function renderDamageMeter(data) {
  const host = document.getElementById('damageMeter');
  if (!host) return;

  const roleMarkersByDamage = new Map();
  DAMAGE_ROLE_MARKERS.forEach((marker) => {
    const damage = clampDamageValue(marker.hp);
    const existing = roleMarkersByDamage.get(damage) || [];
    existing.push(marker);
    roleMarkersByDamage.set(damage, existing);
  });

  const playerMarkersByDamage = new Map();
  Object.entries(data?.players || {}).forEach(([account, player]) => {
    if (!player?.alive) return;
    const damage = clampDamageValue(player?.damage);
    const existing = playerMarkersByDamage.get(damage) || [];
    existing.push({
      account,
      name: player?.name || account,
      color: player?.color || '',
      exactDamage: Number(player?.damage || 0),
    });
    playerMarkersByDamage.set(damage, existing);
  });

  const rows = [
    { label: t('room.damage_meter.damage'), type: 'scale' },
    { label: t('room.damage_meter.roles'), type: 'roles' },
    { label: t('room.damage_meter.players'), type: 'players' },
  ];

  host.innerHTML = `
    <div class="damage-meter-grid" role="table" aria-label="${esc(t('room.damage_meter.title'))}">
      ${rows.map((row) => `
        <div class="damage-meter-row-label" role="rowheader">${esc(row.label)}</div>
        ${DAMAGE_TRACK_VALUES.map((damage) => {
          if (row.type === 'scale') {
            return `<div class="damage-meter-cell damage-meter-scale-cell" role="cell">${damage}</div>`;
          }
          if (row.type === 'roles') {
            const markers = roleMarkersByDamage.get(damage) || [];
            return `
              <div class="damage-meter-cell" role="cell">
                ${markers.map((marker) => `<span class="damage-meter-badge ${marker.camp.toLowerCase()}" title="${esc(`${marker.camp} ${marker.initial} / HP ${marker.hp}`)}">${esc(String(marker.initial || '').trim().charAt(0).toUpperCase() || '?')}</span>`).join('')}
              </div>
            `;
          }
          const players = playerMarkersByDamage.get(damage) || [];
          return `
            <div class="damage-meter-cell" role="cell">
              ${players.map((player) => {
                const fill = PLAYER_COLOR_HEX[player.color] || '#cccccc';
                const outline = player.color === 'White' ? '#9aa7b2' : 'rgba(0,0,0,0.25)';
                return `<button class="damage-meter-player-chip" type="button" data-player-account="${esc(player.account)}" title="${esc(`${player.name} / ${player.color || '-'} / ${player.exactDamage}`)}" aria-label="${esc(t('ui.player_label', { name: player.name || player.account }))}" style="background:${fill}; border-color:${outline};"></button>`;
              }).join('')}
            </div>
          `;
        }).join('')}
      `).join('')}
    </div>
  `;
}

function setPageTitle() {
  document.title = `${t('common.brand')}｜房間預覽`;
  const headerBrand = document.querySelector('#header h2');
  if (headerBrand) headerBrand.textContent = t('common.brand');
}

/**
 * Preview-only DOM patch – compact card layout:
 *  1. Colour swatch → before nickname in the hp row
 *  2. Area row + character row → appended into id-block (below HP, in header right col)
 *  3. Coloured ◆ diamond → moved from nickname row to trip row
 *     (fixed-colour ◆ is hidden via CSS)
 * Only runs on data-page="room-preview" – never called in the real room.
 */
function patchPreviewCards() {
  const cards = document.querySelectorAll('[data-page="room-preview"] .player-card');
  cards.forEach((card) => {
    const hpRow = card.querySelector('.player-card-hp');
    const idBlock = card.querySelector('.player-id-block');

    // 1. Move colour cell into hp row, before nickname
    const colorCell = card.querySelector('.player-card-head .player-color-cell');
    const nickname = hpRow?.querySelector('.player-card-nickname');
    if (colorCell && hpRow && nickname) {
      hpRow.insertBefore(colorCell, nickname);
    }

    // 2. Move area row and character row into id-block (right column of header)
    const metaArea = card.querySelector('.player-card-meta');
    const metaRole = card.querySelector('.player-card-meta-role');
    if (idBlock && metaArea) idBlock.appendChild(metaArea);
    if (idBlock && metaRole) idBlock.appendChild(metaRole);

    // 3. Move coloured ◆ from nickname row to trip row (prepend before trip content)
    const coloredDiamond = hpRow?.querySelector('.trip-prefix-diamond:not(.trip-prefix-diamond-fixed)');
    const tripRow = card.querySelector('.player-card-role');
    if (coloredDiamond && tripRow) {
      tripRow.insertBefore(coloredDiamond, tripRow.firstChild);
    }

    // 4. Remove fixed-colour ◆ and dedupe any extra diamonds in trip row
    card.querySelectorAll('.trip-prefix-diamond-fixed').forEach((el) => el.remove());
    if (tripRow) {
      const allTripDiamonds = Array.from(tripRow.querySelectorAll('.trip-prefix-diamond'));
      allTripDiamonds.slice(1).forEach((el) => el.remove());
    }
  });
}

function renderPreview() {
  const data = createFakeRoomData();
  renderVillageInfo(data);
  renderStage(data);
  bindFieldDetail(data);
  renderSystemMessages(data);
  renderChat(data);
  renderDamageMeter(data);
  renderPlayerCards(document.getElementById('roomCards'), data, {
    esc,
    getInitial,
    statusText: getStatusTextMap(),
    state,
    view: 'room',
  });
  patchPreviewCards();

  const nextStepButton = document.getElementById('stageNextStepButton');
  if (nextStepButton) {
    nextStepButton.disabled = true;
    nextStepButton.textContent = '預覽模式';
  }

  const backButton = document.getElementById('btnRoomBackLobby');
  backButton?.addEventListener('click', () => {
    window.location.href = './lobby.html';
  });
}

async function boot() {
  const currentLang = initI18n();
  await loadAvatarCatalog();
  applyI18n();
  bindLangSwitcher(currentLang);
  setPageTitle();
  renderPreview();
}

boot();