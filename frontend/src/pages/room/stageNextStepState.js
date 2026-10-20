// 2026-10-19 新增：Mike 回報骰子（六面骰有橘色光暈、四面骰卻完全看不到）跟牌庫／
// 按鈕的閃爍節奏兜不起來，懷疑是用了不同的「時鐘」。這些 0.65s 的閃爍動畫（骰子、
// 中央下一步按鈕、牌庫抽牌提示）各自是在遊戲狀態變化時才由 JS 加上 class／屬性，
// 瀏覽器的 CSS animation 是從「加上去的那一刻」開始算相位，不同元素第一次被點亮的
// 時間點本來就不會剛好對齊，之後就會一直維持那個隨機的相位差，看起來像是各自閃各的。
// 這裡統一在每次把閃爍 class／屬性「打開」的當下，額外算一個負的 animation-delay，
// 用目前的實際時間（Date.now()）對週期取餘數反過來當起始相位，讓所有共用同一個週期
// 的閃爍動畫都對齊到同一個虛擬時鐘上，不管各自實際是哪一刻開始播放，看起來都會同步。
//
// 2026-10-19 修正：Mike 回報上線後效果反而變差，偶爾會卡一下、突然高頻閃爍一陣子
// 才恢復正常節奏。原因是 updateStageNextStepButtonState／updateStagePilePromptState
// 每次房間狀態有更新（例如輪詢到新的 snapshot）都會整個重跑一次，只要某個元素
// 當下「還在」閃爍狀態，就會每次都呼叫 syncPulseAnimationDelay 重新算一次
// Date.now() 對週期取餘數——但這個元素的動畫其實早就在播放中，持續被塞進一個
// 新的 animation-delay，等於每次房間更新都強迫瀏覽器把動畫畫面硬拉去一個新的
// 相位點，才會看起來像卡頓後突然快轉。原本牌庫一次骰到多種可抽顏色（例如骰到
// 時空之門，三個牌庫同時符合條件）不需要這個機制也能自然同步，就是因為它們是在
// 同一次 forEach、同一個當下一起被加上 is-draw-prompt，動畫天生就同時開始播放，
// 完全沒有「中途被重新設定 delay」這個問題。改成讓 syncPulseAnimationDelay 本身
// 具備「只在真正第一次打開的那一刻設定、已經設定過就不再覆蓋」的保護，這樣不管
// 房間狀態更新幾次，同一段連續的閃爍只會對齊一次虛擬時鐘，播放中途不會再被打斷
// 重新定位，從同一個 class／屬性關閉後再重新打開（clearPulseAnimationDelay 會
// 清空），才會重新對齊一次新的起始相位。
const PULSE_SYNC_PERIOD_MS = 650; // 必須跟 theme.css 裡這些動畫共用的 0.65s 週期一致

function syncPulseAnimationDelay(el) {
  if (!el || typeof el.style === 'undefined') return;
  if (el.style.animationDelay) return; // 已經對齊過、動畫正在播放中，不要再重新設定
  const offsetMs = Date.now() % PULSE_SYNC_PERIOD_MS;
  el.style.animationDelay = `-${offsetMs}ms`;
}

function clearPulseAnimationDelay(el) {
  if (!el || typeof el.style === 'undefined') return;
  el.style.animationDelay = '';
}

export function createStageNextStepStateHandlers({
  t,
  getLatestRoomSnapshot,
  getDrawablePileColors,
  getPendingStealState,
  getPendingKillLootState,
  getEquipmentConfirmPromptState,
  getGreenConfirmPromptState,
  getCardPromptState,
  getAttackPromptState,
  getCounterAttackPromptState,
  getMoveAreaPromptState,
  getPendingDiceAction,
  getDiceRollBusy,
  getDiceRollAnimating,
  getStageNextStepBusy,
  getPendingAbilityActivation,
  getTableDiceElements,
  getStageNextStepButton,
}) {
  function updateStagePilePromptState(state = null, dataSnapshot = null) {
    const snapshot = dataSnapshot || getLatestRoomSnapshot?.() || null;
    const root = document;
    // 2026-10-19 修正：Mike 回報骰完場地、停在可抽牌的區域格之後，連非行動玩家
    // （不是輪到自己的其他玩家）也會看到牌庫在閃爍。getDrawablePileColors() 本身
    // 是純粹依照「目前回合玩家現在站在哪個區域」判斷能不能抽牌，完全沒有檢查
    // 「這跟自己有沒有關係」——這個函式同時也被 drawCardFromPile() 拿去做「這個
    // 顏色真的能點嗎」的驗證，不能直接改掉它的邏輯（那樣會連真正該亮的那位玩家
    // 自己都抽不了牌），所以改成只在真的輪到「自己」的時候才去計算、套用閃爍
    // 提示，其他人一律當作沒有可抽的牌庫，不會跟著閃。
    const selfAccount = String(state?.account || '').trim();
    const currentAccount = String(snapshot?.turn?.current_account || '').trim();
    const isSelfTurn = Boolean(selfAccount && selfAccount === currentAccount);
    const drawableColors = isSelfTurn
      ? new Set(getDrawablePileColors(snapshot, null).map((value) => String(value || '').toLowerCase()))
      : new Set();
    root.querySelectorAll('.table-stage [data-pile-type][data-card-color]').forEach((cardEl) => {
      const pileType = String(cardEl.getAttribute('data-pile-type') || '').toLowerCase();
      const colorKey = String(cardEl.getAttribute('data-card-color') || '').toLowerCase();
      const isPrompt = pileType === 'deck' && drawableColors.has(colorKey);
      cardEl.classList.toggle('is-draw-prompt', isPrompt);
      if (isPrompt) {
        syncPulseAnimationDelay(cardEl);
        cardEl.setAttribute('role', 'button');
        cardEl.setAttribute('tabindex', '0');
        cardEl.setAttribute('aria-label', `抽取${colorKey}牌庫`);
      } else {
        clearPulseAnimationDelay(cardEl);
        cardEl.removeAttribute('role');
        cardEl.removeAttribute('tabindex');
        cardEl.removeAttribute('aria-label');
      }
    });
  }

  function updateStageNextStepButtonState(state, dataSnapshot = null) {
    const snapshot = dataSnapshot || getLatestRoomSnapshot?.() || null;
    const button = getStageNextStepButton();
    const { badgeWrap } = getTableDiceElements();

    const hasRoom = Boolean(state?.roomId);
    const selfAccount = String(state?.account || '').trim();
    const roomStatus = Number(snapshot?.room?.room_status || 0);
    const currentAccount = String(snapshot?.turn?.current_account || '').trim();
    const selfStatus = Number(snapshot?.players?.[selfAccount]?.status || 0);
    const pendingSteal = getPendingStealState(state, snapshot);
    const pendingKillLoot = getPendingKillLootState(state, snapshot);
    const equipmentConfirm = getEquipmentConfirmPromptState(state, snapshot);
    const greenConfirm = getGreenConfirmPromptState(state, snapshot);
    const cardPrompt = getCardPromptState(state, snapshot);
    const attackPrompt = getAttackPromptState(state, snapshot);
    const counterAttackPrompt = getCounterAttackPromptState(state, snapshot);
    const movePrompt = getMoveAreaPromptState(state, snapshot);
    const pendingDiceAction = getPendingDiceAction();
    const diceRollBusy = getDiceRollBusy();
    const diceRollAnimating = getDiceRollAnimating();
    const stageNextStepBusy = getStageNextStepBusy();
    const activeCardName = String(snapshot?.active_card?.name || snapshot?.active_card_display?.name || '').trim();
    const status5RollLabelKey = activeCardName === 'Blessing'
      ? 'room.table_next_step.roll_heal_dice'
      : 'room.table_next_step.roll_damage_dice';

    let disabled = false;
    let label = t('room.table_next_step.default');
    let phase = '';

    if (!hasRoom || !selfAccount) {
      disabled = true;
      label = t('room.table_next_step.not_joined');
    } else if (roomStatus === 3) {
      disabled = true;
      label = t('room.table_next_step.game_ended');
    } else if (roomStatus !== 2) {
      disabled = true;
      label = t('room.table_next_step.wait_start');
    } else if (Boolean(snapshot?.room?.awaiting_gm_release)) {
      // 2026-10-15 修正：開啟 GM 功能的房間，開局後會先暫停等 GM 按「開始遊戲流程」
      // （見 room.awaiting_gm_release），這段期間 current_account 其實已經是首位行動
      // 玩家，但該玩家的 status 還停留在 0，不在下面任何一個分支的判斷範圍內，會掉到
      // 最後的 catch-all（disabled 預設是 false），導致這顆按鈕在暫停期間還能按——
      // 點了也沒有實際作用（後端這段期間沒有任何進行中的回合），但看起來像壞掉一樣，
      // Mike 回報要改掉。補上這個分支，暫停期間明確停用並顯示等待 GM 的提示文字。
      disabled = true;
      label = t('room.table_next_step.wait_gm_release');
    } else if (greenConfirm.waitingConfirm) {
      label = t('room.table_next_step.confirm_card');
      phase = 'turn-start';
    } else if (selfAccount !== currentAccount) {
      disabled = true;
      label = t('room.table_next_step.wait_turn');
    } else if (diceRollBusy || diceRollAnimating || stageNextStepBusy) {
      disabled = true;
      label = t('room.table_next_step.busy');
    } else if (pendingDiceAction) {
      disabled = true;
      label = t(pendingDiceAction.labelKey || 'room.table_next_step.roll_move_dice');
    } else if (equipmentConfirm.active) {
      label = t('room.table_next_step.equip');
      phase = 'equip';
    } else if (greenConfirm.active) {
      disabled = true;
      label = greenConfirm.needsChoice ? t('room.table_next_step.choose_effect') : t('room.table_next_step.wait_target_confirm');
    } else if (selfStatus === 1 && getPendingAbilityActivation()) {
      disabled = true;
      label = t('room.table_next_step.choose_target');
    } else if (selfStatus === 1 || selfStatus === 2) {
      // status=1（回合開始）跟 status=2（擲骰移動）現在共用同一套按鈕行為：
      // 「回合開始」按鈕本身已經沒有獨立用途（按下行動骰之前，開場/移動能力都還能發動），
      // 這裡一律顯示停用狀態，引導玩家改用中央骰子區塊按下行動骰。
      disabled = true;
      label = t('room.table_next_step.roll_move_dice');
    } else if (pendingKillLoot.active) {
      disabled = true;
      label = t('room.table_next_step.choose_equipment');
    } else if (selfStatus === 5) {
      if (counterAttackPrompt.active) {
        label = t('room.table_next_step.skip_attack');
        phase = 'skip-attack';
      } else {
        disabled = true;
        label = t(status5RollLabelKey);
      }
    } else if (selfStatus === 3) {
      if (pendingSteal.active) {
        disabled = true;
        label = t('room.table_next_step.choose_equipment');
      } else if (cardPrompt.active) {
        if (['self', 'others', 'all', 'area'].includes(cardPrompt.target)) {
          label = t('room.table_next_step.use_card');
          phase = 'use-card';
        } else {
          disabled = true;
          label = t('room.table_next_step.choose_target');
        }
      } else {
        label = t('room.table_next_step.skip_area');
        phase = 'skip-area';
      }
    } else if (selfStatus === 4) {
      label = t('room.table_next_step.skip_attack');
      if (attackPrompt.force && attackPrompt.targetAccounts.length > 0) {
        disabled = true;
      } else {
        // 2026-10-13 修正：這裡原本只設定了按鈕文字，沒有設定 data-phase，
        // 導致這個「跳過攻擊」按鈕（跟下面 selfStatus === 5 + counterAttackPrompt
        // 那個變體不同）即使可以點，也完全沒有閃爍提示。只在按鈕真的可以按
        // （沒有被強制攻擊鎖住）的情況下才設定 phase，跟 disabled 判斷邏輯一致。
        phase = 'skip-attack';
      }
    } else if (selfStatus === 6) {
      label = t('room.table_next_step.end_turn');
      // 2026-10-19 修正：這個分支原本沒有設定 phase，導致結束回合按鈕從來沒有
      // 閃爍提示過（下面統一設定 data-phase 的地方會因為 phase 是空字串而直接
      // removeAttribute），Mike 發現後要求補上，跟其他可操作階段共用同一套
      // turn-start-pulse 琥珀色閃爍樣式（見 theme.css 對應修正）。
      phase = 'end-turn';
    } else {
      const phaseLabel = t(`status.${selfStatus}`) || t('common.unknown');
      label = t('room.table_next_step.next_phase', { phase: phaseLabel });
    }

    if (button) {
      button.textContent = label;
      button.disabled = disabled;
      button.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      button.setAttribute('aria-label', label);
      if (phase) {
        button.setAttribute('data-phase', phase);
        syncPulseAnimationDelay(button);
      } else {
        button.removeAttribute('data-phase');
        clearPulseAnimationDelay(button);
      }
    }

    // 2026-10-12 修正：擊殺後掠奪裝備（pendingKillLoot）發生時，玩家的 status
    // 仍然停留在 5（跟攻擊擲骰同一個階段），導致原本的骰子閃爍判斷誤判成「可以
    // 擲骰」，骰子跟著閃爍；但這個時間點玩家應該做的是選擇要拿哪件裝備，不是
    // 擲骰，所以要排除 pendingKillLoot.active 的情況。
    const shouldPromptRoll = Boolean(
      hasRoom
      && selfAccount
      && roomStatus === 2
      && selfAccount === currentAccount
      && !pendingKillLoot.active
      && (
        Boolean(pendingDiceAction)
        || selfStatus === 5
        || selfStatus === 1
        || (selfStatus === 2 && !movePrompt.active)
      )
      && !diceRollBusy
      && !diceRollAnimating
      && !stageNextStepBusy
    );
    badgeWrap?.classList.toggle('is-roll-prompt', shouldPromptRoll);
    if (badgeWrap) {
      const labelKey = pendingDiceAction?.labelKey
        || (selfStatus === 5 ? status5RollLabelKey : 'room.table_next_step.roll_move_dice');
      const labelText = t(labelKey);
      const rollPromptLabel = `可${labelText}，請點擊骰子`;
      const idleLabel = labelText;
      badgeWrap.setAttribute('aria-disabled', shouldPromptRoll ? 'false' : 'true');
      badgeWrap.setAttribute('aria-label', shouldPromptRoll ? rollPromptLabel : idleLabel);
      // 2026-10-19 修正（再追加）：Mike 要求骰子閃爍頻率要跟牌庫按鈕對齊，
      // 週期已經在 theme.css 改成一樣的 0.65s（PULSE_SYNC_PERIOD_MS），但骰子
      // 跟牌庫按鈕是各自獨立觸發的元素（不像兩顆骰子那樣同一刻一起觸發），
      // 沒有相位同步的話週期一樣也不會看起來「對齊」，所以補回同步呼叫——
      // 跟牌庫按鈕、下一步按鈕共用同一個 syncPulseAnimationDelay，對齊同一個
      // wall-clock 相位。動畫實際套在 .stage-badge（六面骰、四面骰都有）身上，
      // 不是 badgeWrap 本身，所以要分別對兩顆骰子處理。
      badgeWrap.querySelectorAll('.stage-badge').forEach((badgeEl) => {
        if (shouldPromptRoll) syncPulseAnimationDelay(badgeEl);
        else clearPulseAnimationDelay(badgeEl);
      });
    }

    updateStagePilePromptState(state, snapshot);
  }

  return {
    updateStagePilePromptState,
    updateStageNextStepButtonState,
  };
}
