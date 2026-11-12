import { bindTransportModeEvents } from './bootstrap.js';
import { loadAvatarCatalog } from './avatarConfig.js';
import { getAllCharacterInfos, getCurrentUiLang, getCharacterLocalizedName } from './characterInfo.js';
import { AREA_NAMES } from './constants.js';
import { initAvatarGalleryPage } from './pages/avatarGallery.js';
import { initGuideAndOperationPages } from './pages/guidePage.js';
import { initRegisterPage } from './pages/register.js';
import { initRecordsPage } from './pages/records.js';
import { initRecordViewPage } from './pages/recordView.js';
import { initReportPage } from './pages/report.js';
import { initVersionPage } from './pages/version.js';
import { goToLobbyPage as navigateToLobbyPage, goToRegisterPage as navigateToRegisterPage, goToRoomPage as navigateToRoomPage } from './navigation.js';
import { bindLobbyEvents, initLobbyPage, refreshRooms as refreshLobbyRooms, renderRooms as renderLobbyRooms } from './pages/lobby.js';
import { bindRoomEvents, initRoomPage, renderState as renderRoomState, renderVillageInfo as renderRoomVillageInfo, setVillageInfoMessage as setRoomVillageInfoMessage } from './pages/room.js';
import { showConfirmDialog } from './pages/room/choiceDialogs.js';
import { applyI18n, bindLangSwitcher, initI18n, t } from './i18n.js';
import { bindSoundToggle } from './soundEffects.js';
import { persistSession, restoreSession } from './session.js';
import { createAppState } from './state.js';
import { createDispatch } from './transport.js';
import { createStatusHelpers, createToast, loadAnnouncement, renderPlayerCards, renderMobilePlayerQuickBar } from './ui.js';
import { getDomElements } from './dom.js';
import { countChars, countDisplayWidth, esc, getInitial, isValidAsciiCredential, normalizeVillageName, withVillageSuffix } from './utils.js';
import { initFloatingChat } from './components/floatingChat.js';
import { initFloatingSysInfo } from './components/floatingSysInfo.js';
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

// 2026-11-11 新增（Mike 回報開局前點快速頭像沒反應）：原本「開局前投票踢出」
// 只接在 renderPlayerCards 的 onPlayerCardClick 裡，快速頭像（renderMobilePlayerQuickBar）
// 完全沒有同樣的管道。搬到專用函式來共用，兩邊都用同一套邏輯
// 判斷（options.enableVoteKick + room_status===1 才會動作）。
async function handleVoteKickClick(targetAccount, { roomData, enableVoteKick }) {
  if (!enableVoteKick) return;
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
}
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
    onPlayerCardClick: (targetAccount) => handleVoteKickClick(targetAccount, { roomData, enableVoteKick: options.enableVoteKick }),
    // 2026-11-11 新增：陣營猜測徽章改成不整個房間重繪，但聊天室「(???)」要跟
    // 猜測連動，所以猜測變更時要主動重新渲染一次聊天室，才不會卡在舊的顯示。
    // 沿用剛剛那次 renderPlayerCards() 收到的 roomData，不用再打一次 API。
    onCampGuessChange: () => renderState(roomData),
    ...options,
  }),
  // 2026-11-11 新增：手機板遊戲桌面上方的簡化玩家 icon 排，只需要跟
  // renderPlayerCards 一樣帶入 esc/getInitial/state 這些預設值；targetAccounts／
  // targetPromptClass 由 room.js 呼叫時用 ...options 帶進來；攻擊/能力等「遊戲中」
  // 操作仍然交給 playerCardBindings.js 的既有委派監聽處理。另外補上
  // onPlayerCardClick 接共用的 handleVoteKickClick，讓開局前（room_status===1）點快速
  // 頭像也能投票踢出，跟完整玩家卡片（el.roomCards）一致（需要 room.js 調用
  // 時傳 enableVoteKick: true 才會真正啟用）。
  renderMobilePlayerQuickBar: (container, roomData, options = {}) => renderMobilePlayerQuickBar(container, roomData, {
    esc,
    getInitial,
    state,
    onPlayerCardClick: (targetAccount) => handleVoteKickClick(targetAccount, { roomData, enableVoteKick: options.enableVoteKick }),
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
    'bug-report': t('common.nav.report'),
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
  bindSoundToggle();

  restoreSession(state);

  // 2026-10-13：房間頁右上角的「問題回報」快速連結，帶上目前房號方便回報時自動附上房間快照。
  if (el.bugReportQuickLink && state.roomId) {
    el.bugReportQuickLink.href = `./report.html?roomId=${state.roomId}`;
  }

  bindTransportModeEvents({ el, setTransportMode, persistCurrentSession });
  setTransportMode('auto');

  bindLobbyEvents({
    el,
    dispatch,
    state,
    persistSession,
    toast,
    normalizeVillageName,
    countChars,
    countDisplayWidth,
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
      countDisplayWidth,
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

  if (state.page === 'bug-report') {
    await initReportPage({ el, state, dispatch, esc, toast });
  }

  // Non-blocking: initialise floating chat overlay on pages without a chat room
  initFloatingChat({ state }).catch(() => {});

  // Non-blocking: on mobile, move the HP meter / player list into floating panels
  try {
    initFloatingSysInfo({ state });
  } catch {
    // ignore — leave the page in its normal inline layout on failure
  }
}

boot().catch((err) => {
  console.error(err);
  toast(t('toast.init_error'), 'error');
});
