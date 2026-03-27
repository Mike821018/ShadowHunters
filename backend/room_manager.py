import random
import base64
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from backend.game import character_module
from backend.game import info as game_info
from backend.game import room
from backend.game_records_api import GameRecordsAPI
from backend.records_system import GameRecordStore


PLAYER_COLORS = [
    'White', 'Black', 'Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange', 'Grey'
]


API_SCHEMAS = {
    '$schema': 'https://json-schema.org/draft/2020-12/schema',
    'title': 'ShadowHunters Backend API Schemas',
    'type': 'object',
    'properties': {
        'version': {'type': 'string', 'const': '1.0.0'},
        'request': {
            'type': 'object',
            'properties': {
                'action': {
                    'type': 'string',
                    'enum': [
                        'create_room', 'list_rooms', 'join_room', 'leave_room',
                        'login_room',
                        'start_game', 'next_step', 'card_effect', 'loot_from_kill',
                        'steal_equipment', 'set_green_card_choice', 'confirm_green_card', 'confirm_equipment',
                        'get_room_state', 'change_color', 'abolish_room', 'toggle_ready', 'vote_kick',
                        'register_trip', 'change_trip', 'claim_trip_records', 'modify_trip_records', 'delete_trip_records',
                        'submit_trip_rating'
                    ],
                },
                'payload': {'type': 'object'},
            },
            'required': ['action', 'payload'],
        },
        'response': {'$ref': '#/$defs/Envelope'},
    },
    'required': ['version', 'request', 'response'],
    '$defs': {
        'Problem': {
            'type': 'object',
            'properties': {
                'type': {'type': 'string'},
                'title': {'type': 'string'},
                'status': {'type': 'integer'},
                'detail': {'type': 'string'},
                'instance': {'type': 'string'},
                'code': {'type': 'string'},
                'errors': {'type': 'array', 'items': {'type': 'object'}},
            },
            'required': ['title', 'status', 'code'],
        },
        'Envelope': {
            'type': 'object',
            'properties': {
                'ok': {'type': 'boolean'},
                'event': {'type': 'string'},
                'data': {'type': ['object', 'array', 'null']},
                'error': {'anyOf': [{'$ref': '#/$defs/Problem'}, {'type': 'null'}]},
                'meta': {
                    'type': 'object',
                    'properties': {
                        'timestamp': {'type': 'string'},
                        'version': {'type': 'string'},
                    },
                    'required': ['timestamp', 'version'],
                },
            },
            'required': ['ok', 'event', 'data', 'error', 'meta'],
        },
        'TargetRef': {
            'type': 'object',
            'properties': {
                'kind': {'type': 'string', 'enum': ['player', 'area', 'none']},
                'id': {'type': ['string', 'null']},
            },
            'required': ['kind'],
        },
    },
}


class RoomManager:
    def __init__(self):
        self.rooms: Dict[int, room.room] = {}
        self._next_room_id = 1
        self.record_store = GameRecordStore()
        self.records_api = GameRecordsAPI(self.record_store)

    def get_api_schemas(self) -> Dict[str, Any]:
        return API_SCHEMAS

    def create_room(
        self,
        room_name: str,
        room_comment: str = '',
        require_trip: bool = False,
        hide_trip: bool = True,
        trip_min_games: int = 0,
        manager_trip: str = '',
        manager_trip_encrypted: bool = True,
        is_chat_room: bool = False,
        expansion_mode: str = 'all',
        enable_initial_green_card: bool = False,
    ) -> room.room:
        game_room = room.room()
        game_room.room_id = self._next_room_id
        game_room.room_name = room_name
        game_room.room_comment = room_comment
        game_room.require_trip = require_trip
        game_room.hide_trip = hide_trip is not False
        game_room.trip_min_games = max(0, int(trip_min_games or 0))
        game_room.manager_trip = str(manager_trip or '').strip()
        game_room.manager_trip_encrypted = manager_trip_encrypted is not False
        game_room.is_chat_room = bool(is_chat_room)
        game_room.expansion_mode = self._normalize_expansion_mode(expansion_mode)
        game_room.enable_initial_green_card = bool(enable_initial_green_card)
        game_room.max_players = 50 if game_room.is_chat_room else 8
        game_room.manager_ref = self
        game_room.room_status = 1
        game_room.create()
        self.rooms[game_room.room_id] = game_room
        self._next_room_id += 1
        return game_room

    def list_rooms(self) -> List[Dict[str, Any]]:
        return [self._serialize_room(game_room) for game_room in self.rooms.values()]

    def get_room(self, room_id: int) -> Optional[room.room]:
        return self.rooms.get(room_id)

    def remove_room(self, room_id: int) -> bool:
        game_room = self.rooms.pop(room_id, None)
        if not game_room:
            return False
        game_room.stop = True
        return True

    def join_room(self, room_id: int, player_info: Dict[str, Any]) -> bool:
        game_room = self.get_room(room_id)
        if not game_room:
            return False
        return game_room.join(player_info)

    def is_trip_taken(self, room_id: int, trip: str) -> bool:
        game_room = self.get_room(room_id)
        if not game_room:
            return False
        return game_room.has_trip(trip)

    def is_account_taken(self, room_id: int, account: str) -> bool:
        game_room = self.get_room(room_id)
        if not game_room:
            return False
        return game_room.has_account(account)

    def leave_room(self, room_id: int, account: str) -> bool:
        game_room = self.get_room(room_id)
        if not game_room:
            return False
        ret = game_room.kick(account)
        # 不再因最後一位玩家離開而自動廢村。
        # TODO: 後續改由獨立的廢村機制（例如超時、村長操作、排程任務）管理房間生命週期。
        return ret

    def login_room(self, room_id: int, account: str, password: str) -> Optional[str]:
        game_room = self.get_room(room_id)
        if not game_room:
            return None
        return game_room.login(account, password)

    def start_game(self, room_id: int, seed: Optional[int] = None) -> room.room:
        game_room = self.get_room(room_id)
        if not game_room:
            raise ValueError('room not found')
        if bool(getattr(game_room, 'is_chat_room', False)):
            raise ValueError('chat rooms cannot start game')

        player_count = len(game_room.players)
        if player_count not in range(4, 9):
            raise ValueError('Shadow Hunters requires 4 to 8 players')

        if seed is not None:
            random.seed(seed)

        for p in game_room.players.values():
            p.profile['is_ready'] = False

        self._assign_colors(game_room)
        self._assign_characters(game_room)
        game_room.game_start()
        return game_room

    def finalize_game(self, room_id: int) -> Optional[str]:
        game_room = self.get_room(room_id)
        if not game_room:
            return None
        return self.records_api.on_game_end(game_room)

    def next_step(self, room_id: int, target=None, action: bool = False, action_type: Optional[str] = None):
        game_room = self._require_room(room_id)
        return game_room.next_step(target=target, action=action, action_type=action_type)

    def card_effect(self, room_id: int, target=None, choice: Optional[str] = None):
        game_room = self._require_room(room_id)
        return game_room.card_effect(target=target, choice=choice)

    def steal_equipment(self, room_id: int, from_player, to_player, equipment):
        game_room = self._require_room(room_id)
        return game_room.steal_equipment(from_player, to_player, equipment)

    def set_green_card_choice(self, room_id: int, account: str, choice: str):
        game_room = self._require_room(room_id)
        return game_room.set_pending_green_card_choice(account=account, choice=choice)

    def confirm_green_card(self, room_id: int, account: str):
        game_room = self._require_room(room_id)
        return game_room.confirm_pending_green_card(account=account)

    def loot_from_kill(self, room_id: int, from_player, equipment=None, take_all: bool = False) -> bool:
        game_room = self._require_room(room_id)
        return game_room.loot_from_kill(from_player, equipment=equipment, take_all=take_all)

    def _require_room(self, room_id: int) -> room.room:
        game_room = self.get_room(room_id)
        if not game_room:
            raise ValueError('room not found')
        return game_room

    def _assign_colors(self, game_room: room.room):
        used = set()
        for p in game_room.players.values():
            if p.color in PLAYER_COLORS and p.color not in used:
                used.add(p.color)

        remaining = [c for c in PLAYER_COLORS if c not in used]
        random.shuffle(remaining)
        remain_idx = 0

        for p in game_room.players.values():
            if p.color in PLAYER_COLORS and p.color in used:
                # keep preselected unique color
                used.discard(p.color)
                continue
            if remain_idx < len(remaining):
                p.choose_color(remaining[remain_idx])
                remain_idx += 1

    def _assign_characters(self, game_room: room.room):
        player_count = len(game_room.players)
        camp_config = character_module.camp_setting[player_count]
        expansion_mode = self._normalize_expansion_mode(getattr(game_room, 'expansion_mode', 'all'))

        character_pool = []
        character_pool.extend(self._pick_character_instances(self._resolve_camp_classes(character_module.shadow_camp, expansion_mode), camp_config['Shadow']))
        character_pool.extend(self._pick_character_instances(self._resolve_camp_classes(character_module.hunter_camp, expansion_mode), camp_config['Hunter']))
        character_pool.extend(self._pick_character_instances(self._resolve_camp_classes(character_module.civilian_camp, expansion_mode), camp_config['Civilian']))
        random.shuffle(character_pool)

        for p, character in zip(game_room.players.values(), character_pool):
            p.assign_character(character)

    def _pick_character_instances(self, classes, count: int):
        if count <= 0:
            return []
        if len(classes) < count:
            raise ValueError('insufficient character pool for selected expansion mode')
        picked = random.sample(classes, count)
        return [character_cls() for character_cls in picked]

    def _normalize_expansion_mode(self, mode: Any) -> str:
        normalized = str(mode or 'all').strip().lower()
        if normalized in ('replace', 'swap'):
            return 'all'
        if normalized in ('no_extend', 'noextend', 'basic', 'base', 'none'):
            return 'no_extend'
        return 'all'

    def _resolve_camp_classes(self, classes, expansion_mode: str):
        mode = self._normalize_expansion_mode(expansion_mode)
        if mode == 'all':
            return list(classes)

        filtered = [cls for cls in classes if not getattr(cls(), 'is_extend', False)]
        return filtered if filtered else list(classes)

    def _serialize_room(self, game_room: room.room) -> Dict[str, Any]:
        return {
            'room_id': game_room.room_id,
            'room_name': game_room.room_name,
            'room_comment': getattr(game_room, 'room_comment', ''),
            'room_status': game_room.room_status,
            'is_chat_room': bool(getattr(game_room, 'is_chat_room', False)),
            'expansion_mode': self._normalize_expansion_mode(getattr(game_room, 'expansion_mode', 'all')),
            'max_players': max(1, int(getattr(game_room, 'max_players', 8) or 8)),
            'player_count': len(game_room.players),
            'players': list(game_room.players.keys()),
            'require_trip': getattr(game_room, 'require_trip', False),
            'hide_trip': getattr(game_room, 'hide_trip', True),
            'trip_min_games': max(0, int(getattr(game_room, 'trip_min_games', 0) or 0)),
            'manager_trip_enabled': bool(getattr(game_room, 'manager_trip', '')),
            'manager_trip_encrypted': getattr(game_room, 'manager_trip_encrypted', True),
        }

    def _trip_display_for_state(self, game_room: room.room, trip_display: str) -> str:
        hide_trip = bool(getattr(game_room, 'hide_trip', True))
        if hide_trip and int(getattr(game_room, 'room_status', 0) or 0) != 3:
            return '-'
        return trip_display

    def _serialize_room_state(self, game_room: room.room, viewer_account: Optional[str] = None) -> Dict[str, Any]:
        current_player = game_room.current_player
        pending_loot = game_room._pending_kill_loot
        board_deck = getattr(getattr(game_room, 'board', None), 'card_deck', {}) or {}
        board_fields = list(getattr(getattr(game_room, 'board', None), 'field', []) or [])
        board_dice = getattr(getattr(game_room, 'board', None), 'dice', {}) or {}
        area_info = getattr(game_info, 'info_ch', {}) or {}

        def pile_count(key: str) -> int:
            cards = board_deck.get(key, [])
            if isinstance(cards, list):
                return len(cards)
            try:
                return len(cards)
            except Exception:
                return 0

        card_piles = {
            'Green': {
                'deck': pile_count('Green'),
                'discard': pile_count('Green Discard'),
            },
            'White': {
                'deck': pile_count('White'),
                'discard': pile_count('White Discard'),
            },
            'Black': {
                'deck': pile_count('Black'),
                'discard': pile_count('Black Discard'),
            },
        }

        def serialize_field(area: Any) -> Optional[Dict[str, Any]]:
            if not area:
                return None
            meta = area_info.get(getattr(area, 'name', ''), {}) if isinstance(area_info, dict) else {}
            numbers = getattr(area, 'number', []) or []
            return {
                'name': getattr(area, 'name', '') or '',
                'display_name': str(meta.get('name') or getattr(area, 'name', '') or ''),
                'description': str(meta.get('info') or ''),
                'numbers': [int(value) for value in numbers if isinstance(value, int)],
                'is_draw': bool(getattr(area, 'is_draw', False)),
                'draw_type': str(getattr(area, 'draw_type', '') or ''),
                'is_action': bool(getattr(area, 'is_action', False)),
                'target': str(getattr(area, 'target', '') or ''),
            }

        fields = [serialize_field(area) for area in board_fields[:6]]
        if len(fields) < 6:
            fields.extend([None] * (6 - len(fields)))

        attack_prompt = None
        if current_player and int(getattr(current_player, 'status', 0) or 0) == 4:
            attack_prompt = {
                'target_accounts': [p.account for p in game_room._get_attackable_targets(current_player)],
                'force': bool(getattr(current_player, 'eqp_force_atk', False)),
            }

        area_prompt = None
        if current_player and int(getattr(current_player, 'status', 0) or 0) == 3 and not getattr(game_room, 'active_card', None):
            current_area = getattr(current_player, 'area', None)
            area_name = str(getattr(current_area, 'name', '') or '')
            area_target = str(getattr(current_area, 'target', '') or '')
            if getattr(current_area, 'is_action', False) and area_name == 'Weird Woods':
                target_players = [player for player in game_room.players.values() if bool(getattr(player, 'is_alive', False))]
                if area_target in ('other', 'others'):
                    target_players = [player for player in target_players if player != current_player]
                area_prompt = {
                    'kind': 'weird-woods',
                    'area_name': area_name,
                    'target_accounts': [player.account for player in target_players],
                    'options': list(getattr(current_area, 'options', []) or []),
                }
            elif getattr(current_area, 'is_action', False) and area_name == 'Erstwhile Altar':
                target_players = [player for player in game_room.players.values() if bool(getattr(player, 'is_alive', False)) and bool(getattr(player, 'equipment_list', []))]
                if area_target in ('other', 'others'):
                    target_players = [player for player in target_players if player != current_player]
                area_prompt = {
                    'kind': 'altar',
                    'area_name': area_name,
                    'target_accounts': [player.account for player in target_players],
                    'options': [],
                }

        card_prompt = None
        active_card_display = None
        green_confirm_prompt = None
        active_card = getattr(game_room, 'active_card', None)
        visible_active_card_name = None
        if current_player and active_card:
            card_target = str(getattr(active_card, 'target', '') or '')
            target_accounts = []
            if card_target in ('other', 'one'):
                target_players = [player for player in game_room.players.values() if bool(getattr(player, 'is_alive', False))]
                if card_target == 'other':
                    target_players = [player for player in target_players if player != current_player]
                target_accounts = [player.account for player in target_players]
            # Banana Peel without equipment applies to self; no target selection required
            if str(getattr(active_card, 'name', '') or '') == 'Banana Peel' and not getattr(current_player, 'equipment_list', []):
                card_target = 'self'
                target_accounts = []
            raw_active_card_name = str(getattr(active_card, 'name', '') or '')
            card_prompt = {
                'name': raw_active_card_name,
                'target': card_target,
                'target_accounts': target_accounts,
            }
            card_color = str(getattr(active_card, 'color', '') or '').lower()
            is_green_card = card_color == 'green'
            can_see_name = (
                not is_green_card
                or viewer_account == current_player.account
            )
            visible_active_card_name = raw_active_card_name if can_see_name else None
            if not can_see_name and card_prompt:
                card_prompt['name'] = ''
            active_card_display = {
                'color': card_color,
                'type': str(getattr(active_card, 'type', '') or ''),
                'name': visible_active_card_name,
            }

        pending_green = getattr(game_room, '_pending_green_card', None)
        if pending_green:
            from_player = pending_green.get('from_player')
            to_player = pending_green.get('to_player')
            pending_card = pending_green.get('card')
            if from_player and to_player and pending_card:
                source_account = str(getattr(from_player, 'account', '') or '')
                target_account = str(getattr(to_player, 'account', '') or '')
                needs_choice = bool(game_room._green_card_requires_choice(to_player, pending_card))
                green_confirm_prompt = {
                    'source_account': source_account,
                    'target_account': target_account,
                    'card_name': str(getattr(pending_card, 'name', '') or '') if viewer_account in (source_account, target_account) else '',
                    'waiting_confirm': bool(viewer_account and viewer_account == target_account),
                    'can_set_choice': bool(viewer_account and viewer_account == target_account and needs_choice),
                    'needs_choice': bool(needs_choice and game_room._get_green_card_force_effect(to_player, pending_card, pending_green.get('choice')) not in (1, 2)),
                    'choice': pending_green.get('choice'),
                }
                if active_card_display and str(active_card_display.get('color', '') or '').lower() == 'green':
                    if viewer_account in (source_account, target_account):
                        visible_active_card_name = str(getattr(pending_card, 'name', '') or '')
                        active_card_display['name'] = visible_active_card_name
                    else:
                        visible_active_card_name = None
                card_prompt = None

        pending_steal = getattr(game_room, '_pending_steal', None)
        pending_steal_payload = None
        if pending_steal:
            from_player = pending_steal.get('from_player')
            to_player = pending_steal.get('to_player')
            if from_player and to_player:
                pending_steal_payload = {
                    'from_account': from_player.account,
                    'to_account': to_player.account,
                    'chooser_account': str(pending_steal.get('chooser_account') or ''),
                    'equipment_names': [eq.name for eq in getattr(from_player, 'equipment_list', [])],
                    'source': str(pending_steal.get('source', '') or ''),
                }

        def serialize_invulnerability_sources(p):
            sources = []
            if bool(getattr(p, 'immortal', False)):
                character_name = str(getattr(getattr(p, 'character', None), 'name', '') or '')
                if character_name == 'Gregor':
                    sources.append('Gregor Ability')
                else:
                    sources.append('Character Ability')
            if bool(getattr(p, 'eqp_immortal', False)):
                sources.append('Guardian Angel')
            return sources

        return {
            'room': self._serialize_room(game_room),
            'turn': {
                'current_trip_display': self._trip_display_for_state(game_room, current_player.trip_display) if current_player else None,
                'current_account': current_player.account if current_player else None,
                'status': current_player.status if current_player else None,
            },
            'action_order': list(game_room.action_order or []),
            'move_options': [area.name for area in game_room._move_area_options],
            'compass_options': [area.name for area in (getattr(game_room, '_compass_areas', []) or [])] if len(getattr(game_room, '_compass_areas', []) or []) > 1 else [],
            'pending_kill_loot': {
                'attacker_account': pending_loot['attacker'].account,
                'death_accounts': [p.account for p in pending_loot['deaths']],
                'allow_full': pending_loot['allow_full'],
            } if pending_loot else None,
            'pending_steal': pending_steal_payload,
            'winners': list(getattr(game_room, 'winner_accounts', []) or []),
            'area_prompt': area_prompt,
            'card_prompt': card_prompt,
            'green_confirm_prompt': green_confirm_prompt,
            'attack_prompt': attack_prompt,
            'active_card_display': active_card_display,
            'active_card': {
                'name': visible_active_card_name,
                'type': getattr(game_room.active_card, 'type', None),
                'color': getattr(game_room.active_card, 'color', None),
                'target': getattr(game_room.active_card, 'target', None),
            } if getattr(game_room, 'active_card', None) else None,
            'dice': {
                'D6': int(board_dice.get('D6', 1) or 1),
                'D4': int(board_dice.get('D4', 1) or 1),
            },
            'fields': fields,
            'card_piles': card_piles,
            'players': {
                account: {
                    'account': p.account,
                    'trip_display': p.trip_display if (viewer_account and account == viewer_account) else self._trip_display_for_state(game_room, p.trip_display),
                    'name': p.profile.get('name', '') or p.name,
                    'join_order': int(p.profile.get('join_order', 0) or 0),
                    'avatar_no': int(p.profile.get('avatar_no', 1) or 1),
                    'color': p.color,
                    'is_ready': bool(p.profile.get('is_ready', False)),
                    'alive': p.is_alive,
                    'status': p.status,
                    'damage': p.damage,
                    'hp': p.hp if (game_room.can_view_character(viewer_account, account)) else None,
                    'invulnerability_source': (
                        str(getattr(p, 'immortal_source', '') or '')
                        or str(getattr(p, 'eqp_immortal_source', '') or '')
                    ),
                    'zone': p.zone,
                    'area': p.area.name if p.area else None,
                    'is_village_manager': bool(p.profile.get('is_village_manager', False)),
                    'character_reveal': p.character_reveal,
                    'character': p.character.name if (p.character and game_room.can_view_character(viewer_account, account)) else None,
                    'character_camp': p.character.camp if (p.character and game_room.can_view_character(viewer_account, account)) else None,
                    'self_character': p.character.name if p.character and account == viewer_account else None,
                    'self_character_camp': p.character.camp if p.character and account == viewer_account else None,
                    'self_can_use_ability': bool(p.can_use_ability) if account == viewer_account else None,
                    'self_character_ability_timing': int(getattr(p.character, 'ability_timing', 0) or 0) if p.character and account == viewer_account else None,
                    'self_character_ability_target': str(getattr(p.character, 'target', '') or '') if p.character and account == viewer_account else None,
                    'is_invulnerable': bool(getattr(p, 'immortal', False) or getattr(p, 'eqp_immortal', False)),
                    'invulnerability_sources': serialize_invulnerability_sources(p),
                    'equipment': [eq.name for eq in p.equipment_list],
                }
                for account, p in game_room.players.items()
            },
        }

    def _success(self, event: str, data: Any) -> Dict[str, Any]:
        return {
            'ok': True,
            'event': event,
            'data': data,
            'error': None,
            'meta': {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'version': '1.0.0',
            },
        }

    def _error(self, event: str, code: str, detail: str, status: int = 400, instance: str = '') -> Dict[str, Any]:
        return {
            'ok': False,
            'event': event,
            'data': None,
            'error': {
                'type': 'about:blank',
                'title': 'Request Failed',
                'status': status,
                'detail': detail,
                'instance': instance,
                'code': code,
                'errors': [],
            },
            'meta': {
                'timestamp': datetime.now(timezone.utc).isoformat(),
                'version': '1.0.0',
            },
        }

    def is_trip_registered_in_db(self, trip: str) -> bool:
        """
        確認 trip 是否已登記在資料庫的 user_trip 表中。

                語意說明：
                - trip = 長期身份識別（類似身分證）
                - account / password = 僅供該房間遊玩使用的一次性資料（生命週期跟房間）

                TODO: 資料庫尚未接入，目前此方法暫時 bypass，永遠回傳 True。
              實作時需連接資料庫並執行：
                SELECT COUNT(*) FROM user_trip WHERE trip = :trip
              並在 count > 0 時回傳 True。

        Args:
            trip: 玩家的 trip 顯示字串（已由前端輸入並雜湊產生）

        Returns:
            bool: trip 是否存在於 user_trip 資料表
        """
        return self.record_store.has_trip_registration(trip)

    def get_trip_games_count_from_db(self, trip: str) -> int:
        """
        取得 trip 的累積遊戲場數（對應 higu 的 user_entry_old 計算邏輯）。

        TODO: 資料庫尚未接入，目前暫時 bypass，回傳極大值。
              實作時可參考：
                SELECT COUNT(*)
                FROM user_entry_old
                WHERE trip = :trip AND user_no > 0 AND role != 'none';
        """
        return self.record_store.count_trip_games(trip)

    def encrypt_trip_like_higu(self, trip: str) -> str:
        """
        對齊 higu 的 Trip 轉換：substr(base64_encode(sha1($trip)),1,8)
        """
        if not trip:
            return ''
        # PHP sha1($trip) 預設回傳 40 字元十六進位字串（不是 raw bytes）
        # higu 實作為 base64_encode(sha1($trip))，再取 substr(...,1,8)
        sha1_hex = hashlib.sha1(str(trip).encode('utf-8')).hexdigest()
        encoded = base64.b64encode(sha1_hex.encode('ascii')).decode('ascii')
        return encoded[1:9]

    def is_manager_trip(self, game_room: room.room, trip: str) -> bool:
        manager_trip = str(getattr(game_room, 'manager_trip', '') or '').strip()
        if not manager_trip or not trip:
            return False

        if getattr(game_room, 'manager_trip_encrypted', True):
            return manager_trip == trip

        # 若輸入的是未加密 Trip，允許同時比對明文與 higu 加密值，方便過渡。
        return manager_trip == trip or self.encrypt_trip_like_higu(manager_trip) == trip

    def _resolve_target(self, game_room: room.room, target_ref: Optional[Dict[str, Any]]):
        if not target_ref:
            return None

        kind = target_ref.get('kind', 'none')
        target_id = target_ref.get('id')
        if kind == 'none':
            return None
        if kind == 'player':
            return game_room.players.get(target_id)
        if kind == 'area':
            for area in game_room.board.field:
                if area.name == target_id:
                    return area
        return None

    def api_dispatch(self, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if action == 'create_room':
                return self.api_create_room(payload)
            if action == 'list_rooms':
                return self._success('list_rooms', self.list_rooms())
            if action == 'join_room':
                return self.api_join_room(payload)
            if action == 'leave_room':
                return self.api_leave_room(payload)
            if action == 'login_room':
                return self.api_login_room(payload)
            if action == 'start_game':
                return self.api_start_game(payload)
            if action == 'next_step':
                return self.api_next_step(payload)
            if action == 'card_effect':
                return self.api_card_effect(payload)
            if action == 'loot_from_kill':
                return self.api_loot_from_kill(payload)
            if action == 'steal_equipment':
                return self.api_steal_equipment(payload)
            if action == 'set_green_card_choice':
                return self.api_set_green_card_choice(payload)
            if action == 'confirm_green_card':
                return self.api_confirm_green_card(payload)
            if action == 'confirm_equipment':
                return self.api_confirm_equipment(payload)
            if action == 'get_room_state':
                return self.api_get_room_state(payload)
            if action == 'change_color':
                return self.api_change_color(payload)
            if action == 'abolish_room':
                return self.api_abolish_room(payload)
            if action == 'toggle_ready':
                return self.api_toggle_ready(payload)
            if action == 'vote_kick':
                return self.api_vote_kick(payload)
            if action == 'reveal_character':
                return self.api_reveal_character(payload)
            if action == 'register_trip':
                return self.api_register_trip(payload)
            if action == 'change_trip':
                return self.api_change_trip(payload)
            if action == 'claim_trip_records':
                return self.api_claim_trip_records(payload)
            if action == 'modify_trip_records':
                return self.api_modify_trip_records(payload)
            if action == 'delete_trip_records':
                return self.api_delete_trip_records(payload)
            if action == 'submit_trip_rating':
                return self.api_submit_trip_rating(payload)
            return self._error(action, 'ACTION_NOT_SUPPORTED', 'action is not supported', 404)
        except ValueError as e:
            return self._error(action, 'BAD_REQUEST', str(e), 400)
        except Exception as e:
            return self._error(action, 'INTERNAL_ERROR', str(e), 500)

    def api_create_room(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_name = payload.get('room_name', '')
        room_comment = payload.get('room_comment', '')
        require_trip = bool(payload.get('require_trip', False))
        hide_trip = payload.get('hide_trip', True) is not False
        trip_min_games = max(0, int(payload.get('trip_min_games', 0) or 0))
        manager_trip = str(payload.get('manager_trip', '') or '').strip()
        manager_trip_encrypted = payload.get('manager_trip_encrypted', True) is not False
        if manager_trip and not manager_trip_encrypted:
            manager_trip = self.encrypt_trip_like_higu(manager_trip)
            manager_trip_encrypted = True
        is_chat_room = bool(payload.get('is_chat_room', False))
        expansion_mode = self._normalize_expansion_mode(payload.get('expansion_mode', 'all'))
        enable_initial_green_card = bool(payload.get('enable_initial_green_card', False))
        if not room_name:
            return self._error('create_room', 'ROOM_NAME_REQUIRED', 'room_name is required', 400)
        game_room = self.create_room(
            room_name,
            room_comment=str(room_comment or ''),
            require_trip=require_trip,
            hide_trip=hide_trip,
            trip_min_games=trip_min_games,
            manager_trip=manager_trip,
            manager_trip_encrypted=manager_trip_encrypted,
            is_chat_room=is_chat_room,
            expansion_mode=expansion_mode,
            enable_initial_green_card=enable_initial_green_card,
        )
        return self._success('create_room', self._serialize_room(game_room))

    def api_join_room(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        player_info = payload.get('player_info')
        if room_id is None or not isinstance(player_info, dict):
            return self._error('join_room', 'INVALID_PAYLOAD', '缺少 room_id 或 player_info', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('join_room', 'ROOM_NOT_FOUND', '房間不存在', 404)
        trip_raw = str(player_info.get('trip') or '').strip()
        trip_display = self.encrypt_trip_like_higu(trip_raw) if trip_raw else ''
        account = str(player_info.get('account') or '').strip()
        if not account:
            return self._error('join_room', 'ACCOUNT_REQUIRED', '帳號必填', 400)
        if len(game_room.players) >= max(1, int(getattr(game_room, 'max_players', 8) or 8)):
            return self._error('join_room', 'ROOM_FULL', '房間人數已滿，無法住民登記，請直接登入既有帳號', 400)
        # --- Trip 驗證：若此村子開啟了 require_trip，需確認 trip 已登記在資料庫 ---
        if game_room.require_trip:
            if not trip_display:
                return self._error('join_room', 'TRIP_REQUIRED', '此村子需要填寫 TRIP 才能加入', 400)
            if not self.is_trip_registered_in_db(trip_display):
                return self._error('join_room', 'TRIP_NOT_REGISTERED', 'TRIP 未登記，無法加入此村子', 403)
            required_games = max(0, int(getattr(game_room, 'trip_min_games', 0) or 0))
            if required_games > 0:
                trip_games = self.get_trip_games_count_from_db(trip_display)
                if trip_games < required_games:
                    return self._error(
                        'join_room',
                        'TRIP_GAME_COUNT_NOT_ENOUGH',
                        f'Trip 遊戲次數不足，至少需要 {required_games} 場',
                        403,
                    )
        if trip_display and game_room.has_trip(trip_display):
            return self._error('join_room', 'TRIP_ALREADY_EXISTS', 'TRIP 已重複，請更換', 400)
        if game_room.has_account(account):
            return self._error('join_room', 'ACCOUNT_ALREADY_EXISTS', '帳號已存在，請更換', 400)
        name = str(player_info.get('name') or '').strip()
        if name and game_room.has_name(name):
            return self._error('join_room', 'NAME_ALREADY_EXISTS', '暱稱已存在，請更換', 400)
        normalized_player_info = dict(player_info)
        normalized_player_info['trip'] = trip_display
        normalized_player_info['is_village_manager'] = self.is_manager_trip(game_room, trip_display)
        normalized_player_info['is_ready'] = False
        ret = self.join_room(room_id, normalized_player_info)
        if not ret:
            return self._error('join_room', 'JOIN_FAILED', '住民登記失敗', 400)
        joined_room = self._require_room(room_id)
        joined_account = next(
            (
                player_account
                for player_account, p in joined_room.players.items()
                if p.profile.get('account') == account
            ),
            account,
        )
        # Assign first available color to newly joined player
        taken_colors = {p.color for p_acc, p in joined_room.players.items() if p_acc != joined_account}
        available_color = next((c for c in PLAYER_COLORS if c not in taken_colors), '')
        if available_color and joined_account in joined_room.players:
            joined_room.players[joined_account].choose_color(available_color)
        return self._success('join_room', {
            **self._serialize_room_state(joined_room, viewer_account=joined_account),
            'join_account': joined_account,
        })

    def api_login_room(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = (payload.get('account') or '').strip()
        password = payload.get('password') or ''
        if room_id is None or not account or not password:
            return self._error('login_room', 'INVALID_PAYLOAD', '缺少 room_id、帳號或密碼', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('login_room', 'ROOM_NOT_FOUND', '房間不存在', 404)
        player_account = game_room.login(account, password)
        if player_account is None:
            return self._error('login_room', 'LOGIN_FAILED', '帳號密碼錯誤', 401)
        game_room.touch_activity()
        return self._success('login_room', {
            **self._serialize_room_state(game_room, viewer_account=player_account),
            'login_account': player_account,
        })

    def api_leave_room(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = payload.get('account')
        if room_id is None or not account:
            return self._error('leave_room', 'INVALID_PAYLOAD', 'room_id and account are required', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('leave_room', 'ROOM_NOT_FOUND', '房間不存在', 404)
        ret = self.leave_room(room_id, account)
        if not ret:
            return self._error('leave_room', 'LEAVE_FAILED', 'leave room failed', 400)
        game_room.reset_all_ready()
        return self._success('leave_room', {'room_id': room_id, 'account': account})

    def api_start_game(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        seed = payload.get('seed')
        if room_id is None:
            return self._error('start_game', 'ROOM_ID_REQUIRED', 'room_id is required', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('start_game', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if bool(getattr(game_room, 'is_chat_room', False)):
            return self._error('start_game', 'CHAT_ROOM_NO_GAME', '聊天村不可開始遊戲', 400)
        game_room = self.start_game(room_id, seed=seed)
        viewer_account = str(payload.get('account') or payload.get('viewer_account') or '').strip() or None
        return self._success('start_game', self._serialize_room_state(game_room, viewer_account=viewer_account))

    def api_next_step(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        action = bool(payload.get('action', False))
        action_type = payload.get('action_type')
        if room_id is None:
            return self._error('next_step', 'ROOM_ID_REQUIRED', 'room_id is required', 400)
        game_room = self._require_room(room_id)
        target = self._resolve_target(game_room, payload.get('target'))
        self.next_step(room_id, target=target, action=action, action_type=action_type)
        game_room.touch_activity()
        viewer_account = str(payload.get('account') or payload.get('viewer_account') or '').strip() or None
        return self._success('next_step', self._serialize_room_state(game_room, viewer_account=viewer_account))

    def api_card_effect(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        if room_id is None:
            return self._error('card_effect', 'ROOM_ID_REQUIRED', 'room_id is required', 400)
        game_room = self._require_room(room_id)
        target = self._resolve_target(game_room, payload.get('target'))
        choice = payload.get('choice')
        self.card_effect(room_id, target=target, choice=choice)
        game_room.touch_activity()
        viewer_account = str(payload.get('account') or payload.get('viewer_account') or '').strip() or None
        return self._success('card_effect', self._serialize_room_state(game_room, viewer_account=viewer_account))

    def api_change_color(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        color = str(payload.get('color') or '').strip()
        if room_id is None or not account or not color:
            return self._error('change_color', 'INVALID_PAYLOAD', '缺少必要參數', 400)
        if color not in PLAYER_COLORS:
            return self._error('change_color', 'INVALID_COLOR', '無效的顏色', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('change_color', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 1:
            return self._error('change_color', 'NOT_RECRUITING', '僅招募中可更換顏色', 400)
        for p_acc, p in game_room.players.items():
            if p_acc != account and p.color == color:
                return self._error('change_color', 'COLOR_TAKEN', '此顏色已被他人選用', 400)
        target_player = game_room.players.get(account)
        if not target_player:
            return self._error('change_color', 'PLAYER_NOT_FOUND', '玩家不存在', 404)
        if bool(target_player.profile.get('is_ready', False)):
            return self._error('change_color', 'PLAYER_READY', '已準備完成的玩家不可更換顏色', 400)
        target_player.choose_color(color)
        game_room.touch_activity()
        return self._success('change_color', self._serialize_room_state(game_room, viewer_account=account))

    def api_toggle_ready(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('toggle_ready', 'INVALID_PAYLOAD', 'room_id and account are required', 400)

        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('toggle_ready', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 1:
            return self._error('toggle_ready', 'NOT_RECRUITING', '僅招募中可設定準備狀態', 400)

        target_player = game_room.players.get(account)
        if not target_player:
            return self._error('toggle_ready', 'PLAYER_NOT_FOUND', '玩家不存在', 404)

        current_ready = bool(target_player.profile.get('is_ready', False))
        target_player.profile['is_ready'] = not current_ready
        game_room.touch_activity()

        player_count = len(game_room.players)
        all_ready = (not bool(getattr(game_room, 'is_chat_room', False))) and player_count >= 4 and all(bool(p.profile.get('is_ready', False)) for p in game_room.players.values())
        if all_ready:
            self.start_game(room_id)

        return self._success('toggle_ready', self._serialize_room_state(game_room, viewer_account=account))

    def api_vote_kick(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        voter_account = str(payload.get('voter_account') or '').strip()
        target_account = str(payload.get('target_account') or '').strip()
        if room_id is None or not voter_account or not target_account:
            return self._error('vote_kick', 'INVALID_PAYLOAD', 'room_id/voter_account/target_account are required', 400)
        if voter_account == target_account:
            return self._error('vote_kick', 'BAD_REQUEST', '不可對自己投票剔除', 400)

        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('vote_kick', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 1:
            return self._error('vote_kick', 'NOT_RECRUITING', '僅招募中可投票剔除', 400)

        voter = game_room.players.get(voter_account)
        target = game_room.players.get(target_account)
        if not voter or not target:
            return self._error('vote_kick', 'PLAYER_NOT_FOUND', '玩家不存在', 404)

        # 村長投票可直接剔除
        if bool(voter.profile.get('is_village_manager', False)):
            if not game_room.kick(target_account):
                return self._error('vote_kick', 'KICK_FAILED', '剔除失敗', 400)
            game_room.clear_all_kick_votes()
            game_room.reset_all_ready()
            return self._success('vote_kick', self._serialize_room_state(game_room, viewer_account=voter_account))

        vote_count = game_room.cast_kick_vote(voter_account, target_account)
        if vote_count >= 3:
            if not game_room.kick(target_account):
                return self._error('vote_kick', 'KICK_FAILED', '剔除失敗', 400)
            game_room.clear_all_kick_votes()
            game_room.reset_all_ready()

        return self._success('vote_kick', self._serialize_room_state(game_room, viewer_account=voter_account))

    def api_reveal_character(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('reveal_character', 'INVALID_PAYLOAD', 'room_id and account are required', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('reveal_character', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 2:
            return self._error('reveal_character', 'GAME_NOT_STARTED', '遊戲尚未開始', 400)
        player = game_room.players.get(account)
        if not player:
            return self._error('reveal_character', 'PLAYER_NOT_FOUND', '玩家不存在', 404)
        if player.character_reveal:
            return self._error('reveal_character', 'ALREADY_REVEALED', '角色已揭露', 400)
        if not player.character:
            return self._error('reveal_character', 'NO_CHARACTER', '玩家未被分配角色', 400)
        player.reveal_character()
        game_room.touch_activity()
        return self._success('reveal_character', self._serialize_room_state(game_room, viewer_account=account))

    def api_abolish_room(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('abolish_room', 'INVALID_PAYLOAD', 'room_id and account are required', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('abolish_room', 'ROOM_NOT_FOUND', '房間不存在', 404)
        requester = game_room.players.get(account)
        if not requester or not bool(requester.profile.get('is_village_manager', False)):
            return self._error('abolish_room', 'NOT_VILLAGE_MANAGER', '只有村長可以廢除村莊', 403)
        removed = self.remove_room(room_id)
        if not removed:
            return self._error('abolish_room', 'ABOLISH_FAILED', '廢除村莊失敗', 400)
        return self._success('abolish_room', {'room_id': room_id})

    def api_loot_from_kill(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        from_account = payload.get('from_account')
        equipment_name = payload.get('equipment_name')
        take_all = bool(payload.get('take_all', False))
        if room_id is None or not from_account:
            return self._error('loot_from_kill', 'INVALID_PAYLOAD', 'room_id and from_account are required', 400)
        game_room = self._require_room(room_id)
        from_player = game_room.players.get(from_account)
        if not from_player:
            return self._error('loot_from_kill', 'PLAYER_NOT_FOUND', 'from_player not found', 404)

        equipment = None
        if equipment_name:
            for eq in from_player.equipment_list:
                if eq.name == equipment_name:
                    equipment = eq
                    break

        ret = self.loot_from_kill(room_id, from_player, equipment=equipment, take_all=take_all)
        if not ret:
            return self._error('loot_from_kill', 'LOOT_FAILED', 'loot operation failed', 400)
        game_room.touch_activity()
        viewer_account = str(payload.get('account') or payload.get('viewer_account') or '').strip() or None
        return self._success('loot_from_kill', self._serialize_room_state(game_room, viewer_account=viewer_account))

    def api_steal_equipment(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or payload.get('viewer_account') or '').strip()
        from_account = payload.get('from_account')
        to_account = payload.get('to_account')
        equipment_name = payload.get('equipment_name')
        if room_id is None or not from_account or not to_account or not equipment_name:
            return self._error('steal_equipment', 'INVALID_PAYLOAD', 'room_id/from_account/to_account/equipment_name are required', 400)

        game_room = self._require_room(room_id)
        pending_steal = getattr(game_room, '_pending_steal', None)
        if pending_steal:
            chooser_account = str(pending_steal.get('chooser_account') or '').strip()
            if chooser_account and chooser_account != account:
                return self._error('steal_equipment', 'FORBIDDEN', 'only chooser can select equipment now', 403)

        from_player = game_room.players.get(from_account)
        to_player = game_room.players.get(to_account)
        if not from_player or not to_player:
            return self._error('steal_equipment', 'PLAYER_NOT_FOUND', 'from/to player not found', 404)

        equipment = None
        for eq in from_player.equipment_list:
            if eq.name == equipment_name:
                equipment = eq
                break
        if not equipment:
            return self._error('steal_equipment', 'EQUIPMENT_NOT_FOUND', 'equipment not found', 404)

        self.steal_equipment(room_id, from_player, to_player, equipment)
        game_room.touch_activity()
        viewer_account = str(payload.get('account') or payload.get('viewer_account') or '').strip() or None
        return self._success('steal_equipment', self._serialize_room_state(game_room, viewer_account=viewer_account))

    def api_set_green_card_choice(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        choice = str(payload.get('choice') or '').strip()
        if room_id is None or not account:
            return self._error('set_green_card_choice', 'INVALID_PAYLOAD', 'room_id and account are required', 400)
        game_room = self._require_room(room_id)
        ok = self.set_green_card_choice(room_id, account=account, choice=choice)
        if not ok:
            return self._error('set_green_card_choice', 'INVALID_STATE', 'green card choice cannot be set', 400)
        game_room.touch_activity()
        return self._success('set_green_card_choice', self._serialize_room_state(game_room, viewer_account=account))

    def api_confirm_green_card(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('confirm_green_card', 'INVALID_PAYLOAD', 'room_id and account are required', 400)
        game_room = self._require_room(room_id)
        ok = self.confirm_green_card(room_id, account=account)
        if not ok:
            return self._error('confirm_green_card', 'INVALID_STATE', 'green card cannot be confirmed now', 400)
        game_room.touch_activity()
        return self._success('confirm_green_card', self._serialize_room_state(game_room, viewer_account=account))

    def api_confirm_equipment(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('confirm_equipment', 'INVALID_PAYLOAD', 'room_id and account are required', 400)
        game_room = self._require_room(room_id)
        ok = game_room.confirm_equipment()
        if not ok:
            return self._error('confirm_equipment', 'INVALID_STATE', 'equipment cannot be confirmed now', 400)
        game_room.touch_activity()
        return self._success('confirm_equipment', self._serialize_room_state(game_room, viewer_account=account))

    def api_get_room_state(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        if room_id is None:
            return self._error('get_room_state', 'ROOM_ID_REQUIRED', 'room_id is required', 400)
        game_room = self._require_room(room_id)
        game_room.touch_activity()
        viewer_account = str(payload.get('account') or payload.get('viewer_account') or '').strip() or None
        return self._success('get_room_state', self._serialize_room_state(game_room, viewer_account=viewer_account))

    def api_register_trip(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        trip = str(payload.get('trip') or '').strip()
        password = str(payload.get('password') or '')
        if not trip or not password:
            return self._error('register_trip', 'INVALID_PAYLOAD', 'trip and password are required', 400)
        return self._success('register_trip', self.records_api.api_register_trip(trip, password))

    def api_change_trip(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        old_trip = str(payload.get('old_trip') or '').strip()
        old_password = str(payload.get('old_password') or '')
        new_trip = str(payload.get('new_trip') or '').strip()
        new_password = str(payload.get('new_password') or '')
        if not old_trip or not old_password or not new_trip or not new_password:
            return self._error('change_trip', 'INVALID_PAYLOAD', 'old/new trip and password are required', 400)
        return self._success('change_trip', self.records_api.api_change_trip(old_trip, old_password, new_trip, new_password))

    def api_claim_trip_records(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        target_trip = str(payload.get('target_trip') or '').strip()
        target_password = str(payload.get('target_password') or '')
        account = str(payload.get('account') or '').strip()
        account_password = str(payload.get('account_password') or '')
        room_id = payload.get('room_id')
        if room_id in ('', None):
            room_id = None
        if not target_trip or not target_password or not account or not account_password:
            return self._error('claim_trip_records', 'INVALID_PAYLOAD', 'target_trip/target_password/account/account_password are required', 400)
        return self._success(
            'claim_trip_records',
            self.records_api.api_claim_trip_records(target_trip, target_password, account, account_password, room_id=room_id),
        )

    def api_modify_trip_records(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        target_trip = str(payload.get('target_trip') or '').strip()
        target_password = str(payload.get('target_password') or '')
        account = str(payload.get('account') or '').strip()
        account_password = str(payload.get('account_password') or '')
        room_id = payload.get('room_id')
        if room_id in ('', None):
            room_id = None
        if not target_trip or not target_password or not account or not account_password:
            return self._error('modify_trip_records', 'INVALID_PAYLOAD', 'target_trip/target_password/account/account_password are required', 400)
        return self._success(
            'modify_trip_records',
            self.records_api.api_modify_trip_records(target_trip, target_password, account, account_password, room_id=room_id),
        )

    def api_delete_trip_records(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        target_trip = str(payload.get('target_trip') or '').strip()
        target_password = str(payload.get('target_password') or '')
        nickname = str(payload.get('nickname') or '').strip()
        room_id = payload.get('room_id')
        if room_id in ('', None):
            room_id = None
        if not target_trip or not target_password or not nickname:
            return self._error('delete_trip_records', 'INVALID_PAYLOAD', 'target_trip/target_password/nickname are required', 400)
        return self._success(
            'delete_trip_records',
            self.records_api.api_delete_trip_records(target_trip, target_password, nickname, room_id=room_id),
        )

    def api_submit_trip_rating(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        target_account = str(payload.get('target_account') or '').strip()
        comment = str(payload.get('comment') or '')
        rating = payload.get('rating')
        if room_id is None or not account or not target_account:
            return self._error('submit_trip_rating', 'INVALID_PAYLOAD', 'room_id/account/target_account are required', 400)
        try:
            result = self.records_api.api_submit_trip_rating(int(room_id), account, target_account, int(rating or 0), comment)
        except ValueError as exc:
            return self._error('submit_trip_rating', 'BAD_REQUEST', str(exc), 400)
        return self._success('submit_trip_rating', result)
