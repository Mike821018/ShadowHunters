/**
 * actionForms.js
 * Binds all game-action form submit handlers and related quick-action buttons:
 *   startGameForm, btnGetState, btnNextSkip, nextStepForm,
 *   cardEffectForm, lootForm, stealForm
 */

export function bindActionForms({ el, state, dispatch, renderState, toast, t, goToLobbyPage }) {
  el.startGameForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;
    const seed = el.seed.value ? Number(el.seed.value) : undefined;
    const data = await dispatch('start_game', { room_id: state.roomId, seed, account: state.account || undefined });
    renderState(data);
    toast(t('toast.game_started'));
  });

  el.btnGetState?.addEventListener('click', async () => {
    if (!state.roomId) return;
    try {
      const data = await dispatch('get_room_state', { room_id: state.roomId, account: state.account || undefined });
      renderState(data);
    } catch (error) {
      if (error.code === 'ROOM_NOT_FOUND') goToLobbyPage();
    }
  });

  el.btnNextSkip?.addEventListener('click', async () => {
    if (!state.roomId) return;
    const data = await dispatch('next_step', {
      room_id: state.roomId,
      account: state.account || undefined,
      action: false,
      target: { kind: 'none' },
    });
    renderState(data);
    toast(t('toast.advanced'));
  });

  el.nextStepForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;

    const kind = el.targetKind.value;
    const id = el.targetId.value.trim();
    const target = kind === 'none' ? { kind: 'none' } : { kind, id };

    const payload = {
      room_id: state.roomId,
      account: state.account || undefined,
      action: el.nextAction.value === 'true',
      action_type: el.nextActionType.value.trim() || undefined,
      target,
    };

    const data = await dispatch('next_step', payload);
    renderState(data);
    toast(t('toast.next_step_ok'));
  });

  el.cardEffectForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;
    const kind = el.cardTargetKind.value;
    const id = el.cardTargetId.value.trim();
    const target = kind === 'none' ? { kind: 'none' } : { kind, id };
    const data = await dispatch('card_effect', { room_id: state.roomId, account: state.account || undefined, target });
    renderState(data);
    toast(t('toast.card_effect_ok'));
  });

  el.lootForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;
    const from_account = el.lootFromAccount.value.trim();
    if (!from_account) return;
    const payload = {
      room_id: state.roomId,
      account: state.account || undefined,
      from_account,
      equipment_name: el.lootEquipment.value.trim() || undefined,
      take_all: el.lootTakeAll.value === 'true',
    };
    const data = await dispatch('loot_from_kill', payload);
    renderState(data);
    toast(t('toast.loot_ok'));
  });

  el.stealForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!state.roomId) return;
    const payload = {
      room_id: state.roomId,
      account: state.account || undefined,
      from_account: el.stealFromAccount.value.trim(),
      to_account: el.stealToAccount.value.trim(),
      equipment_name: el.stealEquipment.value.trim(),
    };
    if (!payload.from_account || !payload.to_account || !payload.equipment_name) return;
    const data = await dispatch('steal_equipment', payload);
    renderState(data);
    toast(t('toast.steal_ok'));
  });
}
