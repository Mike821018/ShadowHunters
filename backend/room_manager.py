import random
import base64
import secrets
import hashlib
import json
import os
import pickle
import threading
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from backend.avatar_store import AvatarStore
from backend.game import character_module
import info as game_info
from backend.game import room
from backend.game_records_api import GameRecordsAPI
from backend.records_system import GameRecordStore


# 2026-10-03：原本用 White/Black/Red/.../Grey 這種顏色名稱當代號，
# 但白色、灰色實際顯示的色碼已經改成玫紅色／靛藍色，名稱跟實際顏色對不上，
# 以後如果還要再調其他顏色也會有一樣的問題；改成跟顏色本身無關的通用代號
# Color1~Color9，之後不管怎麼調色碼都不會再有名稱跟顏色對不上的疑慮。
# 這是 Mike 確認過的破壞性改動：2026-10-03 以前的對戰紀錄裡玩家顏色欄位存的是
# 舊名稱字串（White/Black/...），改名後這些舊紀錄的顏色會查不到對應色碼、
# 顯示不出玩家顏色（不影響紀錄其他內容），Mike 已確認可以接受這個影響。
PLAYER_COLORS = [
    'Color1', 'Color2', 'Color3', 'Color4', 'Color5', 'Color6', 'Color7', 'Color8', 'Color9'
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
                        'get_room_state', 'change_color', 'abolish_room', 'toggle_ready', 'vote_kick', 'roll_call',
                        'extend_turn_timeout',
                        'activate_standby_ability',
                        'send_chat',
                        'register_trip', 'change_trip', 'claim_trip_records', 'modify_trip_records', 'delete_trip_records',
                        'submit_trip_rating',
                        'upload_avatar'
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
                'kind': {'type': 'string', 'enum': ['player', 'area', 'discard', 'none']},
                'id': {'type': ['string', 'null']},
            },
            'required': ['kind'],
        },
    },
}


class RoomManager:
    def __init__(self, root_dir: Optional[Path] = None, room_snapshot_path: Optional[Path] = None):
        self.rooms: Dict[int, room.room] = {}
        self.root_dir = Path(root_dir) if root_dir else Path(__file__).resolve().parent.parent
        self.record_store = GameRecordStore(db_path=os.getenv('SHADOWHUNTERS_DB_PATH') or None)
        self.records_api = GameRecordsAPI(self.record_store)
        self.avatar_store = AvatarStore(self.root_dir)
        self._room_event_lock = threading.RLock()
        self._room_event_logs: Dict[int, List[Dict[str, Any]]] = {}
        self._room_event_conds: Dict[int, threading.Condition] = {}
        self._room_event_seq: Dict[int, int] = {}
        self._room_event_log_limit = 300
        default_snapshot_path = self.root_dir / 'backend' / 'data' / self._ROOM_SNAPSHOT_FILENAME
        snapshot_value = room_snapshot_path or (os.getenv('SHADOWHUNTERS_ROOM_SNAPSHOT_PATH') or default_snapshot_path)
        self.room_snapshot_path = Path(snapshot_value)
        self._snapshot_lock = threading.RLock()
        self._restore_persisted_rooms()

    _ROOM_STATE_EVENT_ACTIONS = {
        'join_room',
        'leave_room',
        'start_game',
        'gm_release_game_start',
        'next_step',
        'card_effect',
        'loot_from_kill',
        'steal_equipment',
        'set_green_card_choice',
        'confirm_green_card',
        'confirm_equipment',
        'change_color',
        'toggle_ready',
        'vote_kick',
        'roll_call',
        'extend_turn_timeout',
        'update_room_settings',
        'reveal_character',
        'activate_standby_ability',
        'send_chat',
    }

    _CARD_SET_BASIC = 'B'
    _CARD_SET_EXTEND = 'E'
    _ROOM_SNAPSHOT_FILENAME = 'live_room_snapshots.json'
    _ROOM_SNAPSHOT_VERSION = 1
    _ROOM_SNAPSHOT_ACTIONS = (_ROOM_STATE_EVENT_ACTIONS | {'create_room', 'abolish_room'}) - {'get_room_state'}

    def _should_persist_room(self, game_room: Any) -> bool:
        if not game_room or bool(getattr(game_room, 'stop', False)):
            return False
        room_status = int(getattr(game_room, 'room_status', 0) or 0)
        if room_status not in (1, 2):
            return False
        if hasattr(game_room, 'should_auto_abolish') and game_room.should_auto_abolish():
            return False
        return True

    def _rehydrate_room_after_restore(self, game_room: room.room):
        setattr(game_room, 'manager_ref', self)
        game_room.stop = False
        game_room.idle_timeout_seconds = 60 * 60
        if not hasattr(game_room, 'last_activity_at'):
            game_room.last_activity_at = float(getattr(game_room, 'last_message_at', 0) or 0) or datetime.now(timezone.utc).timestamp()
        if not hasattr(game_room, 'last_message_at'):
            game_room.last_message_at = float(getattr(game_room, 'last_activity_at', 0) or 0) or datetime.now(timezone.utc).timestamp()
        if not isinstance(getattr(game_room, 'chat_messages', None), list):
            game_room.chat_messages = []
        max_chat_id = max(
            (
                int((message or {}).get('id', 0) or 0)
                for message in game_room.chat_messages
                if isinstance(message, dict)
            ),
            default=0,
        )
        game_room._chat_seq = max(int(getattr(game_room, '_chat_seq', 0) or 0), max_chat_id)
        if not isinstance(getattr(game_room, 'latest_boom_notice', None), dict):
            game_room.latest_boom_notice = {}
        if not isinstance(getattr(game_room, 'latest_roll_call_notice', None), dict):
            game_room.latest_roll_call_notice = {}
        if not isinstance(getattr(game_room, 'kick_votes', None), dict):
            game_room.kick_votes = {}
        if not isinstance(getattr(game_room, 'private_character_visibility', None), dict):
            game_room.private_character_visibility = {}
        if not isinstance(getattr(game_room, '_start_passive_applied', None), dict):
            game_room._start_passive_applied = {}

        board_obj = getattr(game_room, 'board', None)
        if board_obj is not None:
            setattr(board_obj, 'room', game_room)
        for restored_player in (getattr(game_room, 'players', {}) or {}).values():
            try:
                restored_player.room = game_room
            except Exception:
                pass

    def _persist_room_snapshots(self):
        snapshot_path = getattr(self, 'room_snapshot_path', None)
        if not snapshot_path:
            return
        with self._snapshot_lock:
            room_entries = []
            for room_id, game_room in sorted(self.rooms.items(), key=lambda item: int(item[0])):
                if not self._should_persist_room(game_room):
                    continue
                try:
                    snapshot_bytes = pickle.dumps(game_room, protocol=pickle.HIGHEST_PROTOCOL)
                except Exception:
                    continue
                room_entries.append({
                    'room_id': int(room_id),
                    'room_status': int(getattr(game_room, 'room_status', 0) or 0),
                    'last_message_at': float(
                        getattr(game_room, 'last_message_at', 0)
                        or getattr(game_room, 'last_activity_at', 0)
                        or 0
                    ),
                    'snapshot_b64': base64.b64encode(snapshot_bytes).decode('ascii'),
                })

            snapshot_path.parent.mkdir(parents=True, exist_ok=True)
            if not room_entries:
                try:
                    if snapshot_path.exists():
                        snapshot_path.unlink()
                except OSError:
                    pass
                return

            payload = {
                'version': self._ROOM_SNAPSHOT_VERSION,
                'saved_at': datetime.now(timezone.utc).isoformat(),
                'rooms': room_entries,
            }
            temp_path = snapshot_path.with_suffix(snapshot_path.suffix + '.tmp')
            temp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
            temp_path.replace(snapshot_path)

    def _restore_persisted_rooms(self):
        snapshot_path = getattr(self, 'room_snapshot_path', None)
        if not snapshot_path or not snapshot_path.exists():
            return
        try:
            payload = json.loads(snapshot_path.read_text(encoding='utf-8'))
        except Exception:
            return
        version = int(payload.get('version', 0) or 0)
        if version not in (0, self._ROOM_SNAPSHOT_VERSION):
            return

        for entry in payload.get('rooms', []) or []:
            if not isinstance(entry, dict):
                continue
            snapshot_b64 = str(entry.get('snapshot_b64') or '').strip()
            if not snapshot_b64:
                continue
            try:
                game_room = pickle.loads(base64.b64decode(snapshot_b64.encode('ascii')))
            except Exception:
                continue
            if not isinstance(game_room, room.room):
                continue
            self._rehydrate_room_after_restore(game_room)
            if not self._should_persist_room(game_room):
                game_room.stop = True
                continue
            self.rooms[int(game_room.room_id)] = game_room
            try:
                if not game_room.is_alive():
                    game_room.start()
            except RuntimeError:
                pass

        self._persist_room_snapshots()

    def on_room_runtime_state_changed(self, room_id: int):
        self._emit_room_state_event(room_id)
        self._persist_room_snapshots()

    _ROOM_NAME_MAX_DISPLAY_WIDTH = 40
    _ROOM_COMMENT_MAX_DISPLAY_WIDTH = 100
    _MANAGER_TRIP_MIN_GAMES = 5  # 擔任村長所需的 Trip 最低累積場次
    _GM_TRIP_MIN_GAMES = 20  # 擔任 GM 所需的 Trip 最低累積場次（高於村長）
    _NICKNAME_MAX_DISPLAY_WIDTH = 20
    _CHAT_MESSAGE_MAX_DISPLAY_WIDTH = 200
    _BUG_REPORT_CATEGORIES = {'bug', 'suggestion', 'other'}  # 問題回報分類：Bug／建議／其他
    _BUG_REPORT_NICKNAME_MAX_DISPLAY_WIDTH = 20
    _BUG_REPORT_DESCRIPTION_MAX_DISPLAY_WIDTH = 500
    # 2026-10-13：問題回報後台頁面的密碼存在這個檔案裡（不進 git），第一次用到時如果
    # 檔案不存在會自動產生一個隨機密碼寫進去；Mike 可以直接打開這個檔案看目前密碼，
    # 或是把內容改成自己想要的密碼，不需要重啟伺服器（每次驗證都會重新讀檔案）。
    _BUG_REPORT_ADMIN_TOKEN_PATH = os.path.join(os.path.dirname(__file__), 'data', 'bug_report_admin_token.txt')

    def get_api_schemas(self) -> Dict[str, Any]:
        return API_SCHEMAS

    @staticmethod
    def _normalize_room_name_for_limit(raw_name: Any) -> str:
        value = str(raw_name or '').strip()
        while value.endswith('村'):
            value = value[:-1].rstrip()
        return value

    @staticmethod
    def _count_display_width(text: Any) -> int:
        width = 0
        for char in str(text or ''):
            if unicodedata.combining(char):
                continue
            width += 2 if unicodedata.east_asian_width(char) in {'F', 'W'} else 1
        return width

    def create_room(
        self,
        room_name: str,
        room_comment: str = '',
        require_trip: bool = False,
        hide_trip: bool = True,
        trip_min_games: int = 0,
        manager_trip: str = '',
        manager_trip_encrypted: bool = True,
        gm_enabled: bool = False,
        is_chat_room: bool = False,
        expansion_mode: str = 'all',
        enable_initial_green_card: bool = False,
        enable_neutral_chaos_mode: bool = False,
        enable_badge_unique_character_select: bool = False,
        enable_random_initial_position: bool = False,
        turn_timeout_minutes: int = 3,
        max_players: Optional[int] = None,
    ) -> room.room:
        game_room = room.room()
        game_room.room_id = int(self.record_store.allocate_room_id())
        game_room.room_name = room_name
        setattr(game_room, 'room_comment', room_comment)
        game_room.require_trip = require_trip
        game_room.hide_trip = hide_trip is not False
        game_room.trip_min_games = max(0, int(trip_min_games or 0))
        game_room.manager_trip = str(manager_trip or '').strip()
        game_room.manager_trip_encrypted = manager_trip_encrypted is not False
        game_room.gm_enabled = bool(gm_enabled)
        game_room.is_chat_room = bool(is_chat_room)
        game_room.expansion_mode = self._normalize_expansion_mode(expansion_mode)
        game_room.enable_initial_green_card = bool(enable_initial_green_card)
        game_room.enable_neutral_chaos_mode = bool(enable_neutral_chaos_mode)
        # 2026-10-19 修正：中立大亂鬥（全中立角色，只從中立角色池抽）跟徽章唯一
        # （合併卡組時避免同徽章字母角色同場）設計上互斥——Mike 認為中立大亂鬥
        # 不該套用徽章唯一這個選項，兩者同時開啟時徽章唯一直接失效（強制關閉），
        # 不是讓本來就比較窄的中立角色池被徽章限制縮得更小。
        game_room.enable_badge_unique_character_select = bool(enable_badge_unique_character_select) and not game_room.enable_neutral_chaos_mode
        # 2026-10-15：遊戲開始時先把所有玩家骰到隨機場地上（不觸發場地效果），
        # 純粹決定初始站位；預設不啟用。
        game_room.enable_random_initial_position = bool(enable_random_initial_position)
        valid_timeout_minutes = [2, 3, 5, 10, 20, 30]
        chosen = int(turn_timeout_minutes or 3)
        if chosen not in valid_timeout_minutes:
            chosen = min(valid_timeout_minutes, key=lambda v: abs(v - chosen))
        game_room.turn_timeout_seconds = chosen * 60
        if game_room.is_chat_room:
            game_room.max_players = 50
        else:
            # 2026-10-15：建房當下就能選人數上限（4~8 人），不用等建完村再進去改設定；
            # 沒填或格式不對的話沿用原本預設的 8 人。
            try:
                chosen_max_players = int(max_players) if max_players is not None else 8
            except (TypeError, ValueError):
                chosen_max_players = 8
            game_room.max_players = min(8, max(4, chosen_max_players))
        setattr(game_room, 'manager_ref', self)
        game_room.room_status = 1
        game_room.create()
        self.rooms[game_room.room_id] = game_room
        return game_room

    def list_rooms(self) -> List[Dict[str, Any]]:
        return [self._serialize_room(game_room) for game_room in self.rooms.values()]

    def get_room(self, room_id: int) -> Optional[room.room]:
        return self.rooms.get(room_id)

    def remove_room(self, room_id: int, *, emit_event: bool = False) -> bool:
        game_room = self.rooms.pop(room_id, None)
        if not game_room:
            return False
        game_room.stop = True
        if emit_event:
            self._emit_room_closed_event(room_id)
        self._persist_room_snapshots()
        return True

    def join_room(self, room_id: int, player_info: Dict[str, Any]) -> bool:
        game_room = self.get_room(room_id)
        if not game_room:
            return False
        ret = game_room.join(player_info)
        if ret:
            joined_name = str(player_info.get('name') or player_info.get('account') or '').strip() or '匿名玩家'
            game_room.add_system_message(f"[{joined_name}] 進入了村莊")
        return ret

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
        leaving_player = game_room.players.get(account)
        profile = getattr(leaving_player, 'profile', {}) or {}
        leaving_name = str(
            getattr(leaving_player, 'name', '')
            or profile.get('name', '')
            or '未知'
        ).strip() or '未知'
        ret = game_room.kick(account)
        if ret:
            game_room.add_system_message(f"[{leaving_name}] 離開了村莊")
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

        # GM 旁觀主持、不下場，不計入 4~8 人的開局人數限制。
        player_count = len(self._non_gm_players(game_room))
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
        result = self.records_api.on_game_end(game_room)
        self._persist_room_snapshots()
        return result

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

    def _non_gm_players(self, game_room: room.room) -> Dict[str, Any]:
        """回傳排除 GM（旁觀主持，不下場）之後的「場上玩家」字典，維持原本插入順序。"""
        return {
            account: p for account, p in game_room.players.items()
            if not bool(p.profile.get('is_gm', False))
        }

    def _assign_colors(self, game_room: room.room):
        # GM 不下場，不分配遊戲用色（聊天室/系統訊息改用保留的 GM_COLOR_HEX，不佔用這 9 色）。
        playing_players = self._non_gm_players(game_room)
        used = set()
        for p in playing_players.values():
            if p.color in PLAYER_COLORS and p.color not in used:
                used.add(p.color)

        remaining = [c for c in PLAYER_COLORS if c not in used]
        random.shuffle(remaining)
        remain_idx = 0

        for p in playing_players.values():
            if p.color in PLAYER_COLORS and p.color in used:
                # keep preselected unique color
                used.discard(p.color)
                continue
            if remain_idx < len(remaining):
                p.choose_color(remaining[remain_idx])
                remain_idx += 1

    def _assign_characters(self, game_room: room.room):
        # GM 不下場，不佔用角色分配池、不計入 4~8 人的陣營人數配置。
        playing_players = self._non_gm_players(game_room)
        player_count = len(playing_players)
        camp_config = dict(character_module.camp_setting[player_count])
        expansion_mode = self._normalize_expansion_mode(getattr(game_room, 'expansion_mode', 'all'))
        forced_role_raw = getattr(game_room, 'debug_forced_characters', {}) or {}
        forced_role_classes = self._validate_forced_character_config(
            game_room=game_room,
            forced_roles=forced_role_raw,
            expansion_mode=expansion_mode,
        )

        forced_by_camp = {'Shadow': 0, 'Hunter': 0, 'Civilian': 0}
        forced_class_set = set(forced_role_classes.values())
        for character_cls in forced_role_classes.values():
            camp_name = self._character_camp(character_cls)
            if camp_name in forced_by_camp:
                forced_by_camp[camp_name] += 1

        badge_unique = bool(getattr(game_room, 'enable_badge_unique_character_select', False))
        used_badges = set()
        if badge_unique:
            for character_cls in forced_role_classes.values():
                used_badges.add(self._character_badge_letter(character_cls))

        character_pool = []
        neutral_chaos_enabled = bool(getattr(game_room, 'enable_neutral_chaos_mode', False))
        neutral_chaos_available = False
        if neutral_chaos_enabled:
            forced_total = len(forced_role_classes)
            neutral_need = max(0, int(player_count) - int(forced_total))
            civilian_pool = [cls for cls in self._resolve_camp_classes(character_module.civilian_camp, expansion_mode) if cls not in forced_class_set]
            has_non_neutral_forced = int(forced_by_camp['Shadow']) > 0 or int(forced_by_camp['Hunter']) > 0
            neutral_chaos_available = (not has_non_neutral_forced) and len(civilian_pool) >= neutral_need

            if neutral_chaos_available:
                character_pool.extend(self._pick_character_instances(civilian_pool, neutral_need, used_badges=used_badges, badge_unique=badge_unique))
            else:
                game_room.enable_neutral_chaos_mode = False
                game_room.add_system_message('中立大亂鬥因中立角色數量不足或指定角色不符，已自動回復原本陣營設定')

        if not neutral_chaos_enabled or not neutral_chaos_available:
            shadow_need = max(0, int(camp_config['Shadow']) - int(forced_by_camp['Shadow']))
            hunter_need = max(0, int(camp_config['Hunter']) - int(forced_by_camp['Hunter']))
            civilian_need = max(0, int(camp_config['Civilian']) - int(forced_by_camp['Civilian']))

            shadow_pool = [cls for cls in self._resolve_camp_classes(character_module.shadow_camp, expansion_mode) if cls not in forced_class_set]
            hunter_pool = [cls for cls in self._resolve_camp_classes(character_module.hunter_camp, expansion_mode) if cls not in forced_class_set]
            civilian_pool = [cls for cls in self._resolve_camp_classes(character_module.civilian_camp, expansion_mode) if cls not in forced_class_set]

            character_pool.extend(self._pick_character_instances(shadow_pool, shadow_need, used_badges=used_badges, badge_unique=badge_unique))
            character_pool.extend(self._pick_character_instances(hunter_pool, hunter_need, used_badges=used_badges, badge_unique=badge_unique))
            character_pool.extend(self._pick_character_instances(civilian_pool, civilian_need, used_badges=used_badges, badge_unique=badge_unique))
        random.shuffle(character_pool)

        character_iter = iter(character_pool)
        for account, p in playing_players.items():
            forced_cls = forced_role_classes.get(str(account or '').strip())
            if forced_cls is not None:
                p.assign_character(forced_cls())
                continue
            next_character = next(character_iter, None)
            if next_character is None:
                raise ValueError('insufficient character pool for assignment')
            p.assign_character(next_character)

    def _character_name(self, character_cls: Any) -> str:
        try:
            return str(character_cls().name or '').strip()
        except Exception:
            return ''

    def _character_camp(self, character_cls: Any) -> str:
        try:
            return str(character_cls().camp or '').strip()
        except Exception:
            return ''

    def _character_badge_letter(self, character_cls: Any) -> str:
        # 徽章字母＝角色英文名稱（self.name）首字，與前端各處「同徽章角色」判斷一致。
        name = self._character_name(character_cls)
        return name[:1].upper() if name else ''

    def _build_character_alias_index(self, expansion_mode: str) -> Dict[str, Any]:
        available = []
        available.extend(self._resolve_camp_classes(character_module.shadow_camp, expansion_mode))
        available.extend(self._resolve_camp_classes(character_module.hunter_camp, expansion_mode))
        available.extend(self._resolve_camp_classes(character_module.civilian_camp, expansion_mode))

        alias_index: Dict[str, Any] = {}
        for character_cls in available:
            name = self._character_name(character_cls)
            cls_name = str(getattr(character_cls, '__name__', '') or '').strip()
            candidates = {
                name,
                name.lower(),
                name.replace(' ', '').replace('-', '').lower(),
                cls_name,
                cls_name.lower(),
            }
            for alias in candidates:
                key = str(alias or '').strip()
                if key and key not in alias_index:
                    alias_index[key] = character_cls
        return alias_index

    def _normalize_forced_role_payload(self, game_room: room.room, raw: Any) -> Dict[str, str]:
        if raw is None:
            return {}
        if not isinstance(raw, dict):
            raise ValueError('debug_forced_characters must be an object map')

        normalized: Dict[str, str] = {}
        for account_raw, role_raw in raw.items():
            account = str(account_raw or '').strip()
            role_name = str(role_raw or '').strip()
            if not account:
                raise ValueError('forced role account is empty')
            if account not in game_room.players:
                raise ValueError(f'unknown forced-role account: {account}')
            if not role_name:
                raise ValueError(f'forced role is empty for account: {account}')
            normalized[account] = role_name
        return normalized

    def _validate_forced_character_config(self, game_room: room.room, forced_roles: Dict[str, str], expansion_mode: str) -> Dict[str, Any]:
        if not forced_roles:
            return {}

        # GM 不下場，不計入 4~8 人的陣營人數配置查表。
        player_count = len(self._non_gm_players(game_room))
        camp_config = character_module.camp_setting[player_count]
        alias_index = self._build_character_alias_index(expansion_mode)

        forced_classes: Dict[str, Any] = {}
        used_classes = set()
        camp_counts = {'Shadow': 0, 'Hunter': 0, 'Civilian': 0}

        for account, requested_role in forced_roles.items():
            role_key = str(requested_role or '').strip()
            lookup_keys = [
                role_key,
                role_key.lower(),
                role_key.replace(' ', '').replace('-', '').lower(),
            ]
            matched_cls = None
            for key in lookup_keys:
                matched_cls = alias_index.get(key)
                if matched_cls is not None:
                    break
            if matched_cls is None:
                raise ValueError(f'unknown character in forced config: {requested_role}')
            if matched_cls in used_classes:
                role_name = self._character_name(matched_cls) or str(requested_role)
                raise ValueError(f'duplicate forced character is not allowed: {role_name}')

            camp_name = self._character_camp(matched_cls)
            if camp_name not in camp_counts:
                raise ValueError(f'unsupported camp in forced config: {camp_name}')
            camp_counts[camp_name] += 1
            if camp_counts[camp_name] > int(camp_config[camp_name]):
                raise ValueError(f'forced config exceeds {camp_name} quota for {player_count} players')

            used_classes.add(matched_cls)
            forced_classes[account] = matched_cls

        return forced_classes

    def _pick_character_instances(self, classes, count: int, used_badges: Optional[set] = None, badge_unique: bool = False):
        if count <= 0:
            return []
        if len(classes) < count:
            raise ValueError('insufficient character pool for selected expansion mode')

        if not (badge_unique and used_badges is not None):
            picked = random.sample(list(classes), count)
            return [character_cls() for character_cls in picked]

        # 徽章唯一：合併多組卡組時，同一徽章字母（角色英文名首字，如 Agnes/Allie
        # 皆為 A）常常分散在不同卡組中成對出現。逐一挑選時跳過「字母已被用掉」的角色
        # （含本次陣營內已選到的），避免同一場遊戲出現兩位同徽章角色。
        # 若候選用盡仍湊不滿本陣營所需人數，才退回允許重複徽章（盡力而為，不中斷開局）。
        pool = list(classes)
        random.shuffle(pool)
        picked: List[Any] = []
        leftover: List[Any] = []
        local_used = set(used_badges)
        for character_cls in pool:
            badge = self._character_badge_letter(character_cls)
            if badge and badge in local_used:
                leftover.append(character_cls)
                continue
            picked.append(character_cls)
            if badge:
                local_used.add(badge)
            if len(picked) >= count:
                break

        if len(picked) < count:
            random.shuffle(leftover)
            picked.extend(leftover[: count - len(picked)])

        for character_cls in picked:
            badge = self._character_badge_letter(character_cls)
            if badge:
                used_badges.add(badge)

        return [character_cls() for character_cls in picked]

    def _normalize_expansion_mode(self, mode: Any) -> str:
        normalized = str(mode or 'all').strip().lower()
        if normalized in ('replace', 'swap'):
            return 'all'
        if normalized in ('expansion_only', 'extend_only', 'extend', 'expansion'):
            return 'expansion_only'
        if normalized in ('no_extend', 'noextend', 'basic', 'base', 'none'):
            return 'no_extend'
        return 'all'

    def _expansion_mode_to_card_flags(self, mode: Any) -> Dict[str, bool]:
        normalized = self._normalize_expansion_mode(mode)
        if normalized == 'no_extend':
            return {'use_basic': True, 'use_extend': False}
        if normalized == 'expansion_only':
            return {'use_basic': False, 'use_extend': True}
        return {'use_basic': True, 'use_extend': True}

    def _card_flags_to_expansion_mode(self, use_basic: bool, use_extend: bool) -> str:
        if use_basic and use_extend:
            return 'all'
        if use_basic:
            return 'no_extend'
        if use_extend:
            return 'expansion_only'
        # Keep backend defensive: if both disabled, fallback to all.
        return 'all'

    def _format_card_set_summary(self, mode: Any) -> str:
        flags = self._expansion_mode_to_card_flags(mode)
        parts: List[str] = []
        if flags['use_basic']:
            parts.append(self._CARD_SET_BASIC)
        if flags['use_extend']:
            parts.append(self._CARD_SET_EXTEND)
        return f"Card:{'+'.join(parts)}" if parts else 'Card:-'

    def _format_room_settings_summary(self, game_room: room.room) -> str:
        expansion_mode = self._normalize_expansion_mode(getattr(game_room, 'expansion_mode', 'all'))
        enable_initial_green_card = bool(getattr(game_room, 'enable_initial_green_card', False))
        enable_neutral_chaos_mode = bool(getattr(game_room, 'enable_neutral_chaos_mode', False))
        enable_badge_unique_character_select = bool(getattr(game_room, 'enable_badge_unique_character_select', False))
        enable_random_initial_position = bool(getattr(game_room, 'enable_random_initial_position', False))
        timeout_minutes = int(getattr(game_room, 'turn_timeout_seconds', 180) or 180) // 60
        max_players = int(getattr(game_room, 'max_players', 8) or 8)
        return (
            f"{self._format_card_set_summary(expansion_mode)}"
            f" / 初始綠卡={'On' if enable_initial_green_card else 'Off'}"
            f" / 中立大亂鬥={'On' if enable_neutral_chaos_mode else 'Off'}"
            f" / 徽章唯一={'On' if enable_badge_unique_character_select else 'Off'}"
            f" / 隨機初始位置={'On' if enable_random_initial_position else 'Off'}"
            f" / 暴斃時間={timeout_minutes}分"
            f" / 人數上限={max_players}人"
        )

    def _format_start_camp_summary(self, game_room: room.room) -> str:
        # 2026-10-09：邏輯搬到 game/room.py 的 room._format_start_camp_summary()
        # （開局訊息現在統一在 game_start() 裡面發送，需要在那裡就算出這份摘要），
        # 這裡保留這個方法只是避免有其他地方還在呼叫，直接轉呼叫過去、不重複維護。
        return game_room._format_start_camp_summary()

    def _coerce_optional_bool(self, value: Any) -> Optional[bool]:
        if value is None:
            return None
        if isinstance(value, bool):
            return value
        normalized = str(value).strip().lower()
        if normalized in ('1', 'true', 'yes', 'y', 'on'):
            return True
        if normalized in ('0', 'false', 'no', 'n', 'off'):
            return False
        return None

    def _resolve_expansion_mode_from_payload(self, payload: Dict[str, Any], default_mode: Any = 'all') -> str:
        # Keep compatibility with existing expansion_mode, while supporting
        # future card-set style payloads from frontend.
        fallback_mode = self._normalize_expansion_mode(default_mode)
        base_flags = self._expansion_mode_to_card_flags(fallback_mode)

        use_basic = None
        for key in ('use_basic_card_set', 'card_set_basic', 'use_basic'):
            use_basic = self._coerce_optional_bool(payload.get(key))
            if use_basic is not None:
                break

        use_extend = None
        for key in ('use_extend_card_set', 'card_set_extend', 'use_extend'):
            use_extend = self._coerce_optional_bool(payload.get(key))
            if use_extend is not None:
                break

        if use_basic is None and use_extend is None:
            return self._normalize_expansion_mode(payload.get('expansion_mode', fallback_mode))

        final_use_basic = base_flags['use_basic'] if use_basic is None else use_basic
        final_use_extend = base_flags['use_extend'] if use_extend is None else use_extend
        return self._card_flags_to_expansion_mode(final_use_basic, final_use_extend)

    def _character_card_set_code(self, character_cls: Any) -> str:
        try:
            char = character_cls()
        except Exception:
            return self._CARD_SET_BASIC

        raw = getattr(char, 'card_set', None) or getattr(char, 'set_code', None)
        code = str(raw or '').strip().upper()
        if code in (self._CARD_SET_BASIC, self._CARD_SET_EXTEND):
            return code
        return self._CARD_SET_EXTEND if bool(getattr(char, 'is_extend', False)) else self._CARD_SET_BASIC

    def _resolve_camp_classes(self, classes, expansion_mode: str):
        flags = self._expansion_mode_to_card_flags(expansion_mode)
        selected_sets = set()
        if flags['use_basic']:
            selected_sets.add(self._CARD_SET_BASIC)
        if flags['use_extend']:
            selected_sets.add(self._CARD_SET_EXTEND)
        if not selected_sets:
            selected_sets = {self._CARD_SET_BASIC, self._CARD_SET_EXTEND}

        filtered = [cls for cls in classes if self._character_card_set_code(cls) in selected_sets]
        return filtered if filtered else list(classes)

    def check_forced_character_config(self, room_id: int, forced_roles: Dict[str, str]) -> Dict[str, str]:
        game_room = self._require_room(room_id)
        expansion_mode = self._normalize_expansion_mode(getattr(game_room, 'expansion_mode', 'all'))
        normalized = self._normalize_forced_role_payload(game_room, forced_roles)
        resolved = self._validate_forced_character_config(game_room, normalized, expansion_mode)
        return {
            account: (self._character_name(character_cls) or str(normalized.get(account) or ''))
            for account, character_cls in resolved.items()
        }

    def _serialize_room(self, game_room: room.room) -> Dict[str, Any]:
        return {
            'room_id': game_room.room_id,
            'room_name': game_room.room_name,
            'room_comment': getattr(game_room, 'room_comment', ''),
            'room_status': game_room.room_status,
            'is_chat_room': bool(getattr(game_room, 'is_chat_room', False)),
            'expansion_mode': self._normalize_expansion_mode(getattr(game_room, 'expansion_mode', 'all')),
            'enable_initial_green_card': bool(getattr(game_room, 'enable_initial_green_card', False)),
            'enable_neutral_chaos_mode': bool(getattr(game_room, 'enable_neutral_chaos_mode', False)),
            'enable_badge_unique_character_select': bool(getattr(game_room, 'enable_badge_unique_character_select', False)),
            # 2026-10-15：房間徽章列需要顯示這兩項有沒開，之前沒有放進序列化，前端拿不到。
            'gm_enabled': bool(getattr(game_room, 'gm_enabled', False)),
            'enable_random_initial_position': bool(getattr(game_room, 'enable_random_initial_position', False)),
            # 2026-10-15：GM 開局後暫停、等待 GM 手動開始遊戲流程時，前端要能判斷目前
            # 是不是這個狀態，才能顯示「等待 GM」的提示跟 GM 專用的「開始遊戲流程」按鈕。
            'awaiting_gm_release': bool(getattr(game_room, 'awaiting_gm_release', False)),
            'turn_timeout_minutes': int(getattr(game_room, 'turn_timeout_seconds', 180) or 180) // 60,
            'max_players': max(1, int(getattr(game_room, 'max_players', 8) or 8)),
            # 2026-10-15：GM 旁觀主持、不下場，房間玩家人數不計入 GM。
            'player_count': len(self._non_gm_players(game_room)),
            'players': list(game_room.players.keys()),
            'require_trip': getattr(game_room, 'require_trip', False),
            'hide_trip': getattr(game_room, 'hide_trip', True),
            'trip_min_games': max(0, int(getattr(game_room, 'trip_min_games', 0) or 0)),
            'manager_trip_enabled': bool(getattr(game_room, 'manager_trip', '')),
            'manager_trip_encrypted': getattr(game_room, 'manager_trip_encrypted', True),
        }

    def _trip_display_for_state(self, game_room: room.room, trip_display: str, viewer_is_gm: bool = False) -> str:
        # 2026-10-15：GM 旁觀主持，一開始就要看得到所有人的 TRIP，不受房間「隱藏 Trip」設定限制。
        if viewer_is_gm:
            return trip_display
        hide_trip = bool(getattr(game_room, 'hide_trip', True))
        if hide_trip and int(getattr(game_room, 'room_status', 0) or 0) != 3:
            return '-'
        return trip_display

    def _serialize_room_state(self, game_room: room.room, viewer_account: Optional[str] = None) -> Dict[str, Any]:
        current_player = game_room.current_player
        # 2026-10-15：GM 旁觀主持，一開始就看得到所有人的 TRIP，這裡先把這個觀看者是不是 GM 查好，下面每個玩家的 trip_display 都照這個来決定要不要遮罩。
        viewer_player_for_gm_check = game_room.players.get(viewer_account) if viewer_account else None
        viewer_is_gm = bool(viewer_player_for_gm_check and viewer_player_for_gm_check.profile.get('is_gm', False))
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
                'discard_cards': [
                    {
                        'id': f"Green:{str(getattr(card, 'name', '') or '')}",
                        'name': str(getattr(card, 'name', '') or ''),
                        'type': str(getattr(card, 'type', '') or ''),
                    }
                    for card in (board_deck.get('Green Discard', []) or [])
                ],
            },
            'White': {
                'deck': pile_count('White'),
                'discard': pile_count('White Discard'),
                'discard_cards': [
                    {
                        'id': f"White:{str(getattr(card, 'name', '') or '')}",
                        'name': str(getattr(card, 'name', '') or ''),
                        'type': str(getattr(card, 'type', '') or ''),
                    }
                    for card in (board_deck.get('White Discard', []) or [])
                ],
            },
            'Black': {
                'deck': pile_count('Black'),
                'discard': pile_count('Black Discard'),
                'discard_cards': [
                    {
                        'id': f"Black:{str(getattr(card, 'name', '') or '')}",
                        'name': str(getattr(card, 'name', '') or ''),
                        'type': str(getattr(card, 'type', '') or ''),
                    }
                    for card in (board_deck.get('Black Discard', []) or [])
                ],
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
            if bool(getattr(game_room, '_initial_green_card_executed', False)) and str(getattr(active_card, 'color', '') or '').lower() == 'green':
                card_target = 'self'
            raw_active_card_name = str(getattr(active_card, 'name', '') or '')
            target_accounts = []
            if card_target in ('other', 'one'):
                target_players = [player for player in game_room.players.values() if bool(getattr(player, 'is_alive', False))]
                if card_target == 'other':
                    target_players = [player for player in target_players if player != current_player]
                if raw_active_card_name == 'Moody Goblin':
                    target_players = [player for player in target_players if bool(getattr(player, 'equipment_list', []))]
                target_accounts = [player.account for player in target_players]
            # Banana Peel without equipment applies to self; no target selection required
            if str(getattr(active_card, 'name', '') or '') == 'Banana Peel' and not getattr(current_player, 'equipment_list', []):
                card_target = 'self'
                target_accounts = []
            # Moody Goblin should auto-resolve when nobody has equipment to steal.
            if raw_active_card_name == 'Moody Goblin' and not target_accounts:
                card_target = 'self'
                target_accounts = []
            card_prompt = {
                'name': raw_active_card_name,
                'target': card_target,
                'target_accounts': target_accounts,
            }
            card_color = str(getattr(active_card, 'color', '') or '').lower()
            is_green_card = card_color == 'green'
            is_game_finished = int(getattr(game_room, 'room_status', 0) or 0) == 3
            can_see_name = (
                is_game_finished
                or
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
                    'needs_choice': bool(needs_choice and game_room._get_green_card_force_effect(to_player, pending_card, pending_green.get('choice')) not in (0, 1, 2)),
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

        pending_counter = getattr(game_room, '_pending_counter_attack', None)
        counter_attack_prompt = None
        if pending_counter:
            original_attacker = pending_counter.get('original_attacker')
            counter_player = pending_counter.get('counter_player')
            if original_attacker and counter_player:
                counter_account = str(getattr(counter_player, 'account', '') or '').strip()
                original_account = str(getattr(original_attacker, 'account', '') or '').strip()
                counter_attack_prompt = {
                    'counter_account': counter_account,
                    'original_account': original_account,
                    'waiting_counter': bool(viewer_account and viewer_account == counter_account),
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

        settlement_reveal_map = dict(getattr(game_room, 'settlement_character_reveal', {}) or {})

        return {
            'room': self._serialize_room(game_room),
            'turn': {
                'current_trip_display': self._trip_display_for_state(game_room, current_player.trip_display, viewer_is_gm) if current_player else None,
                'current_account': current_player.account if current_player else None,
                'status': current_player.status if current_player else None,
            },
            'turn_timeout': game_room.get_turn_timeout_snapshot() if hasattr(game_room, 'get_turn_timeout_snapshot') else None,
            'boomed_notice': dict(getattr(game_room, 'latest_boom_notice', {}) or {}),
            'roll_call_notice': dict(getattr(game_room, 'latest_roll_call_notice', {}) or {}),
            'chat_messages': list(getattr(game_room, 'chat_messages', []) or []),
            'action_order': list(game_room.action_order or []),
            'move_options': [area.name for area in (getattr(game_room, '_move_area_options', []) or []) if area],
            'compass_options': [area.name for area in (getattr(game_room, '_compass_areas', []) or [])] if len(getattr(game_room, '_compass_areas', []) or []) > 1 else [],
            'pending_kill_loot': {
                'attacker_account': pending_loot['attacker'].account,
                'death_accounts': [p.account for p in pending_loot['deaths']],
                'allow_full': pending_loot['allow_full'],
            } if pending_loot else None,
            'pending_steal': pending_steal_payload,
            'counter_attack_prompt': counter_attack_prompt,
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
                    'trip_display': p.trip_display if (viewer_account and (account == viewer_account or viewer_is_gm)) else self._trip_display_for_state(game_room, p.trip_display, viewer_is_gm),
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
                    'is_gm': bool(p.profile.get('is_gm', False)),  # GM：旁觀主持，不下場，不計入 4~8 人名額
                    'character_reveal': p.character_reveal,
                    'settlement_character_reveal': bool(settlement_reveal_map.get(account, p.character_reveal)),
                    'character': p.character.name if (p.character and game_room.can_view_character(viewer_account, account)) else None,
                    'character_camp': p.character.camp if (p.character and game_room.can_view_character(viewer_account, account)) else None,
                    'can_use_ability': bool(p.can_use_ability) if p.character else None,
                    'ability_status': str(getattr(p, 'ability_status', '') or '') if p.character else None,
                    'character_ability_timing': int(getattr(p.character, 'ability_timing', 0) or 0) if p.character else None,
                    'character_ability_target': str(getattr(p.character, 'target', '') or '') if p.character else None,
                    'self_character': p.character.name if p.character and account == viewer_account else None,
                    'self_character_camp': p.character.camp if p.character and account == viewer_account else None,
                    'self_can_use_ability': bool(p.can_use_ability) if account == viewer_account else None,
                    'self_character_ability_timing': int(getattr(p.character, 'ability_timing', 0) or 0) if p.character and account == viewer_account else None,
                    'self_character_ability_target': str(getattr(p.character, 'target', '') or '') if p.character and account == viewer_account else None,
                    'self_atk_type': int(getattr(p, 'atk_type', 1) or 1) if account == viewer_account else None,
                    'is_invulnerable': bool(getattr(p, 'immortal', False) or getattr(p, 'eqp_immortal', False)),
                    'invulnerability_sources': serialize_invulnerability_sources(p),
                    'equipment': [eq.name for eq in p.equipment_list],
                }
                for account, p in game_room.players.items()
                if int(getattr(game_room, 'room_status', 0) or 0) == 1 or bool(getattr(p, 'character', None))
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

    def is_gm_trip(self, game_room: room.room, trip: str) -> bool:
        # 2026-10-13：GM 不再是另外指定的一個人——房間只開一個「是否開啟 GM 功能」
        # 開關，開啟之後，比對到 manager_trip（村長本人）的那個人加入時就同時視為
        # GM（村長的管理權限不會因此消失，is_village_manager 仍然為 True）。
        if not bool(getattr(game_room, 'gm_enabled', False)):
            return False
        return self.is_manager_trip(game_room, trip)

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
            board = getattr(game_room, 'board', None)
            for area in (getattr(board, 'field', []) or []):
                if area and area.name == target_id:
                    return area
        if kind == 'discard':
            board = getattr(game_room, 'board', None)
            card_deck = getattr(board, 'card_deck', {}) or {}
            target_text = str(target_id or '').strip()
            if not target_text:
                return None
            color_hint = ''
            card_name = target_text
            if ':' in target_text:
                color_hint, card_name = target_text.split(':', 1)
                color_hint = str(color_hint or '').strip().title()
                card_name = str(card_name or '').strip()
            discard_keys = [f'{color_hint} Discard'] if color_hint else ['Green Discard', 'White Discard', 'Black Discard']
            for discard_key in discard_keys:
                for card in (card_deck.get(discard_key, []) or []):
                    if str(getattr(card, 'name', '') or '').strip() == card_name:
                        return card
        return None

    def _event_room_id_from_dispatch(self, action: str, payload: Dict[str, Any], result: Dict[str, Any]) -> Optional[int]:
        data = result.get('data') if isinstance(result, dict) else None
        room_id_candidates = []
        if isinstance(payload, dict):
            room_id_candidates.append(payload.get('room_id'))
        if isinstance(data, dict):
            room_id_candidates.append(data.get('room_id'))
            room_obj = data.get('room')
            if isinstance(room_obj, dict):
                room_id_candidates.append(room_obj.get('room_id'))
        for candidate in room_id_candidates:
            try:
                rid = int(candidate)
                if rid > 0:
                    return rid
            except Exception:
                continue
        if action == 'create_room' and isinstance(data, dict):
            try:
                rid = int(data.get('room_id') or 0)
                if rid > 0:
                    return rid
            except Exception:
                return None
        return None

    def _room_event_channel(self, room_id: int):
        rid = int(room_id or 0)
        if rid <= 0:
            return None, None
        with self._room_event_lock:
            if rid not in self._room_event_logs:
                self._room_event_logs[rid] = []
            if rid not in self._room_event_conds:
                self._room_event_conds[rid] = threading.Condition(self._room_event_lock)
            return self._room_event_logs[rid], self._room_event_conds[rid]

    def append_room_event(self, room_id: int, event: str, data: Any) -> Optional[Dict[str, Any]]:
        rid = int(room_id or 0)
        if rid <= 0:
            return None
        log, cond = self._room_event_channel(rid)
        if log is None or cond is None:
            return None
        with self._room_event_lock:
            seq = int(self._room_event_seq.get(rid, 0) or 0) + 1
            self._room_event_seq[rid] = seq
            item = {
                'id': seq,
                'event': str(event or 'room_state_changed'),
                'data': data,
                'timestamp': datetime.now(timezone.utc).isoformat(),
            }
            log.append(item)
            if len(log) > self._room_event_log_limit:
                del log[:len(log) - self._room_event_log_limit]
            cond.notify_all()
            return item

    def wait_room_events(self, room_id: int, last_event_id: int, timeout_seconds: float = 25.0) -> List[Dict[str, Any]]:
        rid = int(room_id or 0)
        if rid <= 0:
            return []
        log, cond = self._room_event_channel(rid)
        if log is None or cond is None:
            return []

        last_id = max(0, int(last_event_id or 0))

        def collect_pending() -> List[Dict[str, Any]]:
            return [row for row in log if int(row.get('id', 0) or 0) > last_id]

        with self._room_event_lock:
            pending = collect_pending()
            if pending:
                return pending
            cond.wait(timeout=max(0.1, float(timeout_seconds or 25.0)))
            return collect_pending()

    def _emit_room_state_event(self, room_id: int):
        game_room = self.get_room(room_id)
        if not game_room:
            return
        payload = {
            'room_id': int(room_id),
            'room_status': int(getattr(game_room, 'room_status', 0) or 0),
        }
        self.append_room_event(room_id, 'room_state_changed', payload)

    def _emit_room_closed_event(self, room_id: int):
        self.append_room_event(room_id, 'room_closed', {'room_id': int(room_id)})

    def _post_dispatch_emit(self, action: str, payload: Dict[str, Any], result: Dict[str, Any]):
        if not bool(result.get('ok', False)):
            return
        room_id = self._event_room_id_from_dispatch(action, payload, result)
        if room_id:
            if action == 'abolish_room':
                self._emit_room_closed_event(room_id)
            elif action in self._ROOM_STATE_EVENT_ACTIONS:
                self._emit_room_state_event(room_id)
        if action in self._ROOM_SNAPSHOT_ACTIONS:
            self._persist_room_snapshots()

    def api_dispatch(self, action: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        try:
            result: Dict[str, Any]
            if action == 'create_room':
                result = self.api_create_room(payload)
            elif action == 'list_rooms':
                result = self._success('list_rooms', self.list_rooms())
            elif action == 'join_room':
                result = self.api_join_room(payload)
            elif action == 'leave_room':
                result = self.api_leave_room(payload)
            elif action == 'login_room':
                result = self.api_login_room(payload)
            elif action == 'start_game':
                result = self.api_start_game(payload)
            elif action == 'gm_release_game_start':
                result = self.api_gm_release_game_start(payload)
            elif action == 'next_step':
                result = self.api_next_step(payload)
            elif action == 'card_effect':
                result = self.api_card_effect(payload)
            elif action == 'loot_from_kill':
                result = self.api_loot_from_kill(payload)
            elif action == 'steal_equipment':
                result = self.api_steal_equipment(payload)
            elif action == 'set_green_card_choice':
                result = self.api_set_green_card_choice(payload)
            elif action == 'confirm_green_card':
                result = self.api_confirm_green_card(payload)
            elif action == 'confirm_equipment':
                result = self.api_confirm_equipment(payload)
            elif action == 'get_room_state':
                result = self.api_get_room_state(payload)
            elif action == 'change_color':
                result = self.api_change_color(payload)
            elif action == 'abolish_room':
                result = self.api_abolish_room(payload)
            elif action == 'toggle_ready':
                result = self.api_toggle_ready(payload)
            elif action == 'vote_kick':
                result = self.api_vote_kick(payload)
            elif action == 'roll_call':
                result = self.api_roll_call(payload)
            elif action == 'extend_turn_timeout':
                result = self.api_extend_turn_timeout(payload)
            elif action == 'update_room_settings':
                result = self.api_update_room_settings(payload)
            elif action == 'reveal_character':
                result = self.api_reveal_character(payload)
            elif action == 'activate_standby_ability':
                result = self.api_activate_standby_ability(payload)
            elif action == 'send_chat':
                result = self.api_send_chat(payload)
            elif action == 'register_trip':
                result = self.api_register_trip(payload)
            elif action == 'change_trip':
                result = self.api_change_trip(payload)
            elif action == 'claim_trip_records':
                result = self.api_claim_trip_records(payload)
            elif action == 'modify_trip_records':
                result = self.api_modify_trip_records(payload)
            elif action == 'delete_trip_records':
                result = self.api_delete_trip_records(payload)
            elif action == 'submit_trip_rating':
                result = self.api_submit_trip_rating(payload)
            elif action == 'upload_avatar':
                result = self.api_upload_avatar(payload)
            elif action == 'submit_bug_report':
                result = self.api_submit_bug_report(payload)
            elif action == 'get_bug_report_status':
                result = self.api_get_bug_report_status(payload)
            elif action == 'get_bug_reports_by_trip':
                result = self.api_get_bug_reports_by_trip(payload)
            elif action == 'filter_avatars_by_trip':
                result = self.api_filter_avatars_by_trip(payload)
            elif action == 'admin_list_bug_reports':
                result = self.api_admin_list_bug_reports(payload)
            elif action == 'admin_update_bug_report':
                result = self.api_admin_update_bug_report(payload)
            else:
                result = self._error(action, 'ACTION_NOT_SUPPORTED', 'action is not supported', 404)
            self._post_dispatch_emit(action, payload, result)
            return result
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
        # 2026-10-13：拿掉原本獨立的「GM Trip」欄位——GM 不再是另外指定的一個人，
        # 而是村長本人在開啟 GM 功能時升級成的身分，所以這裡只收一個布林開關；
        # 開啟時要求村長 Trip 本身要符合 GM 的場次門檻（30 場，比村長原本的 10 場高）。
        gm_enabled = bool(payload.get('gm_enabled', False))
        # 2026-10-15：Mike 要求暫時拿掉村長／GM Trip 的場次門檻，先不擋，方便目前測試；
        # 但 TRIP 是否登記過的檢查、跟「開 GM 要先設定村長 Trip」這個結構性檢查都還是要留著
        # （GM 沒有搭配村長 Trip 的話這個選項本身就沒有意義）。場次門檻檢查先註解掉，保留原始
        # 程式碼，之後要恢復的話把註解拿掉就好。
        if manager_trip:
            if not self.is_trip_registered_in_db(manager_trip):
                return self._error('create_room', 'MANAGER_TRIP_NOT_REGISTERED', '村長 Trip 未登記，無法設定', 403)
            # manager_games = self.get_trip_games_count_from_db(manager_trip)
            # required_games = self._GM_TRIP_MIN_GAMES if gm_enabled else self._MANAGER_TRIP_MIN_GAMES
            # if manager_games < required_games:
            #     return self._error(
            #         'create_room',
            #         'GM_TRIP_GAME_COUNT_NOT_ENOUGH' if gm_enabled else 'MANAGER_TRIP_GAME_COUNT_NOT_ENOUGH',
            #         (
            #             f'村長 Trip 開啟 GM 功能需要的場次不足，至少需要 {required_games} 場'
            #             if gm_enabled
            #             else f'村長 Trip 遊戲場次不足，至少需要 {required_games} 場'
            #         ),
            #         403,
            #     )
        elif gm_enabled:
            return self._error('create_room', 'GM_REQUIRES_MANAGER_TRIP', '需要先設定村長 Trip 才能開啟 GM 功能', 400)
        is_chat_room = bool(payload.get('is_chat_room', False))
        expansion_mode = self._resolve_expansion_mode_from_payload(payload, default_mode='all')
        enable_initial_green_card = bool(payload.get('enable_initial_green_card', False))
        enable_neutral_chaos_mode = bool(payload.get('enable_neutral_chaos_mode', False))
        enable_badge_unique_character_select = bool(payload.get('enable_badge_unique_character_select', False))
        enable_random_initial_position = bool(payload.get('enable_random_initial_position', False))
        turn_timeout_minutes = int(payload.get('turn_timeout_minutes', 3) or 3)
        max_players_raw = payload.get('max_players')
        max_players = None
        if max_players_raw is not None and str(max_players_raw).strip() != '':
            try:
                max_players = int(max_players_raw)
            except (TypeError, ValueError):
                return self._error('create_room', 'INVALID_MAX_PLAYERS', '房間人數上限格式錯誤', 400)
            if max_players < 4 or max_players > 8:
                return self._error('create_room', 'INVALID_MAX_PLAYERS', '房間人數上限必須在 4~8 人之間', 400)
        normalized_room_name = self._normalize_room_name_for_limit(room_name)
        if not normalized_room_name:
            return self._error('create_room', 'ROOM_NAME_REQUIRED', 'room_name is required', 400)
        if self._count_display_width(normalized_room_name) > self._ROOM_NAME_MAX_DISPLAY_WIDTH:
            return self._error('create_room', 'ROOM_NAME_TOO_LONG', f'room_name exceeds max display width {self._ROOM_NAME_MAX_DISPLAY_WIDTH}', 400)
        safe_room_comment = str(room_comment or '').strip()
        if self._count_display_width(safe_room_comment) > self._ROOM_COMMENT_MAX_DISPLAY_WIDTH:
            return self._error('create_room', 'ROOM_COMMENT_TOO_LONG', f'room_comment exceeds max display width {self._ROOM_COMMENT_MAX_DISPLAY_WIDTH}', 400)
        game_room = self.create_room(
            room_name,
            room_comment=str(room_comment or ''),
            require_trip=require_trip,
            hide_trip=hide_trip,
            trip_min_games=trip_min_games,
            manager_trip=manager_trip,
            manager_trip_encrypted=manager_trip_encrypted,
            gm_enabled=gm_enabled,
            is_chat_room=is_chat_room,
            expansion_mode=expansion_mode,
            enable_initial_green_card=enable_initial_green_card,
            enable_neutral_chaos_mode=enable_neutral_chaos_mode,
            enable_badge_unique_character_select=enable_badge_unique_character_select,
            enable_random_initial_position=enable_random_initial_position,
            turn_timeout_minutes=turn_timeout_minutes,
            max_players=max_players,
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
        if int(getattr(game_room, 'room_status', 0) or 0) != 1:
            return self._error('join_room', 'ROOM_NOT_RECRUITING', '遊戲已開始或已結束，無法住民登記', 400)
        trip_raw = str(player_info.get('trip') or '').strip()
        trip_display = self.encrypt_trip_like_higu(trip_raw) if trip_raw else ''
        account = str(player_info.get('account') or '').strip()
        if not account:
            return self._error('join_room', 'ACCOUNT_REQUIRED', '帳號必填', 400)
        is_gm_joiner = self.is_gm_trip(game_room, trip_display)
        # GM 是旁觀主持的額外位置，不佔用一般玩家的人數上限；只有非 GM 的登記才受 max_players 限制。
        if not is_gm_joiner and len(self._non_gm_players(game_room)) >= max(1, int(getattr(game_room, 'max_players', 8) or 8)):
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
        if name and self._count_display_width(name) > self._NICKNAME_MAX_DISPLAY_WIDTH:
            return self._error('join_room', 'NAME_TOO_LONG', f'name exceeds max display width {self._NICKNAME_MAX_DISPLAY_WIDTH}', 400)
        if name and game_room.has_name(name):
            return self._error('join_room', 'NAME_ALREADY_EXISTS', '暱稱已存在，請更換', 400)
        normalized_player_info = dict(player_info)
        normalized_player_info['trip'] = trip_display
        normalized_player_info['is_village_manager'] = self.is_manager_trip(game_room, trip_display)
        normalized_player_info['is_gm'] = is_gm_joiner
        # 2026-10-15 修正：GM 原本在這裡被直接視為已準備（is_ready 強制設 True），
        # 單純是因為 GM 不計入開局人數、不需要「準備」，想避免卡在「全員準備」的
        # 判斷裡——但 GM 本來就不在 _non_gm_players() 的計算範圍內，這個強制已準備
        # 完全是多餘的，徒增一個 GM 卡片一進房就顯示「已準備」的誤導畫面。Mike
        # 回報這會造成混淆，拿掉這段，GM 的 is_ready 照一般玩家一樣預設為 False
        # （沒有實際意義，all_ready／all_non_gm_ready 的計算從頭到尾都只看非 GM
        # 玩家，不受影響）。
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
        # GM 旁觀主持、不下場，不佔用這 9 色（聊天室/系統訊息改用保留的 GM_COLOR_HEX），
        # 所以 GM 加入時跳過自動選色，避免白白佔掉一個顏色名額。
        if not is_gm_joiner:
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
        # 2026-10-20 修正：2026-10-15 加上的 GM 專屬開局限制（只有 GM 能按「開始遊戲」）
        # 整段移除：Mike 要求 GM 功能改回跟非 GM 房間一樣，全員（含 GM）準備完成就自動開局
        # （見 api_toggle_ready()），不再需要這裡的 GM 權限檢查，回到 GM 功能出現之前的行為：
        # 任何人都可以調用這支 API（主要是連接測試用的 startGameForm）手動觸發開局。
        # 2026-10-09 修正：「遊戲開始」「本場配置」這兩則系統訊息改成在 game_start()
        # 裡面統一發送（見 game/room.py），這裡不用再補發，避免跟自動開局路徑各自
        # 維護一份、訊息順序又跑到初始綠卡流程後面的問題。
        game_room = self.start_game(room_id, seed=seed)
        viewer_account = str(payload.get('account') or payload.get('viewer_account') or '').strip() or None
        return self._success('start_game', self._serialize_room_state(game_room, viewer_account=viewer_account))

    def api_gm_release_game_start(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # 2026-10-15：開啟 GM 功能的房間，開局（發角色/站位/判定首位玩家）後會先暫停
        # （game_room.awaiting_gm_release），等 GM 按下「開始遊戲流程」才真正進入初始
        # 綠卡或常規回合流程（見 game/room.py 的 game_start()／gm_release_game_start()）。
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('gm_release_game_start', 'INVALID_PAYLOAD', 'room_id and account are required', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('gm_release_game_start', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 2:
            return self._error('gm_release_game_start', 'GAME_NOT_STARTED', '遊戲尚未開始', 400)
        requester = game_room.players.get(account)
        if not requester or not bool(requester.profile.get('is_gm', False)):
            return self._error('gm_release_game_start', 'ONLY_GM_CAN_RELEASE', '只有 GM 可以開始遊戲', 403)
        if not bool(getattr(game_room, 'awaiting_gm_release', False)):
            return self._error('gm_release_game_start', 'NOT_AWAITING_GM_RELEASE', '目前不是等待 GM 開始遊戲的狀態', 400)
        game_room.gm_release_game_start()
        game_room.touch_activity()
        return self._success('gm_release_game_start', self._serialize_room_state(game_room, viewer_account=account))

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
        game_room.add_system_message(f"[{target_player.name or account}] 更換顏色為 {color}")
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
        ready_text = '已準備' if target_player.profile['is_ready'] else '取消準備'
        game_room.add_system_message(f"[{target_player.name or account}] {ready_text}")
        game_room.touch_activity()

        # 2026-10-20 修正：Mike 要求 GM 功能的開局方式改回跟一般房間一樣——全員（這次改成
        # 「含 GM」）準備完成就自動開局，GM 不用再額外按一顆「開始遊戲」按鈕，只要
        # 自己也按「準備」就能控制開局時機。2026-10-15 那次改成「GM 不計入準備人數、
        # 要 GM 手動按開始遊戲」的特殊處理整段拿掉，回到 GM 功能出現之前把
        # game_room.players（含 GM）整包一起判斷的寫法；GM 是否準備現在跟其他玩家一樣
        # 計入「全員準備完成」的判斷，也一起計入 4 人門檻。
        playing_players = game_room.players
        player_count = len(playing_players)
        all_ready = (not bool(getattr(game_room, 'is_chat_room', False))) and player_count >= 4 and all(bool(p.profile.get('is_ready', False)) for p in playing_players.values())
        if all_ready:
            game_room.add_system_message('全員準備完成，遊戲開始')
            self.start_game(room_id)
            # 「遊戲開始，發放角色並進入回合流程」「本場配置：...」這兩則訊息改成在
            # game_start() 裡面統一發送（見 game/room.py），這裡不用再補發；手動開始
            # （api_start_game）跟這裡的自動開局，都會收到同樣順序正確的開局訊息。

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
            game_room.add_system_message(f"村長 [{voter.name or voter_account}] 剔除了 [{target.name or target_account}]")
            game_room.clear_all_kick_votes()
            # 剔除玩家後所有人需要重新準備，跟「重新點名」一樣用音效提醒大家。
            game_room.record_roll_call(voter_account, voter.name or voter_account)
            return self._success('vote_kick', self._serialize_room_state(game_room, viewer_account=voter_account))

        vote_count = game_room.cast_kick_vote(voter_account, target_account)
        game_room.add_system_message(f"[{voter.name or voter_account}] 投票剔除 [{target.name or target_account}]（目前 {vote_count} 票）")
        if vote_count >= 3:
            if not game_room.kick(target_account):
                return self._error('vote_kick', 'KICK_FAILED', '剔除失敗', 400)
            game_room.add_system_message(f"[{target.name or target_account}] 已被投票剔除")
            game_room.clear_all_kick_votes()
            # 剔除玩家後所有人需要重新準備，跟「重新點名」一樣用音效提醒大家。
            game_room.record_roll_call(voter_account, voter.name or voter_account)

        return self._success('vote_kick', self._serialize_room_state(game_room, viewer_account=voter_account))

    def api_roll_call(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('roll_call', 'INVALID_PAYLOAD', 'room_id and account are required', 400)

        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('roll_call', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 1:
            return self._error('roll_call', 'NOT_RECRUITING', '僅招募中可使用點名功能', 400)

        requester = game_room.players.get(account)
        if not requester:
            return self._error('roll_call', 'PLAYER_NOT_FOUND', '玩家不存在', 404)
        if not bool(requester.profile.get('is_village_manager', False)):
            return self._error('roll_call', 'NOT_VILLAGE_MANAGER', '只有村長可以點名', 403)

        game_room.record_roll_call(account, requester.name or account)
        game_room.add_system_message(f"村長 [{requester.name or account}] 發起點名，所有人需重新準備")
        game_room.touch_activity()
        return self._success('roll_call', self._serialize_room_state(game_room, viewer_account=account))

    def api_extend_turn_timeout(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('extend_turn_timeout', 'INVALID_PAYLOAD', 'room_id and account are required', 400)

        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('extend_turn_timeout', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 2:
            return self._error('extend_turn_timeout', 'NOT_PLAYING', '僅遊戲進行中可延長倒數', 400)

        requester = game_room.players.get(account)
        if not requester:
            return self._error('extend_turn_timeout', 'PLAYER_NOT_FOUND', '玩家不存在', 404)
        if not bool(requester.profile.get('is_village_manager', False)):
            return self._error('extend_turn_timeout', 'NOT_VILLAGE_MANAGER', '只有村長可以延長倒數', 403)

        timeout_player = game_room._get_turn_timeout_player() if hasattr(game_room, '_get_turn_timeout_player') else getattr(game_room, 'current_player', None)
        if not timeout_player or not bool(getattr(timeout_player, 'is_alive', False)):
            return self._error('extend_turn_timeout', 'INVALID_STATE', '目前沒有可延長的回合倒數', 400)

        game_room.touch_turn_action()
        if hasattr(game_room, '_clear_turn_timeout_notice'):
            game_room._clear_turn_timeout_notice()
        game_room.add_system_message(
            f"村長 延長目前回合倒數：[{timeout_player.name or timeout_player.account}] 重新開始計時"
        )
        game_room.touch_activity()
        return self._success('extend_turn_timeout', self._serialize_room_state(game_room, viewer_account=account))

    def api_update_room_settings(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('update_room_settings', 'INVALID_PAYLOAD', 'room_id and account are required', 400)

        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('update_room_settings', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 1:
            return self._error('update_room_settings', 'NOT_RECRUITING', '僅招募中可修改房間設定', 400)

        requester = game_room.players.get(account)
        if not requester:
            return self._error('update_room_settings', 'PLAYER_NOT_FOUND', '玩家不存在', 404)

        is_village_manager = bool(requester.profile.get('is_village_manager', False))
        is_gm = bool(requester.profile.get('is_gm', False))

        room_setting_keys = {
            'expansion_mode',
            'enable_initial_green_card',
            'enable_neutral_chaos_mode',
            'enable_badge_unique_character_select',
            'enable_random_initial_position',
            'turn_timeout_minutes',
            'use_basic_card_set',
            'card_set_basic',
            'use_basic',
            'use_extend_card_set',
            'card_set_extend',
            'use_extend',
            'max_players',
        }
        has_room_setting_patch = any(key in payload for key in room_setting_keys)
        if has_room_setting_patch and not is_village_manager:
            return self._error('update_room_settings', 'NOT_VILLAGE_MANAGER', '只有村長可以修改房間設定', 403)

        expansion_mode = self._resolve_expansion_mode_from_payload(
            payload,
            default_mode=getattr(game_room, 'expansion_mode', 'all'),
        )
        debug_forced_key = None
        for candidate_key in ('debug_forced_characters', 'debug_role_overrides', 'debug_character_overrides'):
            if candidate_key in payload:
                debug_forced_key = candidate_key
                break

        if debug_forced_key is not None:
            try:
                debug_forced_roles = self._normalize_forced_role_payload(game_room, payload.get(debug_forced_key))
                if not debug_forced_roles:
                    return self._error('update_room_settings', 'INVALID_FORCED_CHARACTER_CONFIG', '需提供至少一筆指定角色設定', 400)
                if not is_gm:
                    # 指定角色只保留給 GM；村長跟一般玩家一樣，連自己的角色都不能指定
                    # （這個功能原本是後端除錯用，不是給玩家自選角色的正式機制，Mike 明確要求村長
                    # 連自己的角色都不能指定，所以這裡不分自己／別人，非 GM 一律擋下）。
                    return self._error('update_room_settings', 'ONLY_GM_CAN_FORCE_CHARACTER', '只有 GM 可以指定角色，且不能指定自己', 403)
                # GM 旁觀主持、不下場，只能指定「場上其他玩家」的角色，不能指定自己（GM 沒有角色）。
                if account in debug_forced_roles:
                    return self._error('update_room_settings', 'GM_CANNOT_FORCE_OWN_CHARACTER', 'GM 不下場，不能指定自己的角色', 403)
                current_debug_forced_roles = dict(getattr(game_room, 'debug_forced_characters', {}) or {})
                candidate_forced_roles = dict(current_debug_forced_roles)
                candidate_forced_roles.update(debug_forced_roles)

                self._validate_forced_character_config(game_room, candidate_forced_roles, expansion_mode)
            except ValueError as exc:
                return self._error('update_room_settings', 'INVALID_FORCED_CHARACTER_CONFIG', str(exc), 400)
            game_room.debug_forced_characters = candidate_forced_roles

        if not has_room_setting_patch:
            game_room.touch_activity()
            return self._success('update_room_settings', self._serialize_room_state(game_room, viewer_account=account))

        enable_initial_green_card = bool(payload.get('enable_initial_green_card', getattr(game_room, 'enable_initial_green_card', False)))
        enable_neutral_chaos_mode = bool(payload.get('enable_neutral_chaos_mode', getattr(game_room, 'enable_neutral_chaos_mode', False)))
        enable_badge_unique_character_select = bool(payload.get('enable_badge_unique_character_select', getattr(game_room, 'enable_badge_unique_character_select', False)))
        # 2026-10-15：隨機初始位置開放村長在開局前隨時切換（跟其他房間設定一樣，
        # 僅限招募中/房間還沒開局時可改）；GM 這個設定不開放在這裡切換，仍然只能在
        # 建村時決定，因為 GM 是在玩家加入時比對 Trip 判斷的，開局前臨時切換會有「已
        # 加入的人要不要追溯升級成 GM」的歧義，Mike 明確要求 GM 維持建村時決定就好。
        enable_random_initial_position = bool(payload.get('enable_random_initial_position', getattr(game_room, 'enable_random_initial_position', False)))
        timeout_minutes_raw = payload.get('turn_timeout_minutes', int(getattr(game_room, 'turn_timeout_seconds', 180) or 180) // 60)
        try:
            timeout_minutes = int(timeout_minutes_raw or 3)
        except Exception:
            timeout_minutes = 3
        timeout_minutes = max(2, min(30, timeout_minutes))
        allowed_timeouts = {2, 3, 5, 10, 20, 30}
        if timeout_minutes not in allowed_timeouts:
            nearest = min(allowed_timeouts, key=lambda value: abs(value - timeout_minutes))
            timeout_minutes = int(nearest)

        # 2026-10-13：村長可以調低房間人數上限（例如 4~8 之間），等於把多出來的
        # 空位關掉，不用開到滿 8 人也能玩；聊天室 (is_chat_room) 不受這個 4~8
        # 限制，上限固定維持 50，不開放調整。
        is_chat_room = bool(getattr(game_room, 'is_chat_room', False))
        if is_chat_room:
            max_players = int(getattr(game_room, 'max_players', 50) or 50)
        else:
            max_players_raw = payload.get('max_players', getattr(game_room, 'max_players', 8))
            try:
                max_players = int(max_players_raw)
            except (TypeError, ValueError):
                return self._error('update_room_settings', 'INVALID_MAX_PLAYERS', '房間人數上限格式錯誤', 400)
            if max_players < 4 or max_players > 8:
                return self._error('update_room_settings', 'INVALID_MAX_PLAYERS', '房間人數上限必須在 4~8 人之間', 400)
            current_non_gm_count = len(self._non_gm_players(game_room))
            if max_players < current_non_gm_count:
                return self._error(
                    'update_room_settings',
                    'MAX_PLAYERS_BELOW_CURRENT_COUNT',
                    f'房間人數上限不能低於目前已加入人數（{current_non_gm_count} 人）',
                    400,
                )

        game_room.expansion_mode = expansion_mode
        game_room.enable_initial_green_card = enable_initial_green_card
        game_room.enable_neutral_chaos_mode = enable_neutral_chaos_mode
        # 2026-10-19 修正：跟 create_room 一樣，中立大亂鬥跟徽章唯一互斥，開啟
        # 中立大亂鬥時徽章唯一強制關閉（見 create_room 裡的修正說明）。
        game_room.enable_badge_unique_character_select = enable_badge_unique_character_select and not enable_neutral_chaos_mode
        game_room.enable_random_initial_position = enable_random_initial_position
        game_room.turn_timeout_seconds = int(timeout_minutes * 60)
        game_room.max_players = max_players
        game_room.touch_activity()
        game_room.add_system_message(
            "村長更新房間設定："
            f"{self._format_room_settings_summary(game_room)}"
        )
        return self._success('update_room_settings', self._serialize_room_state(game_room, viewer_account=account))

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
        if game_room.current_player == player and int(getattr(player, 'status', 0) or 0) == 1:
            game_room.trigger_start_passive_ability(player)
        role_name = str(getattr(getattr(player, 'character', None), 'name', '') or '未知角色')
        game_room.add_system_message(f"[{player.name or account}] 主動揭示身份：{role_name}")
        game_room.touch_activity()
        return self._success('reveal_character', self._serialize_room_state(game_room, viewer_account=account))

    def api_activate_standby_ability(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        供 ability_timing=11（不限自己回合，隨時可發動）的角色使用，例如艾莉（Allie）。
        跟一般透過 next_step 推進回合的能力發動管道（僅限輪到自己回合時）完全分開。
        """
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        if room_id is None or not account:
            return self._error('activate_standby_ability', 'INVALID_PAYLOAD', 'room_id and account are required', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('activate_standby_ability', 'ROOM_NOT_FOUND', '房間不存在', 404)
        if int(getattr(game_room, 'room_status', 0) or 0) != 2:
            return self._error('activate_standby_ability', 'GAME_NOT_STARTED', '遊戲尚未開始', 400)
        player = game_room.players.get(account)
        if not player:
            return self._error('activate_standby_ability', 'PLAYER_NOT_FOUND', '玩家不存在', 404)
        if not player.character or int(getattr(player.character, 'ability_timing', 0) or 0) != 11:
            return self._error('activate_standby_ability', 'ABILITY_NOT_SUPPORTED', '此角色沒有可隨時發動的能力', 400)
        if not player.character_reveal and getattr(player.character, 'ability_requires_reveal', True):
            return self._error('activate_standby_ability', 'CHARACTER_NOT_REVEALED', '角色尚未揭露，無法發動能力', 400)
        if not player.can_use_ability:
            return self._error('activate_standby_ability', 'ABILITY_UNAVAILABLE', '能力已無法使用', 400)
        activated = bool(game_room.activate_standby_ability(account))
        if not activated:
            return self._error('activate_standby_ability', 'ABILITY_ACTIVATION_FAILED', '能力發動失敗', 400)
        game_room.touch_activity()
        return self._success('activate_standby_ability', self._serialize_room_state(game_room, viewer_account=account))

    def api_send_chat(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        room_id = payload.get('room_id')
        account = str(payload.get('account') or '').strip()
        message = str(payload.get('message') or '').strip()
        if room_id is None or not account or not message:
            return self._error('send_chat', 'INVALID_PAYLOAD', 'room_id/account/message are required', 400)
        game_room = self.get_room(room_id)
        if not game_room:
            return self._error('send_chat', 'ROOM_NOT_FOUND', '房間不存在', 404)
        sender = game_room.players.get(account)
        if not sender:
            return self._error('send_chat', 'PLAYER_NOT_FOUND', '玩家不存在', 404)
        if self._count_display_width(message) > self._CHAT_MESSAGE_MAX_DISPLAY_WIDTH:
            return self._error('send_chat', 'MESSAGE_TOO_LONG', '訊息最多 200 字', 400)

        profile = getattr(sender, 'profile', {}) or {}
        sender_name = str(profile.get('name') or getattr(sender, 'name', '') or '未知').strip() or '未知'
        game_room.add_chat_message(account=account, name=sender_name, text=message)
        game_room.touch_activity()
        return self._success('send_chat', self._serialize_room_state(game_room, viewer_account=account))

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

    def api_get_avatar_catalog(self) -> Dict[str, Any]:
        return {
            'avatars': self.avatar_store.list_custom_avatars(),
        }

    def api_upload_avatar(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # 2026-10-15：跟問題回報的 TRIP 查詢一樣拿掉密碼，只檢查「這組密語確實對應
        # 到一個已登記的 TRIP」（get_registered_trip_display() 一律把輸入當成原始
        # 密語重新加密後比對，不接受已經加密過的字串，避免有人拿別人公開顯示的
        # TRIP 標籤直接冒用）。存進頭像資料時也存加密後的 trip_display，不存原始
        # 密語，避免密語本身以明文留在資料庫裡。
        trip_raw = str(payload.get('trip', '') or '').strip()
        name = str(payload.get('name', '') or '').strip()
        color = str(payload.get('color', '') or '').strip() or '#9aa4ad'
        image_data_url = str(payload.get('image_data_url', '') or '').strip()
        if not trip_raw or not name or not image_data_url:
            return self._error('upload_avatar', 'INVALID_PAYLOAD', 'trip/name/image_data_url are required', 400)
        trip_display = self.record_store.get_registered_trip_display(trip_raw)
        if not trip_display:
            return self._error('upload_avatar', 'TRIP_NOT_REGISTERED', '這個 TRIP 還沒有登記過，請先在「身分登錄」頁面登記', 400)
        try:
            avatar = self.avatar_store.upload_avatar(trip_display, name, color, image_data_url)
        except ValueError as exc:
            return self._error('upload_avatar', 'BAD_REQUEST', str(exc), 400)
        return self._success('upload_avatar', avatar)

    def api_filter_avatars_by_trip(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # 2026-10-15：選頭貼時可以篩選出「自己上傳的頭貼」。這裡不要求 TRIP 一定要
        # 登記過——單純把玩家輸入的原始密語加密後，去比對每一張頭貼存的 owner_trip，
        # 找得到就回傳符合的頭貼編號，找不到就回傳空清單，不當成錯誤處理。
        trip_raw = str(payload.get('trip', '') or '').strip()
        if not trip_raw:
            return self._error('filter_avatars_by_trip', 'INVALID_PAYLOAD', '請輸入 TRIP', 400)
        trip_key = self.encrypt_trip_like_higu(trip_raw)
        avatar_ids = self.avatar_store.list_avatar_ids_by_trip_key(trip_key)
        return self._success('filter_avatars_by_trip', {'avatar_ids': avatar_ids})

    def api_submit_bug_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        # 2026-10-13：問題回報不需要有登記 Trip 才能用——玩家自己打一個暱稱就能回報，
        # 包括還沒登記身分、卡在登入流程本身出問題的人也能回報。
        nickname = str(payload.get('nickname', '') or '').strip()
        category = str(payload.get('category', '') or '').strip().lower()
        description = str(payload.get('description', '') or '').strip()
        room_id = payload.get('room_id')
        if not nickname:
            return self._error('submit_bug_report', 'NICKNAME_REQUIRED', '請填寫暱稱', 400)
        if self._count_display_width(nickname) > self._BUG_REPORT_NICKNAME_MAX_DISPLAY_WIDTH:
            return self._error(
                'submit_bug_report',
                'NICKNAME_TOO_LONG',
                f'暱稱超過長度限制（最多 {self._BUG_REPORT_NICKNAME_MAX_DISPLAY_WIDTH}）',
                400,
            )
        if category not in self._BUG_REPORT_CATEGORIES:
            category = 'other'
        if not description:
            return self._error('submit_bug_report', 'DESCRIPTION_REQUIRED', '請填寫問題描述', 400)
        if self._count_display_width(description) > self._BUG_REPORT_DESCRIPTION_MAX_DISPLAY_WIDTH:
            return self._error(
                'submit_bug_report',
                'DESCRIPTION_TOO_LONG',
                f'描述超過長度限制（最多 {self._BUG_REPORT_DESCRIPTION_MAX_DISPLAY_WIDTH}）',
                400,
            )

        # 如果是在房間裡面點回報，順手把當下那個房間的完整狀態快照存下來，方便之後
        # 重現問題；拿不到房間或序列化失敗都不應該擋住回報本身，安靜地略過快照就好。
        normalized_room_id: Optional[int] = None
        room_state_snapshot_json = ''
        if room_id is not None and str(room_id).strip() != '':
            try:
                normalized_room_id = int(room_id)
            except (TypeError, ValueError):
                normalized_room_id = None
            if normalized_room_id is not None:
                game_room = self.rooms.get(normalized_room_id)
                if game_room is not None:
                    try:
                        snapshot = self._serialize_room_state(game_room)
                        room_state_snapshot_json = json.dumps(snapshot, ensure_ascii=False)
                    except Exception:
                        room_state_snapshot_json = ''

        # 2026-10-15：可以選填已經在「身分登錄」頁面登記過的 TRIP，之後可以直接用
        # 同一組 TRIP 查詢自己回報過的所有問題，不用記回報編號。這裡不檢查密碼——
        # Mike 確認這個情境不需要密碼等級的保護，只要確認「這組密語確實對應到一個
        # 已登記的 TRIP」即可（用 get_registered_trip_display() 直接加密原始密語後
        # 比對，不接受已經加密過的字串當輸入，避免有人拿別人公開顯示的 TRIP 標籤
        # 直接冒用）。
        trip_raw = str(payload.get('trip', '') or '').strip()
        trip_display = ''
        if trip_raw:
            trip_display = self.record_store.get_registered_trip_display(trip_raw)
            if not trip_display:
                return self._error('submit_bug_report', 'TRIP_NOT_REGISTERED', '這個 TRIP 還沒有登記過，請先在「身分登錄」頁面登記', 400)

        token = self.record_store.add_bug_report(
            nickname=nickname,
            category=category,
            description=description,
            room_id=normalized_room_id,
            room_state_snapshot_json=room_state_snapshot_json,
            trip=trip_display,
        )
        return self._success('submit_bug_report', {'report_token': token})

    def api_get_bug_report_status(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        report_token = str(payload.get('report_token', '') or '').strip()
        if not report_token:
            return self._error('get_bug_report_status', 'REPORT_TOKEN_REQUIRED', '請輸入回報編號', 400)
        report = self.record_store.get_bug_report(report_token)
        if not report:
            return self._error('get_bug_report_status', 'REPORT_NOT_FOUND', '找不到這個回報編號', 404)
        return self._success('get_bug_report_status', report)

    def api_get_bug_reports_by_trip(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        trip_raw = str(payload.get('trip', '') or '').strip()
        if not trip_raw:
            return self._error('get_bug_reports_by_trip', 'INVALID_PAYLOAD', '請輸入 TRIP', 400)
        trip_display = self.record_store.get_registered_trip_display(trip_raw)
        if not trip_display:
            return self._error('get_bug_reports_by_trip', 'TRIP_NOT_REGISTERED', '這個 TRIP 還沒有登記過', 400)
        reports = self.record_store.list_bug_reports_by_trip(trip_display)
        return self._success('get_bug_reports_by_trip', {'reports': reports})

    def _get_bug_report_admin_token(self) -> str:
        """讀取問題回報後台頁面的密碼；檔案不存在就自動產生一個隨機密碼並寫進去，
        之後 Mike 可以直接打開這個檔案看密碼，或是自己改成想要的內容。"""
        path = self._BUG_REPORT_ADMIN_TOKEN_PATH
        try:
            with open(path, 'r', encoding='utf-8') as f:
                token = f.read().strip()
            if token:
                return token
        except FileNotFoundError:
            pass
        except OSError:
            return ''
        generated = secrets.token_urlsafe(9)
        try:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, 'w', encoding='utf-8') as f:
                f.write(generated + '\n')
        except OSError:
            pass
        return generated

    def _check_bug_report_admin_token(self, payload: Dict[str, Any]) -> bool:
        submitted = str(payload.get('admin_token', '') or '').strip()
        expected = self._get_bug_report_admin_token()
        if not submitted or not expected:
            return False
        return secrets.compare_digest(submitted, expected)

    def api_admin_list_bug_reports(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self._check_bug_report_admin_token(payload):
            return self._error('admin_list_bug_reports', 'ADMIN_AUTH_FAILED', '密碼錯誤', 401)
        status_filter = str(payload.get('status_filter', '') or '').strip() or None
        reports = self.record_store.list_bug_reports(status_filter=status_filter)
        return self._success('admin_list_bug_reports', {'reports': reports})

    def api_admin_update_bug_report(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not self._check_bug_report_admin_token(payload):
            return self._error('admin_update_bug_report', 'ADMIN_AUTH_FAILED', '密碼錯誤', 401)
        report_token = str(payload.get('report_token', '') or '').strip()
        if not report_token:
            return self._error('admin_update_bug_report', 'REPORT_TOKEN_REQUIRED', '缺少回報編號', 400)
        status = payload.get('status')
        if status is not None and str(status).strip() not in ('open', 'in_progress', 'resolved'):
            return self._error('admin_update_bug_report', 'BAD_STATUS', '不合法的狀態', 400)
        resolution_note = payload.get('resolution_note')
        updated = self.record_store.update_bug_report(
            report_token=report_token,
            status=status,
            resolution_note=resolution_note,
        )
        if not updated:
            return self._error('admin_update_bug_report', 'REPORT_NOT_FOUND', '找不到這個回報編號', 404)
        return self._success('admin_update_bug_report', {'report_token': report_token})
