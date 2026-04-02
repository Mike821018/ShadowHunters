import { bindTransportModeEvents } from './bootstrap.js';
import { loadAvatarCatalog } from './avatarConfig.js';
import { getAllCharacterInfos, getCurrentUiLang, getCharacterLocalizedName } from './characterInfo.js';
import { AREA_NAMES } from './constants.js';
import { initAvatarGalleryPage } from './pages/avatarGallery.js';
import { initGuideAndOperationPages } from './pages/guidePage.js';
import { initRegisterPage } from './pages/register.js';
import { initRecordsPage } from './pages/records.js';
import { initRecordViewPage } from './pages/recordView.js';
import { initVersionPage } from './pages/version.js';
import { goToLobbyPage as navigateToLobbyPage, goToRegisterPage as navigateToRegisterPage, goToRoomPage as navigateToRoomPage } from './navigation.js';
import { bindLobbyEvents, initLobbyPage, refreshRooms as refreshLobbyRooms, renderRooms as renderLobbyRooms } from './pages/lobby.js';
import { bindRoomEvents, initRoomPage, renderState as renderRoomState, renderVillageInfo as renderRoomVillageInfo, setVillageInfoMessage as setRoomVillageInfoMessage } from './pages/room.js';
import { showConfirmDialog } from './pages/room/choiceDialogs.js';
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
const openConfirmDialog = ({ title, message, confirmLabel, cancelLabel }) => showConfirmDialog({
  el,
  title: title || t('room.confirm.title'),
  message,
  confirmLabel: confirmLabel || t('room.confirm.confirm'),
  cancelLabel: cancelLabel || t('room.confirm.cancel'),
});
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
      const ok = await openConfirmDialog({
        title: t('room.confirm.title'),
        message: t('toast.vote_kick_confirm', { name: targetName }),
        confirmLabel: t('room.confirm.confirm'),
        cancelLabel: t('room.confirm.cancel'),
      });
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

async function boot() {
  const currentLang = initI18n();
  await loadAvatarCatalog();
  applyI18n();
  setLocalizedPageTitle();
  initGuideAndOperationPages({
    page: state.page,
    esc,
    t,
    getCurrentUiLang,
    getCharacterLocalizedName,
    getAllCharacterInfos,
  });
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
