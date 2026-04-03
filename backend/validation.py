from typing import Any, Dict

from backend.game.board import board
from backend.game.card_module import Anger, Blackmail, Greed, MoodyGoblin, Talisman
from backend.game.character_module import Catherine, Franklin, Unknown, Vampire, Werewolf
from backend.game.room import room
from backend.room_manager import RoomManager


def validate_game_flow(seed: int = 7) -> Dict[str, Any]:
    manager = RoomManager()
    game_room = manager.create_room('validation-room')

    for i in range(4):
        manager.join_room(
            game_room.room_id,
            {
                'trip': f'player-{i + 1}',
                'account': f'player-{i + 1}',
                'password': 'pw',
                'name': f'Player {i + 1}',
            },
        )

    game_room = manager.start_game(game_room.room_id, seed=seed)

    assert game_room.board is not None
    assert game_room.room_status == 2
    assert len(game_room.action_order) == 4
    assert all(p.character is not None for p in game_room.players.values())
    assert all(p.color for p in game_room.players.values())

    original_roll_dice = game_room.board.roll_dice
    scripted_rolls = [(1, 1)]

    def scripted_roll_dice(roll_type):
        if scripted_rolls:
            return scripted_rolls.pop(0)
        return original_roll_dice(roll_type)

    game_room.board.roll_dice = scripted_roll_dice

    manager.next_step(game_room.room_id, action=False)
    assert game_room.current_player is not None
    assert game_room.current_player.status == 2

    for _ in range(8):
        if game_room.current_player.status != 2:
            break
        manager.next_step(game_room.room_id)
    assert game_room.current_player.status == 3
    assert game_room.current_player.area is not None

    game_room.board.roll_dice = original_roll_dice

    manager.next_step(game_room.room_id, action=False)
    assert game_room.current_player.status == 4

    manager.next_step(game_room.room_id, action=False)
    if game_room.current_player.status == 4:
        attackable = game_room._get_attackable_targets(game_room.current_player)
        if attackable:
            manager.next_step(game_room.room_id, target=attackable[0], action=True)
            assert game_room.current_player.status == 5
            manager.next_step(game_room.room_id)
        else:
            manager.next_step(game_room.room_id, action=False)
    assert game_room.current_player.status in [5, 6]

    if game_room.current_player.status == 5:
        if game_room._pending_kill_loot:
            for dead in list(game_room._pending_kill_loot['deaths']):
                manager.loot_from_kill(game_room.room_id, dead)
            manager.next_step(game_room.room_id)
        else:
            manager.next_step(game_room.room_id)

    current_account = game_room.current_player.account
    manager.next_step(game_room.room_id, action=False)
    assert game_room.current_player.account != current_account
    assert game_room.current_player.status == 1

    return {
        'room_id': game_room.room_id,
        'room_status': game_room.room_status,
        'action_order': game_room.action_order,
        'current_player': game_room.current_player.account,
        'next_status': game_room.current_player.status,
        'players': {
            account: {
                'color': p.color,
                'character': p.character.name if p.character else None,
                'alive': p.is_alive,
                'area': p.area.name if p.area else None,
                'status': p.status,
            }
            for account, p in game_room.players.items()
        },
    }


def validate_roll_7_flow(seed: int = 13) -> Dict[str, Any]:
    manager = RoomManager()
    game_room = manager.create_room('validation-roll-7')

    for i in range(4):
        manager.join_room(
            game_room.room_id,
            {
                'trip': f'roll7-player-{i + 1}',
                'account': f'roll7-player-{i + 1}',
                'password': 'pw',
                'name': f'Roll7 Player {i + 1}',
            },
        )

    game_room = manager.start_game(game_room.room_id, seed=seed)
    manager.next_step(game_room.room_id, action=False)
    assert game_room.current_player is not None
    assert game_room.current_player.status == 2

    original_roll_dice = game_room.board.roll_dice

    def scripted_roll_dice(roll_type):
        return (1, 6)

    game_room.board.roll_dice = scripted_roll_dice
    manager.next_step(game_room.room_id)

    assert game_room.current_player.status == 2
    expected_options = len(game_room.board.field)
    if game_room.current_player.area:
        expected_options -= 1
    assert len(game_room._move_area_options) == expected_options
    selectable_options = [area.name for area in game_room._move_area_options]

    chosen_area = game_room._move_area_options[0]
    manager.next_step(game_room.room_id, target=chosen_area)
    assert game_room.current_player.status == 3
    assert game_room.current_player.area == chosen_area
    assert not game_room._move_area_options

    game_room.board.roll_dice = original_roll_dice

    return {
        'room_id': game_room.room_id,
        'current_player': game_room.current_player.account,
        'chosen_area': chosen_area.name,
        'available_options': selectable_options,
    }


def validate_unknown_green_card_forced_effects() -> Dict[str, Any]:
    def build_room(card):
        game_room = room()
        game_room.board = board(game_room)
        game_room.join({'trip': 'source', 'account': 'source', 'password': 'pw', 'name': 'Source'})
        game_room.join({'trip': 'unknown', 'account': 'unknown', 'password': 'pw', 'name': 'Unknown'})

        source_player = game_room.players['source']
        unknown_player = game_room.players['unknown']
        source_player.assign_character(Vampire())
        unknown_player.assign_character(Unknown())
        unknown_player.equip(Talisman())

        game_room.room_status = 2
        game_room.current_player = source_player
        game_room.active_card = card
        game_room._pending_green_card = {
            'from_player': source_player,
            'to_player': unknown_player,
            'card': card,
            'choice': None,
        }
        return game_room, source_player, unknown_player

    results = {}
    for card in (Anger(), Blackmail(), Greed()):
        give_room, give_source, give_unknown = build_room(card)
        assert give_room.set_pending_green_card_choice('unknown', 'activate')
        assert give_room.confirm_pending_green_card('unknown')
        pending_steal = getattr(give_room, '_pending_steal', None)
        assert pending_steal is not None
        assert pending_steal.get('from_player') is give_unknown
        assert pending_steal.get('to_player') is give_source

        damage_room, _damage_source, damage_unknown = build_room(type(card)())
        assert damage_room.set_pending_green_card_choice('unknown', 'skip')
        assert damage_room.confirm_pending_green_card('unknown')
        assert int(getattr(damage_unknown, 'damage', 0) or 0) == 1

        results[card.name] = {
            'give_equipment': True,
            'take_damage': int(getattr(damage_unknown, 'damage', 0) or 0),
        }

    return results


def validate_forced_character_config() -> Dict[str, Any]:
    manager = RoomManager()
    game_room = manager.create_room('validation-forced-character')

    for i in range(4):
        manager.join_room(
            game_room.room_id,
            {
                'trip': f'forced-player-{i + 1}',
                'account': f'forced-player-{i + 1}',
                'password': 'pw',
                'name': f'Forced Player {i + 1}',
            },
        )

    # 非村長也可設定自己的除錯角色指定：開局前把 player-1 固定成 Werewolf。
    ok_result = manager.api_update_room_settings({
        'room_id': game_room.room_id,
        'account': 'forced-player-1',
        'debug_forced_characters': {
            'forced-player-1': 'Werewolf',
        },
    })
    assert bool(ok_result.get('ok'))

    # 非村長不可指定其他玩家角色。
    denied_result = manager.api_update_room_settings({
        'room_id': game_room.room_id,
        'account': 'forced-player-1',
        'debug_forced_characters': {
            'forced-player-2': 'Vampire',
        },
    })
    assert not bool(denied_result.get('ok'))
    assert str((denied_result.get('error') or {}).get('code') or '') == 'FORCED_CHARACTER_SCOPE_DENIED'

    invalid_config_result = manager.api_update_room_settings({
        'room_id': game_room.room_id,
        'account': 'forced-player-1',
        'debug_forced_characters': {
            'forced-player-1': 'Bob',
        },
    })
    assert not bool(invalid_config_result.get('ok'))
    assert str((invalid_config_result.get('error') or {}).get('code') or '') == 'INVALID_FORCED_CHARACTER_CONFIG'

    # 還原為可通過配置，再開始遊戲。
    reset_result = manager.api_update_room_settings({
        'room_id': game_room.room_id,
        'account': 'forced-player-1',
        'debug_forced_characters': {
            'forced-player-1': 'Werewolf',
        },
    })
    assert bool(reset_result.get('ok'))

    game_room = manager.start_game(game_room.room_id, seed=31)
    assigned_role = str(getattr(getattr(game_room.players['forced-player-1'], 'character', None), 'name', '') or '')
    assert assigned_role == 'Werewolf'

    check_room = manager.create_room('validation-forced-character-check')
    for i in range(4):
        manager.join_room(
            check_room.room_id,
            {
                'trip': f'forced-check-{i + 1}',
                'account': f'forced-check-{i + 1}',
                'password': 'pw',
                'name': f'Forced Check {i + 1}',
            },
        )

    normalized = manager.check_forced_character_config(
        check_room.room_id,
        {'forced-check-1': 'werewolf', 'forced-check-2': 'vampire'},
    )
    assert normalized['forced-check-1'] == 'Werewolf'
    assert normalized['forced-check-2'] == 'Vampire'

    error_code = ''
    try:
        manager.check_forced_character_config(check_room.room_id, {'forced-check-1': 'Bob'})
    except ValueError as exc:
        error_code = str(exc)
    assert 'exceeds Civilian quota' in error_code

    return {
        'room_id': game_room.room_id,
        'forced_account': 'forced-player-1',
        'forced_role': assigned_role,
        'config_check': normalized,
    }


def validate_werewolf_counter_attack_flow() -> Dict[str, Any]:
    game_room = room()
    game_room.board = board(game_room)
    game_room.join({'trip': 'atk', 'account': 'atk', 'password': 'pw', 'name': 'Attacker'})
    game_room.join({'trip': 'wolf', 'account': 'wolf', 'password': 'pw', 'name': 'Werewolf'})

    attacker = game_room.players['atk']
    werewolf = game_room.players['wolf']
    attacker.assign_character(Franklin())
    werewolf.assign_character(Werewolf())

    game_room.room_status = 2
    game_room.current_player = attacker
    attacker.status = 5
    werewolf.status = 0
    game_room._attack_target = werewolf

    def fixed_roll(mode):
        if int(mode or 0) == 3:
            return 1, 5
        return 1, 1

    game_room.board.roll_dice = fixed_roll

    game_room.next_step(action=True)
    assert game_room.current_player is werewolf
    assert int(getattr(werewolf, 'status', 0) or 0) == 5
    assert bool(getattr(game_room, '_pending_counter_attack', None))

    game_room.next_step(action=False)
    assert game_room.current_player is attacker
    assert int(getattr(attacker, 'status', 0) or 0) == 6
    assert getattr(game_room, '_pending_counter_attack', None) is None

    attacker.status = 5
    game_room.current_player = attacker
    game_room._attack_target = werewolf
    game_room.next_step(action=True)
    assert game_room.current_player is werewolf
    assert int(getattr(werewolf, 'status', 0) or 0) == 5

    return {
        'werewolf_damage': int(getattr(werewolf, 'damage', 0) or 0),
        'attacker_status_after_skip': int(getattr(attacker, 'status', 0) or 0),
        'counter_pending_recreated': bool(getattr(game_room, '_pending_counter_attack', None)),
    }


def validate_moody_goblin_no_equipment_flow() -> Dict[str, Any]:
    manager = RoomManager()
    game_room = manager.create_room('validation-moody-goblin')
    manager.join_room(
        game_room.room_id,
        {'trip': 'moody-a', 'account': 'moody-a', 'password': 'pw', 'name': 'Moody A'},
    )
    manager.join_room(
        game_room.room_id,
        {'trip': 'moody-b', 'account': 'moody-b', 'password': 'pw', 'name': 'Moody B'},
    )

    source = game_room.players['moody-a']
    target = game_room.players['moody-b']
    source.assign_character(Vampire())
    target.assign_character(Unknown())

    game_room.room_status = 2
    game_room.current_player = source
    source.status = 3
    game_room.active_card = MoodyGoblin()

    snapshot = manager._serialize_room_state(game_room, viewer_account='moody-a')
    card_prompt = snapshot.get('card_prompt') or {}
    assert str(card_prompt.get('target') or '') == 'self'
    assert list(card_prompt.get('target_accounts') or []) == []

    game_room.card_effect(target=None)
    assert getattr(game_room, 'active_card', None) is None
    assert int(getattr(source, 'status', 0) or 0) == 4

    return {
        'card_prompt_target': str(card_prompt.get('target') or ''),
        'target_account_count': len(list(card_prompt.get('target_accounts') or [])),
        'status_after_effect': int(getattr(source, 'status', 0) or 0),
    }


def validate_green_confirm_timeout_flow() -> Dict[str, Any]:
    game_room = room()
    game_room.board = board(game_room)
    game_room.join({'trip': 'source', 'account': 'source', 'password': 'pw', 'name': 'Source'})
    game_room.join({'trip': 'target', 'account': 'target', 'password': 'pw', 'name': 'Target'})
    game_room.join({'trip': 'hunter-1', 'account': 'hunter-1', 'password': 'pw', 'name': 'Hunter 1'})
    game_room.join({'trip': 'hunter-2', 'account': 'hunter-2', 'password': 'pw', 'name': 'Hunter 2'})

    source = game_room.players['source']
    target = game_room.players['target']
    hunter_1 = game_room.players['hunter-1']
    hunter_2 = game_room.players['hunter-2']
    source.assign_character(Vampire())
    target.assign_character(Vampire())
    hunter_1.assign_character(Franklin())
    hunter_2.assign_character(Franklin())

    game_room.room_status = 2
    game_room.current_player = source
    source.status = 3
    game_room.active_card = Anger()
    game_room._pending_green_card = {
        'from_player': source,
        'to_player': target,
        'card': game_room.active_card,
        'choice': None,
    }
    game_room.turn_last_action_at = 0.0

    snapshot_before = game_room.get_turn_timeout_snapshot() or {}
    assert str(snapshot_before.get('current_account') or '') == 'target'

    game_room._handle_turn_timeout()

    assert not bool(getattr(target, 'is_alive', True))
    assert getattr(game_room, '_pending_green_card', None) is None
    assert int(getattr(game_room, 'room_status', 0) or 0) == 2
    assert game_room.current_player is source
    assert int(getattr(source, 'status', 0) or 0) == 4

    return {
        'timeout_account': str(snapshot_before.get('current_account') or ''),
        'target_alive_after_timeout': bool(getattr(target, 'is_alive', True)),
        'source_status_after_timeout': int(getattr(source, 'status', 0) or 0),
    }


def validate_catherine_start_passive_heal_flow() -> Dict[str, Any]:
    manager = RoomManager()
    game_room = manager.create_room('validation-catherine-start-passive')
    manager.join_room(
        game_room.room_id,
        {'trip': 'catherine', 'account': 'catherine', 'password': 'pw', 'name': 'Catherine'},
    )
    manager.join_room(
        game_room.room_id,
        {'trip': 'other', 'account': 'other', 'password': 'pw', 'name': 'Other'},
    )

    catherine_player = game_room.players['catherine']
    other_player = game_room.players['other']
    catherine_player.assign_character(Catherine())
    other_player.assign_character(Vampire())

    game_room.room_status = 2
    game_room.action_order = ['catherine', 'other']
    game_room._start_turn_for_player(catherine_player)
    catherine_player.damage = 2

    reveal_result = manager.api_reveal_character({'room_id': game_room.room_id, 'account': 'catherine'})
    assert bool(reveal_result.get('ok'))
    assert bool(getattr(catherine_player, 'character_reveal', False))
    assert int(getattr(catherine_player, 'damage', 0) or 0) == 1
    damage_after_reveal = int(getattr(catherine_player, 'damage', 0) or 0)

    # 同一回合的回合開始被動只能生效一次，next_step 不可再補一次。
    manager.next_step(game_room.room_id, action=False)
    assert int(getattr(catherine_player, 'damage', 0) or 0) == 1
    damage_same_turn_after_next_step = int(getattr(catherine_player, 'damage', 0) or 0)

    # 進入下一輪再回到 Catherine 時，回合開始被動應再次生效。
    catherine_player.status = 6
    game_room.current_player = catherine_player
    manager.next_step(game_room.room_id, action=False)
    other_player.status = 6
    game_room.current_player = other_player
    manager.next_step(game_room.room_id, action=False)
    manager.next_step(game_room.room_id, action=False)
    assert int(getattr(catherine_player, 'damage', 0) or 0) == 0
    damage_on_next_turn_start = int(getattr(catherine_player, 'damage', 0) or 0)

    return {
        'damage_after_reveal': damage_after_reveal,
        'damage_same_turn_after_next_step': damage_same_turn_after_next_step,
        'damage_on_next_turn_start': damage_on_next_turn_start,
    }
