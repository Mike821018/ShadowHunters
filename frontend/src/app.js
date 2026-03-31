import { bindTransportModeEvents } from './bootstrap.js';
import { loadAvatarCatalog } from './avatarConfig.js';
import { getAllCharacterInfos, getCurrentUiLang, getCharacterLocalizedName } from './characterInfo.js';
import { AREA_NAMES } from './constants.js';
import { initAvatarGalleryPage } from './pages/avatarGallery.js';
import { initRegisterPage } from './pages/register.js';
import { initRecordsPage } from './pages/records.js';
import { initRecordViewPage } from './pages/recordView.js';
import { initVersionPage } from './pages/version.js';
import { goToLobbyPage as navigateToLobbyPage, goToRegisterPage as navigateToRegisterPage, goToRoomPage as navigateToRoomPage } from './navigation.js';
import { bindLobbyEvents, initLobbyPage, refreshRooms as refreshLobbyRooms, renderRooms as renderLobbyRooms } from './pages/lobby.js';
import { bindRoomEvents, initRoomPage, renderState as renderRoomState, renderVillageInfo as renderRoomVillageInfo, setVillageInfoMessage as setRoomVillageInfoMessage } from './pages/room.js';
import { applyI18n, bindLangSwitcher, initI18n, t } from './i18n.js';
import { persistSession, restoreSession } from './session.js';
import { createAppState } from './state.js';
import { createDispatch } from './transport.js';
import { createStatusHelpers, createToast, loadAnnouncement, renderPlayerCards } from './ui.js';
import { getDomElements } from './dom.js';
import { countChars, esc, getInitial, isValidAsciiCredential, normalizeVillageName, withVillageSuffix } from './utils.js';
const state = createAppState();

const el = getDomElements();


const toast = createToast(el);
const { setStatus, setTransportMode, pushLog } = createStatusHelpers({ state, el });
const dispatch = createDispatch({ state, setStatus, pushLog, toast, withVillageSuffix, areaNames: AREA_NAMES });

const persistCurrentSession = () => persistSession(state);
const goToRoomPage = (roomId = state.roomId) => navigateToRoomPage({ state, persistSession }, roomId);
const goToRegisterPage = (roomId = state.roomId) => navigateToRegisterPage({ state, persistSession }, roomId);
const goToLobbyPage = () => navigateToLobbyPage({ state, persistSession });

const getStatusTextMap = () => ({
  0: t('status.0'),
  1: t('status.1'),
  2: t('status.2'),
  3: t('status.3'),
  4: t('status.4'),
  5: t('status.5'),
  6: t('status.6'),
});

const renderRooms = (rooms) => renderLobbyRooms({ el, esc, withVillageSuffix, goToRoomPage }, rooms);
const refreshRooms = () => refreshLobbyRooms({ dispatch, renderRooms });
const renderVillageInfo = (data) => renderRoomVillageInfo({ el, esc, withVillageSuffix, goToRegisterPage, state }, data);
const setVillageInfoMessage = (message) => setRoomVillageInfoMessage({ el, esc }, message);
const renderState = (data) => renderRoomState({
  state,
  el,
  esc,
  persistSession,
  renderVillageInfo,
  renderPlayerCards: (container, roomData, options = {}) => renderPlayerCards(container, roomData, {
    esc,
    getInitial,
    statusText: getStatusTextMap(),
    state,
    onColorChange: async (color) => {
      try {
        const newData = await dispatch('change_color', { room_id: state.roomId, account: state.account, color });
        renderState(newData);
        toast(t('toast.color_changed'));
      } catch {
      }
    },
    onPlayerCardClick: async (targetAccount) => {
      if (!options.enableVoteKick) return;
      const roomStatus = Number(roomData?.room?.room_status || 0);
      if (roomStatus !== 1) return;
      if (!state.roomId || !state.account) return;
      if (!targetAccount || targetAccount === state.account) return;

      const targetName = roomData?.players?.[targetAccount]?.name || targetAccount;
      const ok = window.confirm(t('toast.vote_kick_confirm', { name: targetName }));
      if (!ok) return;

      try {
        const newData = await dispatch('vote_kick', {
          room_id: state.roomId,
          voter_account: state.account,
          target_account: targetAccount,
        });
        const kicked = !newData?.players?.[targetAccount];
        renderState(newData);
        toast(kicked ? t('toast.vote_kick_done', { name: targetName }) : t('toast.vote_kick_cast', { name: targetName }));
      } catch {
      }
    },
    ...options,
  }),
  statusText: getStatusTextMap(),
  areaNames: AREA_NAMES,
}, data);

const GUIDE_GREEN_CARDS = ['Aid', 'Anger', 'Blackmail', 'Bully', 'Exorcism', 'Greed', 'Huddle', 'Nurturance', 'Prediction', 'Slap', 'Spell', 'Tough Lesson'];
const GUIDE_WHITE_CARDS = ['Talisman', 'Fortune Brooch', 'Mystic Compass', 'Holy Robe', 'Silver Rosary', 'Spear of Longinus', 'Holy Water of Healing', 'Advent', 'Chocolate', 'Blessing', 'Concealed Knowledge', 'Guardian Angel', 'Flare of Judgement', 'Disenchant Mirror', 'First Aid'];
const GUIDE_BLACK_CARDS = ['Chainsaw', 'Butcher Knife', 'Rusted Broad Axe', 'Masamune', 'Machine Gun', 'Handgun', 'Vampire Bat', 'Bloodthirsty Spider', 'Moody Goblin', 'Spiritual Doll', 'Dynamite', 'Diabolic Ritual', 'Banana Peel'];
const GUIDE_EQUIPMENT_ICONS = {
  'Talisman': '🔮',
  'Fortune Brooch': '💠',
  'Mystic Compass': '🧭',
  'Holy Robe': '🧥',
  'Silver Rosary': '📿',
  'Spear of Longinus': '🗡️',
  'Chainsaw': '⚙️',
  'Butcher Knife': '🔪',
  'Rusted Broad Axe': '🪓',
  'Masamune': '⚔️',
  'Machine Gun': '🔫',
  'Handgun': '🎯',
};

function setLocalizedPageTitle() {
  const brand = t('common.brand');
  const titleMap = {
    lobby: t('common.nav.lobby'),
    room: t('room.info.title'),
    'replay-room': t('room.info.title'),
    guide: t('common.nav.rules'),
    operation: t('common.nav.operation'),
    records: t('common.nav.records'),
    'avatar-gallery': t('common.nav.avatars'),
    register: t('common.nav.identity'),
    'version-notes': t('common.nav.versions'),
  };
  const pageTitle = titleMap[state.page] || '';
  document.title = pageTitle ? `${brand}｜${pageTitle}` : brand;
  const headerBrand = document.querySelector('#header h2');
  if (headerBrand) headerBrand.textContent = brand;
}

function initGuideSectionCollapse() {
  if (state.page !== 'guide' && state.page !== 'operation') return;
  document.querySelectorAll('.guide-section').forEach(section => {
    const h2 = section.querySelector(':scope > h2');
    const body = section.querySelector(':scope > .card-body');
    if (!h2 || !body) return;
    h2.classList.add('guide-collapsible');
    h2.setAttribute('tabindex', '0');
    h2.setAttribute('role', 'button');
    h2.setAttribute('aria-expanded', 'true');
    const onToggle = () => {
      const collapsed = body.classList.toggle('guide-section-collapsed');
      h2.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };
    h2.addEventListener('click', onToggle);
    h2.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    });
  });
}

function initGuideSubsectionCollapse() {
  if (state.page !== 'guide' && state.page !== 'operation') return;

  document.querySelectorAll('.guide-subsection').forEach(subsection => {
    if (subsection.classList.contains('no-subsection-collapse-item')) return;
    if (subsection.closest('.guide-section.no-subsection-collapse') && !subsection.classList.contains('allow-subsection-collapse')) return;
    const title = subsection.querySelector(':scope > h4');
    if (!title) return;
    const bodyNodes = Array.from(subsection.children).filter(node => node !== title);
    if (!bodyNodes.length) return;

    title.classList.add('guide-subsection-collapsible');
    title.setAttribute('tabindex', '0');
    title.setAttribute('role', 'button');
    title.setAttribute('aria-expanded', 'false');
    bodyNodes.forEach(node => node.classList.add('guide-subsection-collapsed'));

    const onToggle = () => {
      const collapsed = bodyNodes[0].classList.toggle('guide-subsection-collapsed');
      bodyNodes.slice(1).forEach(node => node.classList.toggle('guide-subsection-collapsed', collapsed));
      title.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    };
    title.addEventListener('click', onToggle);
    title.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onToggle();
      }
    });
  });

}

function renderGuideCardCatalogs() {
  if (state.page !== 'guide') return;

  const characterHost = document.getElementById('guideCharacterCatalog');
  const greenHost = document.getElementById('guideGreenCardCatalog');
  const whiteHost = document.getElementById('guideWhiteCardCatalog');
  const blackHost = document.getElementById('guideBlackCardCatalog');
  if (!characterHost || !greenHost || !whiteHost || !blackHost) return;

  const lang = getCurrentUiLang();
  const cardName = (card) => {
    const key = `room.active_card.names.${card}`;
    const localized = t(key);
    const baseName = localized === key ? card : localized;
    const icon = GUIDE_EQUIPMENT_ICONS[card] || '';
    return icon ? `${icon} ${baseName}` : baseName;
  };
  const cardDesc = (card) => {
    const key = `room.active_card.desc.${card}`;
    const localized = t(key);
    return localized === key ? '-' : localized;
  };

  const parseCharacterMeta = (characterKey) => {
    const desc = cardDesc(characterKey);
    const hpMatch = String(desc).match(/HP\s*(\d+)\s*(\*)?/i);
    return {
      hp: hpMatch ? hpMatch[1] : '-',
      isExpansion: Boolean(hpMatch && hpMatch[2] === '*'),
    };
  };

  const renderCharacterTable = () => {
    const characterRows = getAllCharacterInfos()
      .map(({ key, info }) => {
        const englishName = String(info?.names?.en || key || '').trim() || String(key || '').trim() || '-';
        const initial = englishName.charAt(0).toUpperCase() || '?';
        const { hp, isExpansion } = parseCharacterMeta(key);
        return {
          key,
          info,
          englishName,
          initial,
          hp,
          isExpansion,
        };
      })
      .sort((a, b) => {
        const initialCompare = a.initial.localeCompare(b.initial, 'en', { sensitivity: 'base' });
        if (initialCompare !== 0) return initialCompare;
        if (a.isExpansion !== b.isExpansion) return a.isExpansion ? 1 : -1;
        return a.englishName.localeCompare(b.englishName, 'en', { sensitivity: 'base' });
      });

    const rows = characterRows
      .map(({ key, info, hp, isExpansion }) => {
        const camp = info?.camp?.[lang] || info?.camp?.en || '-';
        const campClass = String(info?.camp?.en || '').trim().toLowerCase() || 'civilian';
        const badge = String(key || '?').trim().charAt(0).toUpperCase() || '?';
        const win = info?.win?.[lang] || info?.win?.en || '-';
        const ability = info?.ability?.[lang] || info?.ability?.en || '-';
        const localizedName = getCharacterLocalizedName(key, lang);
        return `
          <tr>
            <td><span class="damage-meter-badge ${esc(campClass)}">${esc(badge)}</span> ${esc(localizedName)}${isExpansion ? '*' : ''}</td>
            <td>${esc(hp)}</td>
            <td>${esc(camp)}</td>
            <td>${esc(win)}</td>
            <td>${esc(ability)}</td>
          </tr>
        `;
      })
      .join('');
    return `
      <table class="data-table" aria-label="${esc(t('guide.catalog.characters'))}">
        <thead>
          <tr>
            <th>${esc(t('guide.catalog.character_name'))}</th>
            <th>${esc(t('guide.catalog.character_hp'))}</th>
            <th>${esc(t('guide.catalog.camp'))}</th>
            <th>${esc(t('guide.catalog.win'))}</th>
            <th>${esc(t('guide.catalog.ability'))}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="lighttxt">${esc(t('guide.catalog.expansion_note'))}</p>
    `;
  };

  const renderCardTable = (cards, ariaLabel) => {
    const rows = cards
      .map((card) => `
        <tr>
          <td>${esc(cardName(card))}</td>
          <td>${esc(cardDesc(card))}</td>
        </tr>
      `)
      .join('');
    return `
      <table class="data-table" aria-label="${esc(ariaLabel)}">
        <thead>
          <tr>
            <th>${esc(t('guide.catalog.card_name'))}</th>
            <th>${esc(t('guide.catalog.effect'))}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  };

  characterHost.innerHTML = renderCharacterTable();
  greenHost.innerHTML = renderCardTable(GUIDE_GREEN_CARDS, t('guide.catalog.green'));
  whiteHost.innerHTML = renderCardTable(GUIDE_WHITE_CARDS, t('guide.catalog.white'));
  blackHost.innerHTML = renderCardTable(GUIDE_BLACK_CARDS, t('guide.catalog.black'));
}

async function boot() {
  const currentLang = initI18n();
  await loadAvatarCatalog();
  applyI18n();
  setLocalizedPageTitle();
  renderGuideCardCatalogs();
  initGuideSectionCollapse();
  initGuideSubsectionCollapse();
  bindLangSwitcher(currentLang);

  restoreSession(state);
  bindTransportModeEvents({ el, setTransportMode, persistCurrentSession });
  setTransportMode('http');

  bindLobbyEvents({
    el,
    dispatch,
    state,
    persistSession,
    toast,
    normalizeVillageName,
    countChars,
    withVillageSuffix,
    refreshRooms,
    goToRoomPage,
  });

  bindRoomEvents({
    el,
    state,
    dispatch,
    persistSession,
    refreshRooms,
    toast,
    renderState,
    setVillageInfoMessage,
    goToLobbyPage,
  });

  if (state.page === 'lobby') {
    await initLobbyPage({ loadAnnouncement: () => loadAnnouncement(el), refreshRooms });
  }

  if (state.page === 'room' || state.page === 'replay-room') {
    await initRoomPage({ state, dispatch, renderState, setVillageInfoMessage, goToLobbyPage });
  }

  if (state.page === 'register') {
    await initRegisterPage({
      state,
      el,
      dispatch,
      esc,
      withVillageSuffix,
      persistSession: persistCurrentSession,
      renderState,
      goToRoomPage,
      goToLobbyPage,
      isValidAsciiCredential,
      countChars,
      toast,
    });
  }

  if (state.page === 'records') {
    await initRecordsPage({ state, toast });
  }

  if (state.page === 'record-view') {
    await initRecordViewPage({ state, toast });
  }

  if (state.page === 'avatar-gallery') {
    await initAvatarGalleryPage({ state, toast, dispatch });
  }

  if (state.page === 'version-notes') {
    await initVersionPage({ state, toast });
  }
}

boot().catch((err) => {
  console.error(err);
  toast(t('toast.init_error'), 'error');
});
