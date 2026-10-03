import { t } from './i18n.js';

const SOUND_STORE_KEY = 'sh.sound.enabled';
const GAME_START_SRC = './assets/sounds/game_start.wav';
const YOUR_TURN_SRC = './assets/sounds/your_turn.wav';
const ROLL_CALL_SRC = './assets/sounds/roll_call.wav';

function readStoredEnabled() {
  try {
    const stored = localStorage.getItem(SOUND_STORE_KEY);
    if (stored === null) return true; // 預設開啟
    return stored !== 'false';
  } catch (error) {
    return true;
  }
}

let soundEnabled = readStoredEnabled();
const audioCache = new Map();

function getAudio(src) {
  if (!audioCache.has(src)) {
    const audio = new Audio(src);
    audio.preload = 'auto';
    audioCache.set(src, audio);
  }
  return audioCache.get(src);
}

function playFile(src) {
  if (!soundEnabled) return;
  try {
    // 用 cloneNode 讓同一個音效可以在短時間內重疊播放（例如連續輪到自己），
    // 不用等前一次播放完畢。
    const audio = getAudio(src).cloneNode();
    audio.volume = 0.6;
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {
        // 瀏覽器可能因為尚未有使用者互動而擋下自動播放，忽略即可，
        // 不應該影響遊戲流程或跳出任何錯誤訊息。
      });
    }
  } catch (error) {
    // ignore: 播放失敗不應該影響遊戲流程
  }
}

/**
 * 目前音效設定是否開啟。
 * @returns {boolean}
 */
export function isSoundEnabled() {
  return soundEnabled;
}

/**
 * 切換音效開關並持久化到 localStorage（跨頁面、跨 session 保留設定）。
 * @param {boolean} enabled
 */
export function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
  try {
    localStorage.setItem(SOUND_STORE_KEY, String(soundEnabled));
  } catch (error) {
    // ignore: 無法寫入 localStorage 時，這次切換仍在記憶體中生效
  }
}

/** 開場音效：遊戲剛開始（room_status 變成 2）時播放。 */
export function playGameStartSound() {
  playFile(GAME_START_SRC);
}

/** 輪到自己音效：目前輪到的玩家變成自己時播放。 */
export function playYourTurnSound() {
  playFile(YOUR_TURN_SRC);
}

/** 重新點名音效：村長（或之後的 GM）發起重新點名時，所有人都會播放。 */
export function playRollCallSound() {
  playFile(ROLL_CALL_SRC);
}

function updateToggleButtonUi(button) {
  if (!(button instanceof HTMLElement)) return;
  const enabled = isSoundEnabled();
  button.textContent = enabled ? '\uD83D\uDD0A' : '\uD83D\uDD07';
  button.setAttribute('aria-pressed', String(enabled));
  const title = enabled ? t('common.sound.on_title') : t('common.sound.off_title');
  button.title = title;
  button.setAttribute('aria-label', title);
}

/**
 * 綁定音效開關按鈕（[data-sound-toggle]）。跟 bindLangSwitcher 一樣，
 * 用 querySelectorAll 處理，沒有這個按鈕的頁面就什麼都不做。
 * @param {Document|Element} [root=document]
 */
export function bindSoundToggle(root = document) {
  root.querySelectorAll('[data-sound-toggle]').forEach((button) => {
    updateToggleButtonUi(button);
    button.addEventListener('click', () => {
      setSoundEnabled(!isSoundEnabled());
      updateToggleButtonUi(button);
    });
  });
}
