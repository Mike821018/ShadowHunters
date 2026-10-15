"""
Game Records System - In-Memory Storage Implementation
Provides data structures and methods for storing game statistics and player records.
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any
from datetime import datetime
import uuid
import csv
import json
import hashlib
import base64
import os
import sqlite3
from collections import Counter


@dataclass
class PlayerRecord:
    """Single game player record"""
    player_id: str
    player_name: str
    character_name: str
    character_camp: str  # 'Hunter', 'Shadow', 'Civilian'
    is_alive: bool
    final_hp: int
    damage_taken: int
    cards_played: int
    trip_display: str = ''
    account_password_hash: str = ''
    avatar_no: int = 1
    cards_equipped: List[str] = field(default_factory=list)
    boomed: bool = False


@dataclass
class TripRegistration:
    """Registered TRIP identity"""
    trip: str
    password_hash: str
    created_date: str
    updated_date: str = ''
    registration_index: int = 0
    trip_encrypted: bool = True


@dataclass
class TripRatingRecord:
    """Per-game trip rating record"""
    record_id: str
    room_id: int
    source_trip: str
    target_trip: str
    rating: int
    comment: str = ''
    created_date: str = ''


@dataclass
class GameRecord:
    """Single game record"""
    record_id: str
    room_id: int
    game_date: str
    game_duration_seconds: int
    game_settings: Dict[str, Any]
    players: List[PlayerRecord]
    winner_camp: str
    winner_players: List[str] = field(default_factory=list)
    end_reason: str = ''
    total_actions: int = 0
    total_damage_dealt: int = 0
    total_healing: int = 0
    kills_count: Dict[str, int] = field(default_factory=dict)
    game_log: List[Dict[str, Any]] = field(default_factory=list)
    chat_messages: List[Dict[str, Any]] = field(default_factory=list)
    final_state: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CharacterStats:
    """Character-specific statistics"""
    character_name: str
    games_played: int = 0
    wins: int = 0
    losses: int = 0
    total_damage_dealt: int = 0
    kills: int = 0
    
    @property
    def win_rate(self) -> float:
        return self.wins / self.games_played if self.games_played > 0 else 0.0
    
    @property
    def average_damage_per_game(self) -> float:
        return self.total_damage_dealt / self.games_played if self.games_played > 0 else 0.0


@dataclass
class CampStats:
    """Camp-specific statistics"""
    camp_name: str
    games_played: int = 0
    wins: int = 0
    
    @property
    def win_rate(self) -> float:
        return self.wins / self.games_played if self.games_played > 0 else 0.0


@dataclass
class PlayerStats:
    """Player cumulative statistics"""
    account: str
    trip_display: str = ''
    total_games: int = 0
    wins: int = 0
    losses: int = 0
    draws: int = 0
    boomed_count: int = 0
    
    character_stats: Dict[str, CharacterStats] = field(default_factory=dict)
    camp_stats: Dict[str, CampStats] = field(default_factory=dict)
    
    cards_used: Dict[str, int] = field(default_factory=dict)
    cards_equipped: Dict[str, int] = field(default_factory=dict)
    
    average_duration_per_game: float = 0.0
    last_played: str = ''
    created_date: str = ''
    
    skill_level: str = 'Beginner'  # 'Beginner', 'Intermediate', 'Advanced', 'Expert'
    
    @property
    def win_rate(self) -> float:
        return self.wins / self.total_games if self.total_games > 0 else 0.0


@dataclass
class LeaderboardEntry:
    """Leaderboard entry"""
    rank: int
    player_id: str
    player_name: str
    sorting_key: str  # 'win_rate', 'total_wins', 'games_played'
    value: float
    trend: str = 'stable'  # 'up', 'down', 'stable'
    last_update: str = ''


@dataclass
class RoomGameHistory:
    """Room game history"""
    room_id: int
    room_name: str = ''
    room_created_date: str = ''
    games: List[GameRecord] = field(default_factory=list)
    
    @property
    def total_games(self) -> int:
        return len(self.games)


class GameRecordStore:
    """Game record storage with in-memory cache and SQLite persistence"""
    leaderboards: Dict[str, Any]
    
    def __init__(self, db_path: Optional[str] = None):
        self.game_records: Dict[str, GameRecord] = {}
        self.player_stats: Dict[str, PlayerStats] = {}
        self.room_histories: Dict[int, RoomGameHistory] = {}
        self.trip_registrations: Dict[str, TripRegistration] = {}
        self.rating_records: List[TripRatingRecord] = []
        self.leaderboards: Dict[str, Any] = {
            'global': [],
            'by_room': {},
        }
        default_db_path = os.path.join(os.path.dirname(__file__), 'data', 'shadowhunters.db')
        self.db_path = str(db_path or os.getenv('SHADOWHUNTERS_DB_PATH') or default_db_path)
        self._setup_database()
        self._load_from_database()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    def _setup_database(self):
        db_dir = os.path.dirname(self.db_path)
        if db_dir:
            os.makedirs(db_dir, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS game_records (
                    record_id TEXT PRIMARY KEY,
                    room_id INTEGER NOT NULL,
                    game_date TEXT NOT NULL,
                    payload_json TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS trip_registrations (
                    trip TEXT PRIMARY KEY,
                    password_hash TEXT NOT NULL,
                    created_date TEXT NOT NULL,
                    updated_date TEXT NOT NULL,
                    registration_index INTEGER NOT NULL DEFAULT 0,
                    trip_encrypted INTEGER NOT NULL DEFAULT 1
                )
                """
            )
            columns = [str(row[1]) for row in conn.execute("PRAGMA table_info(trip_registrations)")]
            if 'registration_index' not in columns:
                conn.execute(
                    """
                    ALTER TABLE trip_registrations
                    ADD COLUMN registration_index INTEGER NOT NULL DEFAULT 0
                    """
                )
            if 'trip_encrypted' not in columns:
                conn.execute(
                    """
                    ALTER TABLE trip_registrations
                    ADD COLUMN trip_encrypted INTEGER NOT NULL DEFAULT 0
                    """
                )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS rating_records (
                    record_id TEXT PRIMARY KEY,
                    room_id INTEGER NOT NULL,
                    source_trip TEXT NOT NULL,
                    target_trip TEXT NOT NULL,
                    rating INTEGER NOT NULL,
                    comment TEXT NOT NULL,
                    created_date TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS app_counters (
                    counter_key TEXT PRIMARY KEY,
                    next_value INTEGER NOT NULL
                )
                """
            )
            # 2026-10-13：玩家問題回報。report_token 是給回報者本人記錄查詢用的
            # 亂碼編號（不是循序編號，避免被人把編號改一改就能偷看到別人的回報），
            # room_state_snapshot_json 是從房間裡回報時順手存下來的當下房間快照，
            # 方便之後重現問題，只給開發者看，不會回給回報者本人。
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS bug_reports (
                    report_token TEXT PRIMARY KEY,
                    created_date TEXT NOT NULL,
                    nickname TEXT NOT NULL,
                    category TEXT NOT NULL,
                    description TEXT NOT NULL,
                    room_id INTEGER,
                    room_state_snapshot_json TEXT,
                    status TEXT NOT NULL DEFAULT 'open',
                    resolution_note TEXT,
                    resolved_date TEXT
                )
                """
            )
            # 2026-10-14：回報時可以選填 Trip（存加密後的公開 Trip 標籤，不存使用者
            # 輸入的原始密語，跟遊戲裡其他地方比對 Trip 的規則一致），填了之後之後可以
            # 直接用 Trip 查詢自己回報過的所有內容，不用記回報編號。舊資料庫可能還沒有
            # 這個欄位，用 PRAGMA table_info 檢查，沒有就補一個 ALTER TABLE。
            bug_report_columns = [str(row[1]) for row in conn.execute('PRAGMA table_info(bug_reports)')]
            if 'trip' not in bug_report_columns:
                conn.execute("ALTER TABLE bug_reports ADD COLUMN trip TEXT NOT NULL DEFAULT ''")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_bug_reports_trip ON bug_reports(trip)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_bug_reports_created_date ON bug_reports(created_date)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_game_records_room_id ON game_records(room_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_game_records_game_date ON game_records(game_date)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rating_records_room_id ON rating_records(room_id)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_rating_records_target_trip ON rating_records(target_trip)")

    def _player_record_to_dict(self, player: PlayerRecord) -> Dict[str, Any]:
        return {
            'player_id': player.player_id,
            'player_name': player.player_name,
            'character_name': player.character_name,
            'character_camp': player.character_camp,
            'is_alive': bool(player.is_alive),
            'final_hp': int(player.final_hp),
            'damage_taken': int(player.damage_taken),
            'cards_played': int(player.cards_played),
            'trip_display': str(player.trip_display or ''),
            'account_password_hash': str(player.account_password_hash or ''),
            'avatar_no': int(getattr(player, 'avatar_no', 1) or 1),
            'cards_equipped': list(player.cards_equipped or []),
            'boomed': bool(getattr(player, 'boomed', False)),
        }

    def _player_record_from_dict(self, row: Dict[str, Any]) -> PlayerRecord:
        return PlayerRecord(
            player_id=str(row.get('player_id') or ''),
            player_name=str(row.get('player_name') or ''),
            character_name=str(row.get('character_name') or ''),
            character_camp=str(row.get('character_camp') or ''),
            is_alive=bool(row.get('is_alive', False)),
            final_hp=int(row.get('final_hp') or 0),
            damage_taken=int(row.get('damage_taken') or 0),
            cards_played=int(row.get('cards_played') or 0),
            trip_display=str(row.get('trip_display') or ''),
            account_password_hash=str(row.get('account_password_hash') or ''),
            avatar_no=int(row.get('avatar_no') or 1),
            cards_equipped=list(row.get('cards_equipped') or []),
            boomed=bool(row.get('boomed', False)),
        )

    def _game_record_to_dict(self, record: GameRecord) -> Dict[str, Any]:
        return {
            'record_id': record.record_id,
            'room_id': int(record.room_id),
            'game_date': record.game_date,
            'game_duration_seconds': int(record.game_duration_seconds),
            'game_settings': dict(record.game_settings or {}),
            'players': [self._player_record_to_dict(player) for player in (record.players or [])],
            'winner_camp': str(record.winner_camp or ''),
            'winner_players': list(record.winner_players or []),
            'end_reason': str(record.end_reason or ''),
            'total_actions': int(record.total_actions or 0),
            'total_damage_dealt': int(record.total_damage_dealt or 0),
            'total_healing': int(record.total_healing or 0),
            'kills_count': dict(record.kills_count or {}),
            'game_log': list(record.game_log or []),
            'chat_messages': list(getattr(record, 'chat_messages', []) or []),
            'final_state': dict(getattr(record, 'final_state', {}) or {}),
        }

    def _game_record_from_dict(self, row: Dict[str, Any]) -> GameRecord:
        return GameRecord(
            record_id=str(row.get('record_id') or ''),
            room_id=int(row.get('room_id') or 0),
            game_date=str(row.get('game_date') or ''),
            game_duration_seconds=int(row.get('game_duration_seconds') or 0),
            game_settings=dict(row.get('game_settings') or {}),
            players=[self._player_record_from_dict(player_row) for player_row in (row.get('players') or [])],
            winner_camp=str(row.get('winner_camp') or ''),
            winner_players=list(row.get('winner_players') or []),
            end_reason=str(row.get('end_reason') or ''),
            total_actions=int(row.get('total_actions') or 0),
            total_damage_dealt=int(row.get('total_damage_dealt') or 0),
            total_healing=int(row.get('total_healing') or 0),
            kills_count=dict(row.get('kills_count') or {}),
            game_log=list(row.get('game_log') or []),
            chat_messages=list(row.get('chat_messages') or []),
            final_state=dict(row.get('final_state') or {}),
        )

    def _persist_game_record(self, record: GameRecord):
        payload_json = json.dumps(self._game_record_to_dict(record), ensure_ascii=False)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO game_records (record_id, room_id, game_date, payload_json)
                VALUES (?, ?, ?, ?)
                """,
                (
                    record.record_id,
                    int(record.room_id),
                    str(record.game_date or ''),
                    payload_json,
                ),
            )

    def _persist_all_game_records(self):
        with self._connect() as conn:
            conn.execute("DELETE FROM game_records")
            rows = [
                (
                    record.record_id,
                    int(record.room_id),
                    str(record.game_date or ''),
                    json.dumps(self._game_record_to_dict(record), ensure_ascii=False),
                )
                for record in self.game_records.values()
            ]
            if rows:
                conn.executemany(
                    """
                    INSERT INTO game_records (record_id, room_id, game_date, payload_json)
                    VALUES (?, ?, ?, ?)
                    """,
                    rows,
                )

    def _persist_trip_registration(self, registration: TripRegistration):
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO trip_registrations (trip, password_hash, created_date, updated_date, registration_index, trip_encrypted)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    registration.trip,
                    registration.password_hash,
                    registration.created_date,
                    registration.updated_date,
                    int(getattr(registration, 'registration_index', 0) or 0),
                    1 if bool(getattr(registration, 'trip_encrypted', True)) else 0,
                ),
            )

    def _persist_all_trip_registrations(self):
        with self._connect() as conn:
            conn.execute("DELETE FROM trip_registrations")
            rows = [
                (
                    registration.trip,
                    registration.password_hash,
                    registration.created_date,
                    registration.updated_date,
                    int(getattr(registration, 'registration_index', 0) or 0),
                    1 if bool(getattr(registration, 'trip_encrypted', True)) else 0,
                )
                for registration in self.trip_registrations.values()
            ]
            if rows:
                conn.executemany(
                    """
                    INSERT INTO trip_registrations (trip, password_hash, created_date, updated_date, registration_index, trip_encrypted)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )

    def _set_counter_seed(self, key: str, next_value: int):
        safe_next = max(1, int(next_value or 1))
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO app_counters (counter_key, next_value)
                VALUES (?, ?)
                ON CONFLICT(counter_key) DO UPDATE SET
                  next_value = CASE
                    WHEN app_counters.next_value >= excluded.next_value THEN app_counters.next_value
                    ELSE excluded.next_value
                  END
                """,
                (str(key), safe_next),
            )

    def _allocate_counter_value(self, key: str) -> int:
        counter_key = str(key)
        with self._connect() as conn:
            conn.execute('BEGIN IMMEDIATE')
            row = conn.execute(
                "SELECT next_value FROM app_counters WHERE counter_key = ?",
                (counter_key,),
            ).fetchone()
            if row is None:
                allocated = 1
                conn.execute(
                    "INSERT INTO app_counters (counter_key, next_value) VALUES (?, ?)",
                    (counter_key, 2),
                )
                return allocated

            allocated = max(1, int(row[0] or 1))
            conn.execute(
                "UPDATE app_counters SET next_value = ? WHERE counter_key = ?",
                (allocated + 1, counter_key),
            )
            return allocated

    def _backfill_trip_registration_indices(self):
        registrations = sorted(
            self.trip_registrations.values(),
            key=lambda row: (str(getattr(row, 'created_date', '') or ''), str(getattr(row, 'trip', '') or '')),
        )
        current_max = 0
        for row in registrations:
            idx = int(getattr(row, 'registration_index', 0) or 0)
            if idx > current_max:
                current_max = idx

        changed = False
        for row in registrations:
            idx = int(getattr(row, 'registration_index', 0) or 0)
            if idx > 0:
                continue
            current_max += 1
            row.registration_index = current_max
            changed = True

        if changed:
            self._persist_all_trip_registrations()

        self._set_counter_seed('trip_registration_index', current_max + 1)

    def _initialize_counters(self):
        max_room_id = 0
        for record in self.game_records.values():
            max_room_id = max(max_room_id, int(getattr(record, 'room_id', 0) or 0))
        self._set_counter_seed('room_id', max_room_id + 1)
        self._backfill_trip_registration_indices()

    def _persist_rating_record(self, rating_row: TripRatingRecord):
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO rating_records
                (record_id, room_id, source_trip, target_trip, rating, comment, created_date)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    rating_row.record_id,
                    int(rating_row.room_id),
                    str(rating_row.source_trip or ''),
                    str(rating_row.target_trip or ''),
                    int(rating_row.rating or 0),
                    str(rating_row.comment or ''),
                    str(rating_row.created_date or ''),
                ),
            )

    def _persist_all_rating_records(self):
        with self._connect() as conn:
            conn.execute("DELETE FROM rating_records")
            rows = [
                (
                    rating_row.record_id,
                    int(rating_row.room_id),
                    str(rating_row.source_trip or ''),
                    str(rating_row.target_trip or ''),
                    int(rating_row.rating or 0),
                    str(rating_row.comment or ''),
                    str(rating_row.created_date or ''),
                )
                for rating_row in self.rating_records
            ]
            if rows:
                conn.executemany(
                    """
                    INSERT INTO rating_records
                    (record_id, room_id, source_trip, target_trip, rating, comment, created_date)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    rows,
                )

    def _rebuild_room_histories(self):
        self.room_histories.clear()
        sorted_records = sorted(self.game_records.values(), key=lambda row: row.game_date)
        for game_record in sorted_records:
            self.add_game_to_room_history(game_record.room_id, game_record)

    def _load_from_database(self):
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            trip_rows_need_resave = False

            for row in conn.execute(
                "SELECT trip, password_hash, created_date, updated_date, registration_index, trip_encrypted FROM trip_registrations ORDER BY created_date ASC"
            ):
                stored_trip = str(row['trip'] or '').strip()
                if not stored_trip:
                    continue
                stored_encrypted = bool(int(row['trip_encrypted'] or 0))
                trip_key = stored_trip if stored_encrypted else self.encrypt_trip_like_higu(stored_trip)
                if not trip_key:
                    continue
                registration = TripRegistration(
                    trip=trip_key,
                    password_hash=str(row['password_hash'] or ''),
                    created_date=str(row['created_date'] or ''),
                    updated_date=str(row['updated_date'] or ''),
                    registration_index=int(row['registration_index'] or 0),
                    trip_encrypted=True,
                )
                existing = self.trip_registrations.get(trip_key)
                if existing is None or int(getattr(registration, 'registration_index', 0) or 0) >= int(getattr(existing, 'registration_index', 0) or 0):
                    self.trip_registrations[trip_key] = registration
                if (not stored_encrypted) or trip_key != stored_trip:
                    trip_rows_need_resave = True

            for row in conn.execute(
                "SELECT record_id, payload_json FROM game_records ORDER BY game_date ASC"
            ):
                try:
                    payload = json.loads(str(row['payload_json'] or '{}'))
                    game_record = self._game_record_from_dict(payload)
                except Exception:
                    continue
                if not game_record.record_id:
                    game_record.record_id = str(row['record_id'] or '')
                if game_record.record_id:
                    self.game_records[game_record.record_id] = game_record

            for row in conn.execute(
                """
                SELECT record_id, room_id, source_trip, target_trip, rating, comment, created_date
                FROM rating_records
                ORDER BY created_date ASC
                """
            ):
                self.rating_records.append(
                    TripRatingRecord(
                        record_id=str(row['record_id'] or ''),
                        room_id=int(row['room_id'] or 0),
                        source_trip=str(row['source_trip'] or ''),
                        target_trip=str(row['target_trip'] or ''),
                        rating=int(row['rating'] or 0),
                        comment=str(row['comment'] or ''),
                        created_date=str(row['created_date'] or ''),
                    )
                )

        if trip_rows_need_resave:
            self._persist_all_trip_registrations()

        self._rebuild_room_histories()
        self.rebuild_player_stats()
        self._initialize_counters()

    def hash_trip_password(self, password: str) -> str:
        return hashlib.sha256(str(password or '').encode('utf-8')).hexdigest()

    def hash_account_password(self, account: str, password: str) -> str:
        raw = f"{str(account or '').strip()}\0{str(password or '')}"
        return hashlib.sha256(raw.encode('utf-8')).hexdigest()

    def encrypt_trip_like_higu(self, trip: str) -> str:
        trip_key = str(trip or '').strip()
        if not trip_key:
            return ''
        sha1_hex = hashlib.sha1(trip_key.encode('utf-8')).hexdigest()
        encoded = base64.b64encode(sha1_hex.encode('ascii')).decode('ascii')
        return encoded[1:9]

    def to_trip_display(self, trip: str) -> str:
        trip_key = str(trip or '').strip()
        if not trip_key:
            return ''
        if trip_key in self.trip_registrations:
            return trip_key
        if any(str(stats.trip_display or '').strip() == trip_key for stats in self.player_stats.values()):
            return trip_key
        return self.encrypt_trip_like_higu(trip_key)

    def has_trip_registration(self, trip: str) -> bool:
        trip_key = self.to_trip_display(trip)
        if not trip_key:
            return False
        if trip_key in self.trip_registrations:
            return True
        return any(str(stats.trip_display or '').strip() == trip_key for stats in self.player_stats.values())

    def has_explicit_trip_registration(self, trip: str) -> bool:
        """Return True only when TRIP exists in registration table (supports raw/encrypted lookup)."""
        trip_key = self.to_trip_display(trip)
        if not trip_key:
            return False
        return trip_key in self.trip_registrations

    def get_registered_trip_display(self, raw_trip: str) -> str:
        """把「原始、未加密」的 TRIP 密語加密後，如果這個加密值已經登記過，回傳
        這個加密後的公開 TRIP 標籤；沒登記過（或輸入是空字串）回傳空字串。

        故意只接受原始密語，用 encrypt_trip_like_higu() 直接加密後比對，不走
        to_trip_display() 那種「輸入本身可能已經是加密值」的雙模式正規化——否則
        只要有人看過別人公開顯示的 TRIP 標籤（例如在 TRIP 一覽、玩家卡上），直接
        拿那個標籤當輸入，也會被誤判成「這是我的 TRIP」，沒有真正驗證到密語本身。
        這裡刻意不檢查密碼，只確認「這組密語確實對應到一個已登記的 TRIP」，給那些
        不需要密碼等級保護、只需要證明「知道這組密語」的情境使用（例如問題回報、
        上傳頭像）。
        """
        trip_key = self.encrypt_trip_like_higu(raw_trip)
        if not trip_key:
            return ''
        if trip_key not in self.trip_registrations:
            return ''
        return trip_key

    def verify_trip_password(self, trip: str, password: str) -> bool:
        trip_key = self.to_trip_display(trip)
        registration = self.trip_registrations.get(trip_key)
        if not registration:
            return False
        return registration.password_hash == self.hash_trip_password(password)

    def register_trip(self, trip: str, password: str) -> str:
        raw_trip = str(trip or '').strip()
        trip_key = self.encrypt_trip_like_higu(raw_trip)
        if not trip_key:
            raise ValueError('TRIP is required')
        if not str(password or ''):
            raise ValueError('password is required')

        password_hash = self.hash_trip_password(password)
        existing = self.trip_registrations.get(trip_key)
        now = datetime.now().isoformat()
        if existing:
            if existing.password_hash != password_hash:
                raise ValueError('TRIP password mismatch')
            existing.updated_date = now
            self._persist_trip_registration(existing)
            return 'verified'

        self.trip_registrations[trip_key] = TripRegistration(
            trip=trip_key,
            password_hash=password_hash,
            created_date=now,
            updated_date=now,
            registration_index=self._allocate_counter_value('trip_registration_index'),
            trip_encrypted=True,
        )
        self._persist_trip_registration(self.trip_registrations[trip_key])
        return 'registered'

    def change_trip_registration(self, old_trip: str, old_password: str, new_trip: str, new_password: str) -> None:
        old_trip_key = self.to_trip_display(old_trip)
        new_trip_key = self.encrypt_trip_like_higu(new_trip)
        if not old_trip_key or not new_trip_key:
            raise ValueError('old_trip and new_trip are required')
        if not str(new_password or ''):
            raise ValueError('new password is required')
        if not self.verify_trip_password(old_trip_key, old_password):
            raise ValueError('old TRIP verification failed')
        if new_trip_key != old_trip_key and self.has_trip_registration(new_trip_key):
            raise ValueError('new TRIP already exists')

        registration = self.trip_registrations.pop(old_trip_key)
        registration.trip = new_trip_key
        registration.password_hash = self.hash_trip_password(new_password)
        registration.updated_date = datetime.now().isoformat()
        registration.registration_index = int(getattr(registration, 'registration_index', 0) or 0)
        registration.trip_encrypted = True
        self.trip_registrations[new_trip_key] = registration

        for game_record in self.game_records.values():
            for player_record in game_record.players:
                if str(player_record.trip_display or '').strip() == old_trip_key:
                    player_record.trip_display = new_trip_key

        for rating_record in self.rating_records:
            if str(rating_record.source_trip or '').strip() == old_trip_key:
                rating_record.source_trip = new_trip_key
            if str(rating_record.target_trip or '').strip() == old_trip_key:
                rating_record.target_trip = new_trip_key

        self._persist_all_trip_registrations()
        self._persist_all_game_records()
        self._persist_all_rating_records()

        self.rebuild_player_stats()

    def count_trip_games(self, trip: str) -> int:
        trip_key = self.to_trip_display(trip)
        if not trip_key:
            return 0

        count = 0
        for game_record in self.game_records.values():
            if any(str(player.trip_display or '').strip() == trip_key for player in game_record.players):
                count += 1
        return count

    def get_trip_nicknames(self, trip: str) -> List[str]:
        trip_key = self.to_trip_display(trip)
        nicknames = {
            str(player.player_name or '').strip()
            for game_record in self.game_records.values()
            for player in game_record.players
            if str(player.trip_display or '').strip() == trip_key and str(player.player_name or '').strip()
        }
        return sorted(nicknames)

    def get_trip_nickname_counts(self, trip: str) -> List[Dict[str, Any]]:
        trip_key = self.to_trip_display(trip)
        counter = Counter(
            str(player.player_name or '').strip()
            for game_record in self.game_records.values()
            for player in game_record.players
            if str(player.trip_display or '').strip() == trip_key and str(player.player_name or '').strip()
        )
        rows = [
            {
                'nickname': nickname,
                'use_count': int(use_count),
            }
            for nickname, use_count in counter.items()
        ]
        rows.sort(key=lambda row: (-int(row['use_count']), row['nickname']))
        for index, row in enumerate(rows, start=1):
            row['index'] = index
        return rows

    def get_trip_game_rating_score(self, trip: str, room_id: int) -> int:
        trip_key = self.to_trip_display(trip)
        total = 0
        for row in self.rating_records:
            if str(row.target_trip or '').strip() != trip_key:
                continue
            if int(row.room_id or 0) != int(room_id or 0):
                continue
            total += int(row.rating or 0)
        return total

    def get_trip_ratings(self, trip: str, limit: int = 100) -> List[TripRatingRecord]:
        trip_key = self.to_trip_display(trip)
        rows = [row for row in self.rating_records if str(row.target_trip or '').strip() == trip_key]
        rows.sort(key=lambda row: row.created_date, reverse=True)
        return rows[: max(1, min(limit, 300))]

    def add_trip_rating(self, row: TripRatingRecord) -> str:
        self.rating_records.append(row)
        self._persist_rating_record(row)
        return row.record_id

    def add_bug_report(
        self,
        nickname: str,
        category: str,
        description: str,
        room_id: Optional[int] = None,
        room_state_snapshot_json: str = '',
        trip: str = '',
    ) -> str:
        """新增一筆玩家問題回報，回傳給回報者本人記錄查詢用的回報編號。

        回報編號是隨機產生的亂碼（不是從 1 開始數的循序編號），避免別人把編號改一改
        就能看到別人回報的內容；理論上幾乎不會撞號，但還是在撞號時重試幾次。

        trip 這裡收到的應該已經是加密後的公開 Trip 標籤（跟遊戲裡其他地方一樣，由
        呼叫端在上層把使用者輸入的原始密語加密過），這個方法本身不做加密，只負責存。
        不填就是空字串，代表這筆回報沒有關聯任何 Trip。
        """
        created_date = datetime.now().isoformat()
        last_error: Optional[Exception] = None
        for _ in range(5):
            token = uuid.uuid4().hex[:8].upper()
            try:
                with self._connect() as conn:
                    conn.execute(
                        """
                        INSERT INTO bug_reports
                        (report_token, created_date, nickname, category, description, room_id, room_state_snapshot_json, status, resolution_note, resolved_date, trip)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', NULL, NULL, ?)
                        """,
                        (
                            token,
                            created_date,
                            str(nickname or ''),
                            str(category or ''),
                            str(description or ''),
                            int(room_id) if room_id is not None else None,
                            str(room_state_snapshot_json or ''),
                            str(trip or ''),
                        ),
                    )
                return token
            except sqlite3.IntegrityError as exc:
                last_error = exc
                continue
        raise RuntimeError('failed to allocate a unique bug report token') from last_error

    def list_bug_reports(self, status_filter: Optional[str] = None) -> List[Dict[str, Any]]:
        """撈出所有問題回報，給 Mike 在後台頁面查看用，按時間新到舊排序。這裡故意
        連 room_state_snapshot_json 都一起回傳——跟 get_bug_report() 給回報者本人用
        的那份不同，後台頁面是開發者在用，需要看得到除錯用的房間快照。"""
        query = (
            'SELECT report_token, created_date, nickname, category, description, '
            'room_id, room_state_snapshot_json, status, resolution_note, resolved_date, trip '
            'FROM bug_reports'
        )
        params: tuple = ()
        normalized_status = str(status_filter or '').strip()
        if normalized_status:
            query += ' WHERE status = ?'
            params = (normalized_status,)
        query += ' ORDER BY created_date DESC'
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(query, params).fetchall()
        return [
            {
                'report_token': row['report_token'],
                'created_date': row['created_date'],
                'nickname': row['nickname'],
                'category': row['category'],
                'description': row['description'],
                'room_id': row['room_id'],
                'room_state_snapshot_json': row['room_state_snapshot_json'] or '',
                'status': row['status'],
                'resolution_note': row['resolution_note'] or '',
                'resolved_date': row['resolved_date'] or '',
                'trip': row['trip'] or '',
            }
            for row in rows
        ]

    def list_bug_reports_by_trip(self, trip_display: str) -> List[Dict[str, Any]]:
        """依加密後的公開 Trip 標籤，撈出這個 Trip 回報過的所有問題（按時間新到舊），
        給回報者本人在查詢頁面用——不需要記住每一筆的回報編號。跟 get_bug_report()
        一樣故意不回傳 room_state_snapshot_json（那是給開發者看的除錯資料）。
        trip_display 是空字串就直接回傳空清單，不去查全部掛空 Trip 的回報（那些是
        沒有填 Trip 的回報，不屬於任何人）。"""
        normalized_trip = str(trip_display or '').strip()
        if not normalized_trip:
            return []
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            rows = conn.execute(
                """
                SELECT report_token, created_date, nickname, category, description,
                       room_id, status, resolution_note, resolved_date
                FROM bug_reports WHERE trip = ? ORDER BY created_date DESC
                """,
                (normalized_trip,),
            ).fetchall()
        return [
            {
                'report_token': row['report_token'],
                'created_date': row['created_date'],
                'nickname': row['nickname'],
                'category': row['category'],
                'description': row['description'],
                'room_id': row['room_id'],
                'status': row['status'],
                'resolution_note': row['resolution_note'] or '',
                'resolved_date': row['resolved_date'] or '',
            }
            for row in rows
        ]

    def update_bug_report(
        self,
        report_token: str,
        status: Optional[str] = None,
        resolution_note: Optional[str] = None,
    ) -> bool:
        """Mike 在後台頁面更新一筆問題回報的處理狀態／備註。status 給 None 代表這次
        不改狀態，resolution_note 給 None 代表這次不改備註（給空字串則是清空備註）。
        狀態改成 resolved 時順手記一次 resolved_date；改回其他狀態就把 resolved_date
        清掉，避免卡著一個跟目前狀態不符的舊處理時間。找不到這個回報編號回傳 False。"""
        token = str(report_token or '').strip().upper()
        if not token:
            return False
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                'SELECT report_token FROM bug_reports WHERE report_token = ?', (token,)
            ).fetchone()
            if not row:
                return False
            fields: List[str] = []
            params: List[Any] = []
            if status is not None:
                normalized_status = str(status).strip()
                fields.append('status = ?')
                params.append(normalized_status)
                if normalized_status == 'resolved':
                    fields.append('resolved_date = ?')
                    params.append(datetime.now().isoformat())
                else:
                    fields.append('resolved_date = NULL')
            if resolution_note is not None:
                fields.append('resolution_note = ?')
                params.append(str(resolution_note))
            if fields:
                params.append(token)
                conn.execute(f"UPDATE bug_reports SET {', '.join(fields)} WHERE report_token = ?", params)
        return True

    def get_bug_report(self, report_token: str) -> Optional[Dict[str, Any]]:
        """依回報編號查詢一筆問題回報；故意不回傳 room_state_snapshot_json 給呼叫端
        （那是給開發者看的除錯用資料，不是回報者本人需要看到的東西）。"""
        token = str(report_token or '').strip().upper()
        if not token:
            return None
        with self._connect() as conn:
            conn.row_factory = sqlite3.Row
            row = conn.execute(
                """
                SELECT report_token, created_date, nickname, category, description,
                       room_id, status, resolution_note, resolved_date
                FROM bug_reports WHERE report_token = ?
                """,
                (token,),
            ).fetchone()
        if not row:
            return None
        return {
            'report_token': row['report_token'],
            'created_date': row['created_date'],
            'nickname': row['nickname'],
            'category': row['category'],
            'description': row['description'],
            'room_id': row['room_id'],
            'status': row['status'],
            'resolution_note': row['resolution_note'] or '',
            'resolved_date': row['resolved_date'] or '',
        }

    def reassign_trip_by_account(self, target_trip: str, account: str, account_password: str, room_id: Optional[int] = None, *, only_unassigned: bool) -> int:
        trip_key = self.to_trip_display(target_trip)
        account_key = str(account or '').strip()
        if not trip_key or not account_key or not str(account_password or ''):
            raise ValueError('trip/account/password are required')

        password_hash = self.hash_account_password(account_key, account_password)
        updated = 0
        for game_record in self.game_records.values():
            if room_id is not None and int(game_record.room_id) != int(room_id):
                continue
            for player_record in game_record.players:
                if str(player_record.player_id or '').strip() != account_key:
                    continue
                if str(player_record.account_password_hash or '') != password_hash:
                    continue
                has_trip = bool(str(player_record.trip_display or '').strip())
                if only_unassigned and has_trip:
                    continue
                if not only_unassigned and not has_trip:
                    continue
                player_record.trip_display = trip_key
                self._sync_final_state_trip_for_account(game_record, account_key, trip_key)
                updated += 1

        if updated:
            self._persist_all_game_records()
            self.rebuild_player_stats()
        return updated

    def clear_trip_records_by_nickname(self, target_trip: str, nickname: str, room_id: Optional[int] = None) -> int:
        trip_key = self.to_trip_display(target_trip)
        nickname_key = str(nickname or '').strip()
        if not trip_key or not nickname_key:
            raise ValueError('trip and nickname are required')

        updated = 0
        for game_record in self.game_records.values():
            if room_id is not None and int(game_record.room_id) != int(room_id):
                continue
            for player_record in game_record.players:
                if str(player_record.player_name or '').strip() != nickname_key:
                    continue
                if str(player_record.trip_display or '').strip() != trip_key:
                    continue
                player_record.trip_display = ''
                self._sync_final_state_trip_for_account(game_record, str(player_record.player_id or '').strip(), '')
                updated += 1

        if updated:
            self._persist_all_game_records()
            self.rebuild_player_stats()
        return updated

    def _sync_final_state_trip_for_account(self, game_record: GameRecord, account: str, trip_display: str) -> None:
        final_state = getattr(game_record, 'final_state', None)
        if not isinstance(final_state, dict):
            return
        players_map = final_state.get('players')
        if not isinstance(players_map, dict):
            return

        account_key = str(account or '').strip()
        if not account_key:
            return

        target_row = players_map.get(account_key)
        if isinstance(target_row, dict):
            target_row['trip_display'] = str(trip_display or '')
            players_map[account_key] = target_row
            final_state['players'] = players_map
            game_record.final_state = final_state

    def rebuild_player_stats(self):
        self.player_stats.clear()
        for game_record in sorted(self.game_records.values(), key=lambda row: row.game_date):
            for player_record in game_record.players:
                self.update_player_stats(player_record.player_id, game_record, player_record)
        self.update_leaderboards()
    
    # ===== Game Record Methods =====
    
    def save_game_record(self, record: GameRecord) -> str:
        """Save a game record"""
        self.game_records[record.record_id] = record
        self._persist_game_record(record)
        return record.record_id
    
    def get_game_record(self, record_id: str) -> Optional[GameRecord]:
        """Get a game record by ID"""
        return self.game_records.get(record_id)
    
    def get_player_games(self, account: str) -> List[GameRecord]:
        """Get all games where player participated"""
        return [r for r in self.game_records.values() 
                if account in [p.player_id for p in r.players]]
    
    def get_room_games(self, room_id: int) -> List[GameRecord]:
        """Get all games in a room"""
        return [r for r in self.game_records.values() if r.room_id == room_id]

    def append_chat_message_to_latest_room_record(self, room_id: int, message: Dict[str, Any]) -> bool:
        """Append a chat/system message to the latest saved record of a room and persist it."""
        rid = int(room_id or 0)
        if rid <= 0 or not isinstance(message, dict):
            return False

        room_records = [r for r in self.game_records.values() if int(getattr(r, 'room_id', 0) or 0) == rid]
        if not room_records:
            return False

        latest_record = max(room_records, key=lambda row: str(getattr(row, 'game_date', '') or ''))

        normalized_message = {
            'id': int(message.get('id', 0) or 0),
            'type': str(message.get('type', 'chat') or 'chat'),
            'account': str(message.get('account', '') or ''),
            'name': str(message.get('name', '') or ''),
            'text': str(message.get('text', '') or ''),
            'timestamp': int(message.get('timestamp', 0) or 0),
        }
        if not normalized_message['text']:
            return False

        latest_messages = list(getattr(latest_record, 'chat_messages', []) or [])
        if any(
            int(row.get('id', 0) or 0) == normalized_message['id']
            and int(row.get('timestamp', 0) or 0) == normalized_message['timestamp']
            for row in latest_messages
            if isinstance(row, dict)
        ):
            return True

        latest_messages.append(normalized_message)
        latest_record.chat_messages = latest_messages

        final_state = getattr(latest_record, 'final_state', None)
        if isinstance(final_state, dict):
            fs_messages = list(final_state.get('chat_messages') or [])
            fs_messages.append(dict(normalized_message))
            final_state['chat_messages'] = fs_messages
            latest_record.final_state = final_state

        self._persist_game_record(latest_record)
        return True
    
    # ===== Player Stats Methods =====
    
    def update_player_stats(self, account: str, game_record: GameRecord, player_record: PlayerRecord):
        """Update player statistics based on game result"""
        stats = self.player_stats.get(account)
        if not stats:
            stats = PlayerStats(account=account, created_date=datetime.now().isoformat())

        if player_record.trip_display:
            stats.trip_display = player_record.trip_display

        is_boomed = bool(getattr(player_record, 'boomed', False))
        if is_boomed:
            stats.boomed_count += 1
        
        # Update basic stats
        stats.total_games += 1
        if not is_boomed:
            if account in game_record.winner_players:
                stats.wins += 1
            elif game_record.winner_camp == 'Draw':
                stats.draws += 1
            else:
                stats.losses += 1
        
        # Update character stats
        char_name = player_record.character_name
        if char_name not in stats.character_stats:
            stats.character_stats[char_name] = CharacterStats(character_name=char_name)
        char_stats = stats.character_stats[char_name]
        char_stats.games_played += 1
        if not is_boomed:
            if account in game_record.winner_players:
                char_stats.wins += 1
            else:
                char_stats.losses += 1
        char_stats.total_damage_dealt += game_record.kills_count.get(account, 0)
        char_stats.kills += game_record.kills_count.get(account, 0)
        
        # Update camp stats
        camp_name = player_record.character_camp
        if camp_name not in stats.camp_stats:
            stats.camp_stats[camp_name] = CampStats(camp_name=camp_name)
        camp_stats = stats.camp_stats[camp_name]
        camp_stats.games_played += 1
        if not is_boomed and account in game_record.winner_players:
            camp_stats.wins += 1
        
        # Update other stats
        stats.last_played = game_record.game_date
        stats.average_duration_per_game = (
            (stats.average_duration_per_game * (stats.total_games - 1) + game_record.game_duration_seconds) 
            / stats.total_games
        )
        
        # Update skill level based on win rate
        win_rate = stats.win_rate
        if stats.total_games >= 10:
            if win_rate >= 0.6:
                stats.skill_level = 'Expert'
            elif win_rate >= 0.5:
                stats.skill_level = 'Advanced'
            elif win_rate >= 0.4:
                stats.skill_level = 'Intermediate'
            else:
                stats.skill_level = 'Beginner'
        
        self.player_stats[account] = stats
    
    def get_player_stats(self, account: str) -> Optional[PlayerStats]:
        """Get player statistics"""
        return self.player_stats.get(account)
    
    def get_all_players_stats(self) -> List[PlayerStats]:
        """Get all player statistics"""
        return list(self.player_stats.values())
    
    # ===== Room History Methods =====
    
    def add_game_to_room_history(self, room_id: int, game_record: GameRecord):
        """Add game record to room history"""
        history = self.room_histories.get(room_id)
        if not history:
            history = RoomGameHistory(room_id=room_id, room_created_date=datetime.now().isoformat())
        history.games.append(game_record)
        self.room_histories[room_id] = history
    
    def get_room_history(self, room_id: int) -> Optional[RoomGameHistory]:
        """Get room game history"""
        return self.room_histories.get(room_id)
    
    def get_room_stats(self, room_id: int) -> Dict[str, Any]:
        """Get statistics for a specific room"""
        history = self.room_histories.get(room_id)
        if not history:
            return {}
        
        return {
            'room_id': room_id,
            'total_games': history.total_games,
            'games': [r.record_id for r in history.games]
        }
    
    # ===== Leaderboard Methods =====
    
    def update_leaderboards(self):
        """Update global and room leaderboards"""
        # Update global leaderboard
        self._update_global_leaderboard()
        
        # Update room leaderboards
        for room_id in self.room_histories.keys():
            self._update_room_leaderboard(room_id)
    
    def _update_global_leaderboard(self):
        """Update global leaderboard by win rate"""
        entries: List[LeaderboardEntry] = []
        for account, stats in self.player_stats.items():
            if stats.total_games >= 5:  # Minimum games requirement
                entry = LeaderboardEntry(
                    rank=0,  # Will be set after sorting
                    player_id=account,
                    player_name=stats.account,
                    sorting_key='win_rate',
                    value=stats.win_rate,
                    last_update=datetime.now().isoformat()
                )
                entries.append(entry)
        
        # Sort by win rate
        entries.sort(key=lambda x: x.value, reverse=True)
        for i, entry in enumerate(entries, 1):
            entry.rank = i
        
        self.leaderboards['global'] = entries
    
    def _update_room_leaderboard(self, room_id: int):
        """Update leaderboard for a specific room"""
        history = self.room_histories.get(room_id)
        if not history:
            return
        
        room_stats = {}
        for game_record in history.games:
            for player in game_record.players:
                if player.player_id not in room_stats:
                    room_stats[player.player_id] = {'games': 0, 'wins': 0}
                room_stats[player.player_id]['games'] += 1
                if player.player_id in game_record.winner_players:
                    room_stats[player.player_id]['wins'] += 1
        
        entries = []
        for account, stats in room_stats.items():
            if stats['games'] > 0:
                win_rate = stats['wins'] / stats['games']
                entry = LeaderboardEntry(
                    rank=0,
                    player_id=account,
                    player_name=account,
                    sorting_key='win_rate',
                    value=win_rate,
                    last_update=datetime.now().isoformat()
                )
                entries.append(entry)
        
        # Sort by win rate
        entries.sort(key=lambda x: x.value, reverse=True)
        for i, entry in enumerate(entries, 1):
            entry.rank = i
        
        by_room = self.leaderboards.get('by_room')
        if not isinstance(by_room, dict):
            by_room = {}
            self.leaderboards['by_room'] = by_room
        by_room[room_id] = entries
    
    def get_leaderboard(self, scope: str = 'global', room_id: Optional[int] = None) -> List[LeaderboardEntry]:
        """Get leaderboard"""
        if scope == 'global':
            global_board = self.leaderboards.get('global', [])
            return global_board if isinstance(global_board, list) else []
        elif scope == 'room' and room_id:
            by_room = self.leaderboards.get('by_room', {})
            if isinstance(by_room, dict):
                room_board = by_room.get(room_id, [])
                return room_board if isinstance(room_board, list) else []
            return []
        return []
    
    # ===== Export Methods =====
    
    def export_game_records_csv(self, output_path: str, account: Optional[str] = None):
        """Export game records to CSV"""
        records = self.get_player_games(account) if account else list(self.game_records.values())
        
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow([
                'record_id', 'room_id', 'game_date', 'duration_seconds', 
                'player_count', 'winner_camp', 'end_reason'
            ])
            for record in records:
                writer.writerow([
                    record.record_id,
                    record.room_id,
                    record.game_date,
                    record.game_duration_seconds,
                    len(record.players),
                    record.winner_camp,
                    record.end_reason
                ])
    
    def export_player_stats_json(self, output_path: str, account: str):
        """Export player statistics to JSON"""
        stats = self.get_player_stats(account)
        if not stats:
            return
        
        data = {
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
                    'average_damage_per_game': cs.average_damage_per_game
                }
                for char, cs in stats.character_stats.items()
            },
            'camp_stats': {
                camp: {
                    'games_played': cs.games_played,
                    'wins': cs.wins,
                    'win_rate': cs.win_rate
                }
                for camp, cs in stats.camp_stats.items()
            },
            'last_played': stats.last_played,
            'created_date': stats.created_date
        }
        
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
    
    def export_leaderboard_csv(self, output_path: str, scope: str = 'global', room_id: Optional[int] = None):
        """Export leaderboard to CSV"""
        leaderboard = self.get_leaderboard(scope, room_id)
        
        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['rank', 'player_id', 'player_name', 'sorting_key', 'value'])
            for entry in leaderboard:
                writer.writerow([
                    entry.rank,
                    entry.player_id,
                    entry.player_name,
                    entry.sorting_key,
                    f"{entry.value:.4f}"
                ])
    
    # ===== Utility Methods =====
    
    def get_summary_stats(self) -> Dict[str, Any]:
        """Get overall summary statistics"""
        return {
            'total_games_recorded': len(self.game_records),
            'total_players': len(self.player_stats),
            'total_rooms': len(self.room_histories),
            'average_games_per_player': (
                len(self.game_records) / len(self.player_stats) 
                if self.player_stats else 0
            )
        }
    
    def clear_all_data(self):
        """Clear all stored data (use with caution)"""
        self.game_records.clear()
        self.player_stats.clear()
        self.room_histories.clear()
        self.trip_registrations.clear()
        self.rating_records.clear()
        self.leaderboards = {'global': [], 'by_room': {}}
        with self._connect() as conn:
            conn.execute("DELETE FROM game_records")
            conn.execute("DELETE FROM trip_registrations")
            conn.execute("DELETE FROM rating_records")
            conn.execute("DELETE FROM app_counters")

    def allocate_room_id(self) -> int:
        """Allocate a persistent room id."""
        return self._allocate_counter_value('room_id')
