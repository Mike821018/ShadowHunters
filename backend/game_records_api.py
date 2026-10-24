"""
Game Records API Integration - Handles recording game results and player statistics
Integrates with records_system.py and the Room/RoomManager classes
"""

from datetime import datetime
from typing import Dict, List, Optional, Any, TYPE_CHECKING
import uuid
import base64
import hashlib
import unicodedata
from backend.records_system import (
    GameRecord, PlayerRecord, GameRecordStore, 
    RoomGameHistory, TripRatingRecord
)

if TYPE_CHECKING:
    from backend.game.room import room as GameRoom


class GameRecordsAPI:
    """API for recording and retrieving game statistics"""
    
    def __init__(self, record_store: GameRecordStore):
        self.record_store = record_store
        self.game_start_times: Dict[int, float] = {}  # room_id -> start_time

    def encrypt_trip_like_higu(self, trip: str) -> str:
        if not trip:
            return ''
        sha1_hex = hashlib.sha1(str(trip).encode('utf-8')).hexdigest()
        encoded = base64.b64encode(sha1_hex.encode('ascii')).decode('ascii')
        return encoded[1:9]

    def to_trip_display(self, trip: str) -> str:
        value = str(trip or '').strip()
        if not value:
            return ''
        if hasattr(self.record_store, 'to_trip_display'):
            return self.record_store.to_trip_display(value)
        return self.encrypt_trip_like_higu(value)

    @staticmethod
    def _count_display_width(text: Any) -> int:
        width = 0
        for char in str(text or ''):
            if unicodedata.combining(char):
                continue
            width += 2 if unicodedata.east_asian_width(char) in {'F', 'W'} else 1
        return width

    def _normalize_camp_code(self, camp: str) -> str:
        code = str(camp or '').strip().lower()
        if code == 'neutral':
            return 'civilian'
        if code in ('hunter', 'shadow', 'civilian'):
            return code
        return ''

    def _winner_camp_codes_from_game(self, record: GameRecord) -> set:
        winner_set = set(record.winner_players or [])
        camps = set()
        if winner_set:
            for p in record.players:
                if p.player_id in winner_set:
                    camp_code = self._normalize_camp_code(p.character_camp)
                    if camp_code:
                        camps.add(camp_code)

        # Backward compatibility: some historical records may not have winner_players,
        # but still have winner_camp persisted.
        if not camps:
            winner_camp_raw = str(getattr(record, 'winner_camp', '') or '')
            for part in winner_camp_raw.replace('+', '_').replace('/', '_').replace(',', '_').split('_'):
                camp_code = self._normalize_camp_code(part)
                if camp_code:
                    camps.add(camp_code)
        return camps

    def _winner_code_from_camps(self, camps: set) -> str:
        if not camps:
            return 'draw'
        order = ['hunter', 'shadow', 'civilian']
        sorted_codes = [code for code in order if code in camps]
        if not sorted_codes:
            return 'draw'
        if len(sorted_codes) == 1:
            return sorted_codes[0]
        return '_'.join(sorted_codes)

    def _infer_neutral_chaos_from_players(self, players: List[PlayerRecord]) -> bool:
        camps = set()
        for player in (players or []):
            camp_code = self._normalize_camp_code(getattr(player, 'character_camp', ''))
            if camp_code:
                camps.add(camp_code)
        return bool(camps) and camps == {'civilian'}

    def _get_normalized_game_settings(self, record: GameRecord, *, persist: bool = False) -> Dict[str, Any]:
        def parse_bool(value: Any, default: bool = False) -> bool:
            if value is None:
                return bool(default)
            if isinstance(value, str):
                return value.strip().lower() in {'1', 'true', 'yes', 'on'}
            return bool(value)

        def parse_int(value: Any, default: int) -> int:
            try:
                return int(value)
            except (TypeError, ValueError):
                return int(default)

        settings = dict(getattr(record, 'game_settings', {}) or {})
        final_state = getattr(record, 'final_state', None)
        room_state = dict(final_state.get('room') or {}) if isinstance(final_state, dict) else {}
        changed = False

        defaults = {
            'room_name': str(room_state.get('room_name') or settings.get('room_name') or f"{int(getattr(record, 'room_id', 0) or 0)}村"),
            'room_comment': str(room_state.get('room_comment') or settings.get('room_comment') or ''),
            'expansion_mode': str(room_state.get('expansion_mode') or settings.get('expansion_mode') or 'all'),
            'require_trip': parse_bool(settings.get('require_trip', room_state.get('require_trip', False))),
            'enable_initial_green_card': parse_bool(settings.get('enable_initial_green_card', room_state.get('enable_initial_green_card', False))),
            'enable_neutral_chaos_mode': parse_bool(
                settings.get(
                    'enable_neutral_chaos_mode',
                    room_state.get('enable_neutral_chaos_mode', self._infer_neutral_chaos_from_players(record.players)),
                )
            ),
            'enable_badge_unique_character_select': parse_bool(
                settings.get(
                    'enable_badge_unique_character_select',
                    room_state.get('enable_badge_unique_character_select', False),
                )
            ),
            # 2026-10-19 修正：gm_enabled／enable_random_initial_position 這兩個設定
            # 是 2026-10-15 才加的，當時只記得同步房間頁村子資訊徽章列（見
            # villageSettingsBadges.js），忘了這裡的 defaults 清單也要補上，導致
            # 這兩個設定從來沒有被正規化／回填過——較舊的紀錄直接讀不到值，對戰
            # 紀錄列表（records.js）因此永遠少了 GM／R 這兩個徽章。補上跟其他欄位
            # 一樣的 settings／room_state 雙重回退寫法。
            'gm_enabled': parse_bool(settings.get('gm_enabled', room_state.get('gm_enabled', False))),
            'enable_random_initial_position': parse_bool(
                settings.get(
                    'enable_random_initial_position',
                    room_state.get('enable_random_initial_position', False),
                )
            ),
            'turn_timeout_minutes': max(
                1,
                parse_int(settings.get('turn_timeout_minutes', room_state.get('turn_timeout_minutes')), 3),
            ),
        }

        for key, value in defaults.items():
            if settings.get(key) != value:
                settings[key] = value
                changed = True

        record.game_settings = settings

        if isinstance(final_state, dict):
            merged_room_state = dict(room_state)
            for key in (
                'room_name',
                'room_comment',
                'expansion_mode',
                'require_trip',
                'enable_initial_green_card',
                'enable_neutral_chaos_mode',
                'enable_badge_unique_character_select',
                'gm_enabled',
                'enable_random_initial_position',
                'turn_timeout_minutes',
            ):
                if merged_room_state.get(key) != settings[key]:
                    merged_room_state[key] = settings[key]
                    changed = True
            final_state['room'] = merged_room_state
            record.final_state = final_state

        if changed and persist:
            self.record_store._persist_game_record(record)

        return settings
    
    # ===== Game Lifecycle Events =====
    
    def on_game_start(self, room: 'GameRoom'):
        """Called when game starts (room_status becomes 2)"""
        import time
        self.game_start_times[room.room_id] = time.time()
    
    def on_game_end(self, room: 'GameRoom', abolished: bool = False) -> Optional[str]:
        """
        Called when game ends (room_status becomes 3)
        Returns the record_id if successful, None otherwise

        2026-10-22 新增 abolished 參數：Mike 要求廢村（room_status 變成 4）時
        也要建立一筆紀錄（餵玩家統計、房間頁點進去還能看），但不要出現在
        對戰紀錄列表裡——沿用 on_room_abolished() 呼叫這裡，標記 abolished=True。
        """
        import time
        
        if room.room_id not in self.game_start_times:
            return None
        
        try:
            # Calculate game duration
            start_time = self.game_start_times[room.room_id]
            duration_seconds = int(time.time() - start_time)
            
            # Build player records
            player_records = []
            for account, player_obj in room.players.items():
                if not player_obj or not player_obj.character:
                    continue
                profile = getattr(player_obj, 'profile', {}) or {}
                
                player_record = PlayerRecord(
                    player_id=account,
                    player_name=str(profile.get('name') or getattr(player_obj, 'name', '') or account),
                    character_name=getattr(player_obj.character, 'name', 'Unknown'),
                    character_camp=getattr(player_obj.character, 'camp', 'Unknown'),
                    is_alive=player_obj.is_alive,
                    final_hp=max(0, getattr(player_obj, 'hp', 0) - getattr(player_obj, 'damage', 0)),
                    damage_taken=getattr(player_obj, 'damage', 0),
                    cards_played=getattr(player_obj, 'cards_played_count', 0),
                    trip_display=str(getattr(player_obj, 'trip_display', '') or ''),
                    # 2026-10-22 修正：profile.get('password') 現在存的已經是
                    # room.py 的 GameRoom._hash_login_password() 在玩家加入房間當下
                    # 就算好的雜湊值（sha256(account + '\0' + 密碼明碼)），不再是明碼，
                    # 所以這裡不能再呼叫 hash_account_password() 重新雜湊一次——兩邊公式
                    # 雖然完全一樣，但輸入已經不是原始密碼而是雜湊值，再雜湊一次會得到
                    # 不同的結果，之後玩家用原始帳密透過 claim_trip_records／
                    # modify_trip_records 認領這筆紀錄時會對不起來。直接沿用這裡已經算好
                    # 的雜湊值即可。
                    account_password_hash=str(getattr(player_obj, 'password', '') or profile.get('password', '') or ''),
                    avatar_no=int(profile.get('avatar_no', 1) or 1),
                    cards_equipped=[c.name for c in (getattr(player_obj, 'equipment_list', None) or getattr(player_obj, 'equipments', []))],
                    boomed=bool(getattr(player_obj, 'is_boomed', False)),
                )
                player_records.append(player_record)
            
            # Determine winner camp
            winner_camp = self._get_winner_camp(room, player_records)
            
            # Build game record
            game_record = GameRecord(
                record_id=str(uuid.uuid4()),
                room_id=room.room_id,
                game_date=datetime.now().isoformat(),
                game_duration_seconds=duration_seconds,
                game_settings={
                    'enable_initial_green_card': bool(getattr(room, 'enable_initial_green_card', False)),
                    'enable_neutral_chaos_mode': bool(getattr(room, 'enable_neutral_chaos_mode', False)),
                    'enable_badge_unique_character_select': bool(getattr(room, 'enable_badge_unique_character_select', False)),
                    'expansion_mode': str(getattr(room, 'expansion_mode', 'all') or 'all'),
                    'max_players': int(getattr(room, 'max_players', 8) or 8),
                    'require_trip': bool(getattr(room, 'require_trip', False)),
                    'room_name': str(getattr(room, 'room_name', '') or ''),
                    'room_comment': str(getattr(room, 'room_comment', '') or ''),
                    'turn_timeout_minutes': int(getattr(room, 'turn_timeout_seconds', 180) or 180) // 60,
                },
                players=player_records,
                winner_camp=winner_camp,
                winner_players=list(room.winner_accounts),
                end_reason=self._get_end_reason(room, abolished=abolished),
                total_actions=self._count_total_actions(room),
                total_damage_dealt=self._count_total_damage(room),
                kills_count=self._count_kills(room, player_records),
                chat_messages=list(getattr(room, 'chat_messages', []) or []),
                final_state=self._build_final_state_snapshot(room),
                is_abolished=bool(abolished),
            )
            
            # Save game record
            record_id = self.record_store.save_game_record(game_record)
            
            # Update player stats
            for player_record in player_records:
                if player_record.player_id in room.players:
                    self.record_store.update_player_stats(
                        player_record.player_id,
                        game_record,
                        player_record
                    )
            
            # Add to room history
            self.record_store.add_game_to_room_history(room.room_id, game_record)
            
            # Update leaderboards
            self.record_store.update_leaderboards()
            
            # Clean up
            if room.room_id in self.game_start_times:
                del self.game_start_times[room.room_id]
            
            return record_id
        
        except Exception as e:
            print(f"Error recording game: {e}")
            return None

    def on_room_abolished(self, room: 'GameRoom') -> Optional[str]:
        """
        2026-10-22 新增：村長／GM 中途廢村時呼叫。聊天村另外走 _record_chat_room_abolish()
        （聊天村不會開局，game_start_times 永遠不會有記錄，照一般流程一定會被下面的
        檢查擋掉，所以必須在這裡單獨分支處理）。一般遊戲村只有已經開局過（on_game_start
        記錄過 game_start_times）才建立紀錄——還在招募階段就廢村沒有角色配置可記，
        建了也沒意義。沿用 on_game_end() 的完整建檔流程（玩家統計、房間歷史、
        排行榜都照常更新），只是標記 is_abolished=True，讓對戰紀錄列表把它濾掉，
        但單筆查詢（房間頁點進去回放）跟玩家統計不受影響。
        """
        if bool(getattr(room, 'is_chat_room', False)):
            return self._record_chat_room_abolish(room)
        if room.room_id not in self.game_start_times:
            return None
        return self.on_game_end(room, abolished=True)

    def _record_chat_room_abolish(self, room: 'GameRoom') -> Optional[str]:
        """
        2026-10-22 新增：聊天村被廢村時建立一筆紀錄。聊天村沒有角色／陣營／勝負這些
        遊戲概念（玩家 player_obj.character 永遠是 None），不能沿用 on_game_end() ——
        那邊會直接把沒有 character 的玩家整個濾掉（if not player_obj.character: continue），
        對聊天村來說等於濾掉所有人。這裡改成直接手動建一筆精簡版的 GameRecord：
        玩家名單／trip／帳號雜湊照實記錄（方便之後用 trip 認領），角色／陣營／勝負
        欄位留空（前端用 room_kind == 'chat' 判斷要不要顯示這些欄位），而且完全不呼叫
        update_player_stats()／update_leaderboards()——聊天村紀錄不該、也不能混進玩家的
        勝率等統計（rebuild_player_stats() 那邊也用同一個 room_kind 欄位擋掉，雙重保險）。
        """
        try:
            player_records = []
            for account, player_obj in room.players.items():
                if not player_obj:
                    continue
                profile = getattr(player_obj, 'profile', {}) or {}
                player_records.append(PlayerRecord(
                    player_id=account,
                    player_name=str(profile.get('name') or getattr(player_obj, 'name', '') or account),
                    character_name='',
                    character_camp='',
                    is_alive=True,
                    final_hp=0,
                    damage_taken=0,
                    cards_played=0,
                    trip_display=str(getattr(player_obj, 'trip_display', '') or ''),
                    account_password_hash=str(getattr(player_obj, 'password', '') or profile.get('password', '') or ''),
                    avatar_no=int(profile.get('avatar_no', 1) or 1),
                    cards_equipped=[],
                    boomed=False,
                ))

            game_record = GameRecord(
                record_id=str(uuid.uuid4()),
                room_id=room.room_id,
                game_date=datetime.now().isoformat(),
                game_duration_seconds=0,
                game_settings={},
                players=player_records,
                winner_camp='',
                winner_players=[],
                end_reason='ChatRoomAbolished',
                total_actions=0,
                total_damage_dealt=0,
                kills_count={},
                chat_messages=list(getattr(room, 'chat_messages', []) or []),
                final_state=self._build_final_state_snapshot(room),
                is_abolished=True,
                room_kind='chat',
            )

            record_id = self.record_store.save_game_record(game_record)
            self.record_store.add_game_to_room_history(room.room_id, game_record)
            # 注意：故意不呼叫 update_player_stats()／update_leaderboards()——
            # 聊天村紀錄不計入玩家統計／排行榜。
            return record_id
        except Exception as e:
            print(f"Error recording chat room abolish: {e}")
            return None

    def on_chat_message(self, room: 'GameRoom', message: Dict[str, Any]) -> bool:
        """Called when a post-game chat message should be persisted into the latest room record."""
        try:
            room_id = int(getattr(room, 'room_id', 0) or 0)
        except Exception:
            room_id = 0
        if room_id <= 0:
            return False
        return bool(self.record_store.append_chat_message_to_latest_room_record(room_id, dict(message or {})))
    
    # ===== API Endpoints (HTTP handlers) =====
    
    def api_get_player_stats(self, account: str) -> Dict[str, Any]:
        """API: Get player statistics"""
        stats = self.record_store.get_player_stats(account)
        if not stats:
            return {'error': 'Player not found', 'account': account}
        
        return {
            'account': stats.account,
            'trip_display': stats.trip_display,
            'total_games': stats.total_games,
            'boomed_count': getattr(stats, 'boomed_count', 0),
            'wins': stats.wins,
            'losses': stats.losses,
            'draws': stats.draws,
            'win_rate': f"{stats.win_rate:.2%}",
            'skill_level': stats.skill_level,
            'character_stats': {
                char: {
                    'games_played': cs.games_played,
                    'wins': cs.wins,
                    'losses': cs.losses,
                    'win_rate': f"{cs.win_rate:.2%}",
                    'average_damage_per_game': f"{cs.average_damage_per_game:.1f}"
                }
                for char, cs in stats.character_stats.items()
            },
            'camp_stats': {
                camp: {
                    'games_played': cs.games_played,
                    'wins': cs.wins,
                    'win_rate': f"{cs.win_rate:.2%}"
                }
                for camp, cs in stats.camp_stats.items()
            },
            'last_played': stats.last_played,
            'created_date': stats.created_date,
            'average_duration_per_game': f"{stats.average_duration_per_game:.0f} seconds"
        }
    
    def api_get_leaderboard(self, scope: str = 'global', room_id: Optional[int] = None, limit: int = 50) -> Dict[str, Any]:
        """API: Get leaderboard"""
        leaderboard = self.record_store.get_leaderboard(scope, room_id)
        
        # Apply limit
        leaderboard = leaderboard[:limit]
        
        return {
            'scope': scope,
            'room_id': room_id,
            'entries': [
                {
                    'rank': entry.rank,
                    'player_id': entry.player_id,
                    'player_name': entry.player_name,
                    'value': f"{entry.value:.2%}" if 'win' in entry.sorting_key else str(entry.value),
                    'trend': entry.trend,
                    'last_update': entry.last_update
                }
                for entry in leaderboard
            ]
        }
    
    def api_get_game_record(self, record_id: str) -> Dict[str, Any]:
        """API: Get single game record details"""
        record = self.record_store.get_game_record(record_id)
        if not record:
            return {'error': 'Record not found', 'record_id': record_id}

        settings = self._get_normalized_game_settings(record, persist=True)
        
        return {
            'record_id': record.record_id,
            'room_id': record.room_id,
            'game_date': record.game_date,
            'duration_seconds': record.game_duration_seconds,
            'game_settings': settings,
            'players': [
                {
                    'player_id': p.player_id,
                    'player_name': p.player_name,
                    'trip_display': str(getattr(p, 'trip_display', '') or ''),
                    'avatar_no': int(getattr(p, 'avatar_no', 1) or 1),
                    'character_name': p.character_name,
                    'character_camp': p.character_camp,
                    'is_alive': p.is_alive,
                    'boomed': bool(getattr(p, 'boomed', False)),
                    'final_hp': p.final_hp,
                    'damage_taken': p.damage_taken,
                    'cards_played': p.cards_played,
                    'cards_equipped': p.cards_equipped
                }
                for p in record.players
            ],
            'winner_camp': record.winner_camp,
            'winner_players': record.winner_players,
            'end_reason': record.end_reason,
            'total_actions': record.total_actions,
            'total_damage_dealt': record.total_damage_dealt,
            'kills_count': record.kills_count,
            'chat_messages': list(getattr(record, 'chat_messages', []) or []),
            'final_state': dict(getattr(record, 'final_state', {}) or {}),
            'is_abolished': bool(getattr(record, 'is_abolished', False)),
            'room_kind': str(getattr(record, 'room_kind', 'game') or 'game'),
        }

    def api_get_game_record_by_room_id(self, room_id: int) -> Dict[str, Any]:
        rid = int(room_id or 0)
        if rid <= 0:
            return {'error': 'Invalid room_id', 'room_id': room_id}

        matched = [record for record in self.record_store.game_records.values() if int(getattr(record, 'room_id', 0) or 0) == rid]
        if not matched:
            return {'error': 'Record not found', 'room_id': rid}

        latest = max(matched, key=lambda row: str(getattr(row, 'game_date', '') or ''))
        return self.api_get_game_record(str(getattr(latest, 'record_id', '') or ''))

    def _build_final_state_snapshot(self, room: 'GameRoom') -> Dict[str, Any]:
        board = getattr(room, 'board', None)
        board_deck = getattr(board, 'card_deck', {}) or {}
        board_fields = list(getattr(board, 'field', []) or [])
        board_dice = getattr(board, 'dice', {}) or {}
        current_player = getattr(room, 'current_player', None)

        def pile_count(key: str) -> int:
            cards = board_deck.get(key, [])
            try:
                return len(cards)
            except Exception:
                return 0

        fields = []
        for area in board_fields[:6]:
            if not area:
                fields.append(None)
                continue
            numbers = getattr(area, 'number', []) or []
            fields.append({
                'name': str(getattr(area, 'name', '') or ''),
                'numbers': [int(value) for value in numbers if isinstance(value, int)],
                'is_draw': bool(getattr(area, 'is_draw', False)),
                'draw_type': str(getattr(area, 'draw_type', '') or ''),
                'is_action': bool(getattr(area, 'is_action', False)),
                'target': str(getattr(area, 'target', '') or ''),
            })
        while len(fields) < 6:
            fields.append(None)

        players = {}
        for account, p in (getattr(room, 'players', {}) or {}).items():
            character = getattr(p, 'character', None)
            profile = getattr(p, 'profile', {}) or {}
            players[str(account)] = {
                'account': str(getattr(p, 'account', account) or account),
                'trip_display': str(getattr(p, 'trip_display', '') or ''),
                'name': str(profile.get('name') or getattr(p, 'name', '') or account),
                'join_order': int(profile.get('join_order', 0) or 0),
                'avatar_no': int(profile.get('avatar_no', 1) or 1),
                'color': str(getattr(p, 'color', '') or ''),
                'is_ready': bool(profile.get('is_ready', False)),
                'alive': bool(getattr(p, 'is_alive', False)),
                'status': int(getattr(p, 'status', 0) or 0),
                'damage': int(getattr(p, 'damage', 0) or 0),
                'hp': int(getattr(p, 'hp', 0) or 0),
                'zone': int(getattr(p, 'zone', 0) or 0),
                'area': str(getattr(getattr(p, 'area', None), 'name', '') or ''),
                'character_reveal': bool(getattr(p, 'character_reveal', False)),
                'settlement_character_reveal': bool(
                    (getattr(room, 'settlement_character_reveal', {}) or {}).get(str(account), getattr(p, 'character_reveal', False))
                ),
                'character': str(getattr(character, 'name', '') or ''),
                'character_camp': str(getattr(character, 'camp', '') or ''),
                'can_use_ability': bool(getattr(p, 'can_use_ability', False)),
                'ability_status': str(getattr(p, 'ability_status', '') or ''),
                'character_ability_timing': int(getattr(character, 'ability_timing', 0) or 0) if character else 0,
                'character_ability_target': str(getattr(character, 'target', '') or '') if character else '',
                'is_invulnerable': bool(getattr(p, 'immortal', False) or getattr(p, 'eqp_immortal', False)),
                'invulnerability_source': (
                    str(getattr(p, 'immortal_source', '') or '')
                    or str(getattr(p, 'eqp_immortal_source', '') or '')
                ),
                'equipment': [str(getattr(eq, 'name', '') or '') for eq in (getattr(p, 'equipment_list', []) or [])],
                # 2026-10-21 新增：這個 final_state 快照是遊戲結束當下存一次的獨立序列化邏輯，
                # 跟 room_manager.py 的 _serialize_room_state（即時房間狀態用的那份）完全是兩套
                # 各自維護的程式碼，彼此不會互相套用欄位——Mike 發現舊的回放看不出暴斃顏色，
                # 就是因為這裡原本沒有存 boomed/is_boomed，不是前端判斷邏輯的問題。已存檔的
                # 舊紀錄本來就沒有這個欄位，照 Mike 的意思不特地回補；這裡只確保從現在開始
                # 結束的新對局，回放也能正確顯示暴斃顏色。
                'boomed': bool(getattr(p, 'is_boomed', False)),
            }

        return {
            'room': {
                'room_id': int(getattr(room, 'room_id', 0) or 0),
                'room_name': str(getattr(room, 'room_name', '') or ''),
                'room_status': int(getattr(room, 'room_status', 0) or 0),
                'player_count': len(players),
                'max_players': int(getattr(room, 'max_players', 8) or 8),
                'room_comment': str(getattr(room, 'room_comment', '') or ''),
                'expansion_mode': str(getattr(room, 'expansion_mode', 'all') or 'all'),
                'require_trip': bool(getattr(room, 'require_trip', False)),
                'enable_initial_green_card': bool(getattr(room, 'enable_initial_green_card', False)),
                'enable_neutral_chaos_mode': bool(getattr(room, 'enable_neutral_chaos_mode', False)),
                'turn_timeout_minutes': int(getattr(room, 'turn_timeout_seconds', 180) or 180) // 60,
            },
            'turn': {
                'current_trip_display': str(getattr(current_player, 'trip_display', '') or '') if current_player else '',
                'current_account': str(getattr(current_player, 'account', '') or '') if current_player else '',
                'status': int(getattr(current_player, 'status', 0) or 0) if current_player else 0,
            },
            'action_order': list(getattr(room, 'action_order', []) or []),
            'winners': list(getattr(room, 'winner_accounts', []) or []),
            'fields': fields,
            'card_piles': {
                'Green': {'deck': pile_count('Green'), 'discard': pile_count('Green Discard')},
                'White': {'deck': pile_count('White'), 'discard': pile_count('White Discard')},
                'Black': {'deck': pile_count('Black'), 'discard': pile_count('Black Discard')},
            },
            'dice': {
                'D6': int(board_dice.get('D6', 1) or 1),
                'D4': int(board_dice.get('D4', 1) or 1),
            },
            'players': players,
            'chat_messages': list(getattr(room, 'chat_messages', []) or []),
        }
    
    def api_get_player_games(self, account: str, limit: int = 20) -> Dict[str, Any]:
        """API: Get recent games for a player"""
        games = self.record_store.get_player_games(account)
        games = sorted(games, key=lambda g: g.game_date, reverse=True)[:limit]
        
        return {
            'account': account,
            'games': [
                {
                    'record_id': g.record_id,
                    'room_id': g.room_id,
                    'game_date': g.game_date,
                    'duration_seconds': g.game_duration_seconds,
                    'winner_camp': g.winner_camp,
                    'is_winner': account in g.winner_players
                }
                for g in games
            ]
        }
    
    def api_get_room_stats(self, room_id: int) -> Dict[str, Any]:
        """API: Get room statistics"""
        history = self.record_store.get_room_history(room_id)
        if not history:
            return {'error': 'Room not found', 'room_id': room_id}
        
        return {
            'room_id': room_id,
            'total_games': history.total_games,
            'games': [g.record_id for g in history.games]
        }
    
    def api_get_summary_stats(self) -> Dict[str, Any]:
        """API: Get overall summary statistics"""
        summary = self.record_store.get_summary_stats()
        return summary

    def api_get_game_records(self, limit: int = 100, page: int = 1, page_size: int = 20, search: str = '', room_kind: str = '') -> Dict[str, Any]:
        """API: List game records in reverse chronological order (paged).

        2026-10-22 新增 room_kind 參數：Mike 要求紀錄閱覽頁要把「一般紀錄」跟「聊天村紀錄」
        拆成子分頁分開顯示，不要混在同一份列表裡——傳 'game' 只回傳一般對戰紀錄（跟原本
        行為一樣，廢村產生的一般紀錄依然不顯示）；傳 'chat' 只回傳聊天村紀錄；不傳（空字串）
        維持舊行為，兩種都回傳在同一份列表裡（供既有呼叫端／測試相容）。
        """
        safe_page_size = max(1, min(int(page_size or 20), 100))
        safe_page = max(1, int(page or 1))
        keyword = str(search or '').strip().lower()
        kind_filter = str(room_kind or '').strip().lower()
        records = sorted(
            self.record_store.game_records.values(),
            key=lambda r: (int(getattr(r, 'room_id', 0) or 0), str(getattr(r, 'game_date', '') or '')),
            reverse=True,
        )

        def _winner_code(record: GameRecord) -> str:
            camps = self._winner_camp_codes_from_game(record)
            return self._winner_code_from_camps(camps)

        all_entries = []
        for record in records:
            # 2026-10-22 新增：廢村產生的紀錄不主動顯示在這份列表裡（Mike 要求），
            # 但玩家統計跟單筆查詢（api_get_game_record／api_get_game_record_by_room_id）
            # 不受影響，照常可以查到。聊天村的廢村紀錄是例外——Mike 要求聊天村紀錄
            # 要能在列表裡看到（用分類標籤區分），所以 room_kind == 'chat' 的不濾掉。
            record_kind = str(getattr(record, 'room_kind', 'game') or 'game')
            if bool(getattr(record, 'is_abolished', False)) and record_kind != 'chat':
                continue
            if kind_filter and record_kind != kind_filter:
                continue
            options = []
            settings = self._get_normalized_game_settings(record, persist=True)
            village_name = str(settings.get('room_name') or '').strip() or f"{record.room_id}村"
            village_comment = str(settings.get('room_comment') or '').strip()
            if settings.get('enable_initial_green_card'):
                options.append('Initial Green Card')
            if settings.get('enable_neutral_chaos_mode'):
                options.append('Neutral Chaos Mode')
            if settings.get('enable_badge_unique_character_select'):
                options.append('Badge Unique')
            if settings.get('require_trip'):
                options.append('TRIP Verification')
            # 2026-10-19 修正：這份 options 清單原本沒有 gm_enabled／
            # enable_random_initial_position，跟上面 _get_normalized_game_settings
            # 少了這兩個欄位的 defaults 是同一個根因——這裡補上，讓純文字版的
            # options 字串也完整（雖然前端列表已經改成直接讀下面新加的
            # game_settings 結構化欄位，不再解析這段文字，但這個字串可能還有
            # 其他用途，例如 validation.py 的既有測試，保持內容完整比較保險）。
            if settings.get('gm_enabled'):
                options.append('GM Mode')
            if settings.get('enable_random_initial_position'):
                options.append('Random Initial Position')
            if str(settings.get('expansion_mode') or ''):
                options.append(str(settings.get('expansion_mode')))

            if keyword and keyword not in village_name.lower() and keyword not in village_comment.lower():
                continue

            all_entries.append({
                'record_id': record.record_id,
                'room_id': record.room_id,
                'village_name': village_name,
                'end_time': record.game_date,
                'player_count': len(record.players or []),
                'winner_code': _winner_code(record),
                'options': ' / '.join(options) if options else '-',
                # 2026-10-19 新增：結構化版本的設定旗標，跟 api_get_game_record
                # （單筆紀錄詳情）回傳的 game_settings 同一套欄位——前端改成直接讀
                # 這個算徽章，不用再去解析上面那個拼接成人類可讀句子的 options
                # 字串。之後再新增設定只要 _get_normalized_game_settings 的
                # defaults 清單裡有定義，這裡就會自動帶出來，不用額外改這段。
                'game_settings': settings,
                # 2026-10-22 新增：紀錄種類（'game' 一般對戰／'chat' 聊天村），前端
                # 用這個欄位在列表裡顯示聊天村分類標籤，不要用遊戲的勝負欄位去呈現。
                'room_kind': record_kind,
            })

        total = len(all_entries)
        start = (safe_page - 1) * safe_page_size
        end = start + safe_page_size
        entries = all_entries[start:end]
        return {
            'entries': entries,
            'pagination': {
                'page': safe_page,
                'page_size': safe_page_size,
                'total': total,
            },
        }

    def api_get_trip_directory(
        self,
        keyword: str = '',
        limit: int = 200,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """API: List registered TRIP identities (paged, newest registration first)."""
        key = str(keyword or '').strip().lower()
        safe_limit = max(1, min(int(limit or 200), 500))
        safe_page_size = max(1, min(int(page_size or 20), 100))
        safe_page = max(1, int(page or 1))

        registrations = list(self.record_store.trip_registrations.values())
        registrations.sort(
            key=lambda row: (
                int(getattr(row, 'registration_index', 0) or 0),
                str(getattr(row, 'created_date', '') or ''),
            )
        )
        rows_by_trip: Dict[str, Dict[str, Any]] = {}
        for registration in registrations:
            trip_display = self.to_trip_display(getattr(registration, 'trip', ''))
            password_hash = str(getattr(registration, 'password_hash', '') or '').strip()
            if not trip_display:
                continue
            # Keep only explicitly registered identities with a persisted password hash.
            if not password_hash:
                continue
            rows_by_trip[trip_display] = {
                'trip': trip_display,
                'registration_index': int(getattr(registration, 'registration_index', 0) or 0),
                'total_games': 0,
                'wins': 0,
                'skill_level': '-',
            }

        # Only aggregate stats into explicitly registered TRIPs.
        for stats in self.record_store.get_all_players_stats():
            trip = self.to_trip_display(stats.trip_display)
            if not trip:
                continue
            row = rows_by_trip.get(trip)
            if row is None:
                continue
            row['total_games'] += int(stats.total_games or 0)
            row['wins'] += int(stats.wins or 0)
            if row['skill_level'] in ('-', 'Beginner') and stats.skill_level:
                row['skill_level'] = stats.skill_level

        rows = []
        for row in rows_by_trip.values():
            if key and key not in str(row['trip']).lower():
                continue
            total_games = int(row.get('total_games', 0) or 0)
            wins = int(row.get('wins', 0) or 0)
            rows.append({
                'trip': row['trip'],
                'registration_index': int(row.get('registration_index') or 0),
                'total_games': total_games,
                'win_rate': f"{(wins / total_games):.2%}" if total_games else '0.00%',
                'skill_level': row.get('skill_level') or '-',
            })

        rows.sort(key=lambda r: (-int(r['registration_index']), r['trip']))
        rows = rows[:safe_limit]
        total = len(rows)
        start = (safe_page - 1) * safe_page_size
        end = start + safe_page_size
        paged_rows = rows[start:end]
        return {
            'entries': paged_rows,
            'pagination': {
                'page': safe_page,
                'page_size': safe_page_size,
                'total': total,
            },
        }

    def api_get_trip_profile(
        self,
        trip: str,
        limit: int = 50,
        nickname_page: int = 1,
        game_page: int = 1,
        rating_page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """API: Get per-trip profile with paged nicknames, games, and ratings."""
        trip_key = str(trip or '').strip()
        if not trip_key:
            return {'error': 'trip is required'}
        trip_display = self.to_trip_display(trip_key)

        is_registered = bool(self.record_store.has_explicit_trip_registration(trip_key))
        if (not is_registered) and trip_display != trip_key:
            is_registered = bool(self.record_store.has_explicit_trip_registration(trip_display))

        if not is_registered:
            empty_pagination = {'page': 1, 'page_size': max(1, min(int(page_size or 20), 100)), 'total': 0}
            return {
                'trip': trip_display,
                'registered': False,
                'not_registered': True,
                'message': 'TRIP_NOT_REGISTERED',
                'accounts': [],
                'nicknames': [],
                'nickname_rows': [],
                'nickname_pagination': dict(empty_pagination),
                'games': [],
                'game_pagination': dict(empty_pagination),
                'survival_summary': {
                    'total_games_excluding_boomed': 0,
                    'alive_count_excluding_boomed': 0,
                    'dead_count_excluding_boomed': 0,
                    'survival_rate_excluding_boomed': '0.00%',
                },
                'performance_summary': {
                    'total_games': 0,
                    'total_wins': 0,
                    'total_win_rate': '0.00%',
                    'survival_rate': '0.00%',
                    'boomed_rate': '0.00%',
                    'total_rating_score': 0,
                    'camp_play_rates': {'hunter': '0.00%', 'shadow': '0.00%', 'civilian': '0.00%'},
                    'camp_win_rates': {'hunter': '0.00%', 'shadow': '0.00%', 'civilian': '0.00%'},
                    'participated_games_camp_win_rates': {'hunter': '0.00%', 'shadow': '0.00%', 'civilian': '0.00%'},
                },
                'ratings': [],
                'rating_pagination': dict(empty_pagination),
            }

        safe_page_size = max(1, min(int(page_size or 20), 100))

        def paginate(rows: List[Dict[str, Any]], page: int) -> Dict[str, Any]:
            safe_page = max(1, int(page or 1))
            total = len(rows)
            start = (safe_page - 1) * safe_page_size
            end = start + safe_page_size
            return {
                'page': safe_page,
                'page_size': safe_page_size,
                'total': total,
                'entries': rows[start:end],
            }

        accounts = set()
        nickname_rows = self.record_store.get_trip_nickname_counts(trip_key)
        if not nickname_rows and trip_display != trip_key:
            nickname_rows = self.record_store.get_trip_nickname_counts(trip_display)
        nicknames = {row['nickname'] for row in nickname_rows}
        games = []
        for game in self.record_store.game_records.values():
            for player in game.players:
                if str(player.trip_display or '').strip() != trip_display:
                    continue
                accounts.add(player.player_id)
                if str(player.player_name or '').strip():
                    nicknames.add(str(player.player_name or '').strip())

                is_winner = player.player_id in (game.winner_players or [])
                winner_camps = self._winner_camp_codes_from_game(game)
                winner_camp_code = self._winner_code_from_camps(winner_camps)
                result_code = 'draw'
                boomed = bool(getattr(player, 'boomed', False))
                player_camp_code = self._normalize_camp_code(player.character_camp)
                if boomed:
                    # Boomed rows should still show the real room winner camp; UI applies gray style separately.
                    result_code = winner_camp_code or player_camp_code or 'draw'
                elif winner_camp_code in ('draw', 'unknown'):
                    result_code = 'draw'
                elif winner_camp_code:
                    result_code = winner_camp_code
                else:
                    result_code = 'draw'

                games.append({
                    'record_id': game.record_id,
                    'room_id': game.room_id,
                    'game_date': game.game_date,
                    'account': player.player_id,
                    'player_name': player.player_name,
                    'character_name': player.character_name,
                    'character_camp': player.character_camp,
                    'is_alive': player.is_alive,
                    'status_label': '生存' if player.is_alive else '死亡',
                    'result_code': result_code,
                    'is_winner': is_winner,
                    'boomed': boomed,
                    'player_camp': player_camp_code,
                    'winner_camps': sorted(list(winner_camps)),
                    'rating_score': self.record_store.get_trip_game_rating_score(trip_display, game.room_id),
                })

        games.sort(key=lambda g: (int(g.get('room_id') or 0), str(g.get('game_date') or '')), reverse=True)
        non_boomed_games = [row for row in games if not bool(row.get('boomed'))]
        non_boomed_total = len(non_boomed_games)
        non_boomed_alive = len([row for row in non_boomed_games if bool(row.get('is_alive'))])
        non_boomed_dead = max(0, non_boomed_total - non_boomed_alive)
        rating_rows = self.record_store.get_trip_ratings(trip_display, limit=max(limit, 1000))
        room_to_game_record_id = {}
        for game in sorted(self.record_store.game_records.values(), key=lambda row: row.game_date, reverse=True):
            rid = int(getattr(game, 'room_id', 0) or 0)
            if rid and rid not in room_to_game_record_id:
                room_to_game_record_id[rid] = str(getattr(game, 'record_id', '') or '')
        rating_entries = [
            {
                'record_id': row.record_id,
                'room_id': row.room_id,
                'game_record_id': room_to_game_record_id.get(int(row.room_id or 0), ''),
                'source_trip': self.to_trip_display(row.source_trip),
                'rating': row.rating,
                'comment': row.comment,
                'created_date': row.created_date,
            }
            for row in rating_rows
        ]

        paged_nicknames = paginate(nickname_rows, nickname_page)
        paged_games = paginate(games[: max(1, min(limit, 5000))], game_page)
        paged_ratings = paginate(rating_entries, rating_page)

        total_games = len(games)
        total_wins = len([row for row in games if bool(row.get('is_winner'))])
        total_boomed = len([row for row in games if bool(row.get('boomed'))])
        total_alive = len([row for row in games if bool(row.get('is_alive'))])
        total_rating_score = sum(int(row.get('rating_score') or 0) for row in games)

        camps = ('hunter', 'shadow', 'civilian')
        camp_play_counts = {camp: 0 for camp in camps}
        camp_win_counts = {camp: 0 for camp in camps}
        participated_game_winner_counts = {camp: 0 for camp in camps}
        for row in games:
            camp_code = str(row.get('player_camp') or '').strip().lower()
            if camp_code in camp_play_counts:
                camp_play_counts[camp_code] += 1
                if bool(row.get('is_winner')):
                    camp_win_counts[camp_code] += 1
            for winner_camp in (row.get('winner_camps') or []):
                if winner_camp in participated_game_winner_counts:
                    participated_game_winner_counts[winner_camp] += 1

        def pct(part: int, whole: int) -> str:
            return f"{(part / whole):.2%}" if whole else '0.00%'

        return {
            'trip': trip_display,
            'registered': True,
            'accounts': sorted(accounts),
            'nicknames': sorted(nicknames),
            'nickname_rows': paged_nicknames['entries'],
            'nickname_pagination': {
                'page': paged_nicknames['page'],
                'page_size': paged_nicknames['page_size'],
                'total': paged_nicknames['total'],
            },
            'games': paged_games['entries'],
            'game_pagination': {
                'page': paged_games['page'],
                'page_size': paged_games['page_size'],
                'total': paged_games['total'],
            },
            'survival_summary': {
                'total_games_excluding_boomed': non_boomed_total,
                'alive_count_excluding_boomed': non_boomed_alive,
                'dead_count_excluding_boomed': non_boomed_dead,
                'survival_rate_excluding_boomed': f"{(non_boomed_alive / non_boomed_total):.2%}" if non_boomed_total else '0.00%',
            },
            'performance_summary': {
                'total_games': total_games,
                'total_wins': total_wins,
                'total_win_rate': pct(total_wins, total_games),
                'survival_rate': pct(total_alive, total_games),
                'boomed_rate': pct(total_boomed, total_games),
                'total_rating_score': total_rating_score,
                'camp_play_rates': {
                    'hunter': pct(camp_play_counts['hunter'], total_games),
                    'shadow': pct(camp_play_counts['shadow'], total_games),
                    'civilian': pct(camp_play_counts['civilian'], total_games),
                },
                'camp_win_rates': {
                    'hunter': pct(camp_win_counts['hunter'], camp_play_counts['hunter']),
                    'shadow': pct(camp_win_counts['shadow'], camp_play_counts['shadow']),
                    'civilian': pct(camp_win_counts['civilian'], camp_play_counts['civilian']),
                },
                'participated_games_camp_win_rates': {
                    'hunter': pct(participated_game_winner_counts['hunter'], total_games),
                    'shadow': pct(participated_game_winner_counts['shadow'], total_games),
                    'civilian': pct(participated_game_winner_counts['civilian'], total_games),
                },
            },
            'ratings': paged_ratings['entries'],
            'rating_pagination': {
                'page': paged_ratings['page'],
                'page_size': paged_ratings['page_size'],
                'total': paged_ratings['total'],
            },
        }

    def api_register_trip(self, trip: str, password: str) -> Dict[str, Any]:
        status = self.record_store.register_trip(trip, password)
        return {
            'trip': self.to_trip_display(trip),
            'status': status,
        }

    def api_change_trip(self, old_trip: str, old_password: str, new_trip: str, new_password: str) -> Dict[str, Any]:
        self.record_store.change_trip_registration(old_trip, old_password, new_trip, new_password)
        return {
            'trip': self.to_trip_display(new_trip),
            'status': 'changed',
        }

    def api_claim_trip_records(self, target_trip: str, target_password: str, account: str, account_password: str, room_id: Optional[int] = None) -> Dict[str, Any]:
        if not self.record_store.verify_trip_password(target_trip, target_password):
            raise ValueError('TRIP verification failed')
        updated = self.record_store.reassign_trip_by_account(
            self.to_trip_display(target_trip),
            account,
            account_password,
            room_id=room_id,
            only_unassigned=True,
        )
        return {
            'trip': str(target_trip or '').strip(),
            'updated_records': updated,
            'mode': 'claim',
        }

    def api_modify_trip_records(self, target_trip: str, target_password: str, account: str, account_password: str, room_id: Optional[int] = None) -> Dict[str, Any]:
        if not self.record_store.verify_trip_password(target_trip, target_password):
            raise ValueError('TRIP verification failed')
        updated = self.record_store.reassign_trip_by_account(
            self.to_trip_display(target_trip),
            account,
            account_password,
            room_id=room_id,
            only_unassigned=False,
        )
        return {
            'trip': str(target_trip or '').strip(),
            'updated_records': updated,
            'mode': 'modify',
        }

    def api_delete_trip_records(self, target_trip: str, target_password: str, nickname: str, room_id: Optional[int] = None) -> Dict[str, Any]:
        if not self.record_store.verify_trip_password(target_trip, target_password):
            raise ValueError('TRIP verification failed')
        updated = self.record_store.clear_trip_records_by_nickname(self.to_trip_display(target_trip), nickname, room_id=room_id)
        return {
            'trip': str(target_trip or '').strip(),
            'updated_records': updated,
            'mode': 'delete',
        }

    def api_submit_trip_rating(self, room_id: int, source_account: str, target_account: str, rating: int, comment: str = '') -> Dict[str, Any]:
        games = sorted(self.record_store.get_room_games(room_id), key=lambda row: row.game_date, reverse=True)
        if not games:
            raise ValueError('game record not found for room')

        game = games[0]
        source = next((p for p in game.players if str(p.player_id or '').strip() == str(source_account or '').strip()), None)
        target = next((p for p in game.players if str(p.player_id or '').strip() == str(target_account or '').strip()), None)
        if not source or not target:
            raise ValueError('source or target not found in game record')
        if source.player_id == target.player_id:
            raise ValueError('cannot rate yourself')

        source_trip = self.to_trip_display(source.trip_display)
        target_trip = self.to_trip_display(target.trip_display)
        if not source_trip or not target_trip:
            raise ValueError('both players must have registered trip')
        if not self.record_store.has_explicit_trip_registration(source_trip):
            raise ValueError('source trip is not registered')
        if not self.record_store.has_explicit_trip_registration(target_trip):
            raise ValueError('target trip is not registered')

        safe_rating = int(rating or 0)
        if safe_rating not in (-1, 1):
            raise ValueError('rating must be either 1 or -1')

        safe_comment = str(comment or '').strip()
        if self._count_display_width(safe_comment) > 40:
            raise ValueError('comment too long')

        same_room_rows = [row for row in self.record_store.rating_records if int(row.room_id or 0) == int(room_id)]
        if any(str(row.source_trip or '').strip() == source_trip and str(row.target_trip or '').strip() == target_trip for row in same_room_rows):
            raise ValueError('target already rated in this game')
        rated_target_count = len({str(row.target_trip or '').strip() for row in same_room_rows if str(row.source_trip or '').strip() == source_trip})
        if rated_target_count >= 3:
            raise ValueError('rating limit reached for this game')

        row = TripRatingRecord(
            record_id=str(uuid.uuid4()),
            room_id=int(room_id),
            source_trip=source_trip,
            target_trip=target_trip,
            rating=safe_rating,
            comment=safe_comment,
            created_date=datetime.now().isoformat(),
        )
        self.record_store.add_trip_rating(row)
        return {
            'record_id': row.record_id,
            'room_id': row.room_id,
            'source_trip': row.source_trip,
            'target_trip': row.target_trip,
            'rating': row.rating,
            'comment': row.comment,
        }
    
    # ===== Export Methods =====
    
    def api_export_player_stats_json(self, account: str) -> Dict[str, Any]:
        """API: Export player statistics as JSON"""
        stats = self.record_store.get_player_stats(account)
        if not stats:
            return {'error': 'Player not found'}
        
        return {
            'account': stats.account,
            'trip_display': stats.trip_display,
            'total_games': stats.total_games,
            'wins': stats.wins,
            'losses': stats.losses,
            'draws': stats.draws,
            'win_rate': stats.win_rate,
            'skill_level': stats.skill_level,
            'character_stats': {
                char: {
                    'games_played': cs.games_played,
                    'wins': cs.wins,
                    'losses': cs.losses,
                    'win_rate': cs.win_rate,
                    'total_damage_dealt': cs.total_damage_dealt,
                    'kills': cs.kills,
                    'average_damage_per_game': cs.average_damage_per_game
                }
                for char, cs in stats.character_stats.items()
            },
            'last_played': stats.last_played,
            'created_date': stats.created_date,
            'average_duration_per_game': stats.average_duration_per_game
        }
    
    # ===== Helper Methods =====
    
    def _get_winner_camp(self, room: 'GameRoom', player_records: List[PlayerRecord]) -> str:
        """Determine the winning camp"""
        if not room.winner_accounts:
            return 'Draw'
        
        winner_camps = set()
        for winner_account in room.winner_accounts:
            for player_record in player_records:
                if player_record.player_id == winner_account:
                    winner_camps.add(player_record.character_camp)
        
        if not winner_camps:
            return 'Unknown'
        elif len(winner_camps) == 1:
            return list(winner_camps)[0]
        else:
            return 'Mixed'
    
    def _get_end_reason(self, room: 'GameRoom', abolished: bool = False) -> str:
        """Determine the reason the game ended"""
        # 2026-10-22 新增：廢村產生的紀錄回傳 'Abolished'，方便之後需要時區分；
        # 目前前端沒有讀這個欄位，純粹是資料完整性。
        if abolished:
            return 'Abolished'
        # This would need to be added to room.py to track the end reason
        return 'Normal'
    
    def _count_total_actions(self, room: 'GameRoom') -> int:
        """Count total actions taken in the game"""
        # This could be tracked during the game
        return 0
    
    def _count_total_damage(self, room: 'GameRoom') -> int:
        """Count total damage dealt in the game"""
        total = 0
        for player_obj in room.players.values():
            if player_obj:
                total += getattr(player_obj, 'total_damage_dealt', 0)
        return total
    
    def _count_kills(self, room: 'GameRoom', player_records: List[PlayerRecord]) -> Dict[str, int]:
        """Count kills per player"""
        kills = {}
        for account, player_obj in room.players.items():
            kills[account] = getattr(player_obj, 'kill_count', 0)
        return kills
