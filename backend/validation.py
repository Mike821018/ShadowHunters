from typing import Any, Dict

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
