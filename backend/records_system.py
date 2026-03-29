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
    
    def __init__(self, db_path: Optional[str] = None):
        self.game_records: Dict[str, GameRecord] = {}
        self.player_stats: Dict[str, PlayerStats] = {}
        self.room_histories: Dict[int, RoomGameHistory] = {}
        self.trip_registrations: Dict[str, TripRegistration] = {}
        self.rating_records: List[TripRatingRecord] = []
        self.leaderboards: Dict[str, List[LeaderboardEntry]] = {
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
                    registration_index INTEGER NOT NULL DEFAULT 0
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
                INSERT OR REPLACE INTO trip_registrations (trip, password_hash, created_date, updated_date, registration_index)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    registration.trip,
                    registration.password_hash,
                    registration.created_date,
                    registration.updated_date,
                    int(getattr(registration, 'registration_index', 0) or 0),
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
                )
                for registration in self.trip_registrations.values()
            ]
            if rows:
                conn.executemany(
                    """
                    INSERT INTO trip_registrations (trip, password_hash, created_date, updated_date, registration_index)
                    VALUES (?, ?, ?, ?, ?)
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

            for row in conn.execute(
                "SELECT trip, password_hash, created_date, updated_date, registration_index FROM trip_registrations ORDER BY created_date ASC"
            ):
                trip_key = str(row['trip'] or '').strip()
                if not trip_key:
                    continue
                self.trip_registrations[trip_key] = TripRegistration(
                    trip=trip_key,
                    password_hash=str(row['password_hash'] or ''),
                    created_date=str(row['created_date'] or ''),
                    updated_date=str(row['updated_date'] or ''),
                    registration_index=int(row['registration_index'] or 0),
                )

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

        self._rebuild_room_histories()
        self.rebuild_player_stats()
        self._initialize_counters()

    def hash_trip_password(self, password: str) -> str:
        return hashlib.sha256(str(password or '').encode('utf-8')).hexdigest()

    def hash_account_password(self, account: str, password: str) -> str:
        raw = f"{str(account or '').strip()}\0{str(password or '')}"
        return hashlib.sha256(raw.encode('utf-8')).hexdigest()

    def has_trip_registration(self, trip: str) -> bool:
        trip_key = str(trip or '').strip()
        if not trip_key:
            return False
        if trip_key in self.trip_registrations:
            return True
        return any(str(stats.trip_display or '').strip() == trip_key for stats in self.player_stats.values())

    def has_explicit_trip_registration(self, trip: str) -> bool:
        """Return True only when TRIP exists in registration table (supports raw/encrypted lookup)."""
        trip_key = str(trip or '').strip()
        if not trip_key:
            return False
        if trip_key in self.trip_registrations:
            return True

        # Allow callers passing encrypted display TRIP by checking registered raw TRIPs.
        for registered_trip in self.trip_registrations.keys():
            raw = str(registered_trip or '').strip()
            if not raw:
                continue
            sha1_hex = hashlib.sha1(raw.encode('utf-8')).hexdigest()
            encoded = base64.b64encode(sha1_hex.encode('ascii')).decode('ascii')
            if encoded[1:9] == trip_key:
                return True
        return False

    def verify_trip_password(self, trip: str, password: str) -> bool:
        trip_key = str(trip or '').strip()
        registration = self.trip_registrations.get(trip_key)
        if not registration:
            return False
        return registration.password_hash == self.hash_trip_password(password)

    def register_trip(self, trip: str, password: str) -> str:
        trip_key = str(trip or '').strip()
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
        )
        self._persist_trip_registration(self.trip_registrations[trip_key])
        return 'registered'

    def change_trip_registration(self, old_trip: str, old_password: str, new_trip: str, new_password: str) -> None:
        old_trip_key = str(old_trip or '').strip()
        new_trip_key = str(new_trip or '').strip()
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
        trip_key = str(trip or '').strip()
        if not trip_key:
            return 0

        count = 0
        for game_record in self.game_records.values():
            if any(str(player.trip_display or '').strip() == trip_key for player in game_record.players):
                count += 1
        return count

    def get_trip_nicknames(self, trip: str) -> List[str]:
        trip_key = str(trip or '').strip()
        nicknames = {
            str(player.player_name or '').strip()
            for game_record in self.game_records.values()
            for player in game_record.players
            if str(player.trip_display or '').strip() == trip_key and str(player.player_name or '').strip()
        }
        return sorted(nicknames)

    def get_trip_nickname_counts(self, trip: str) -> List[Dict[str, Any]]:
        trip_key = str(trip or '').strip()
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
        trip_key = str(trip or '').strip()
        total = 0
        for row in self.rating_records:
            if str(row.target_trip or '').strip() != trip_key:
                continue
            if int(row.room_id or 0) != int(room_id or 0):
                continue
            total += int(row.rating or 0)
        return total

    def get_trip_ratings(self, trip: str, limit: int = 100) -> List[TripRatingRecord]:
        trip_key = str(trip or '').strip()
        rows = [row for row in self.rating_records if str(row.target_trip or '').strip() == trip_key]
        rows.sort(key=lambda row: row.created_date, reverse=True)
        return rows[: max(1, min(limit, 300))]

    def add_trip_rating(self, row: TripRatingRecord) -> str:
        self.rating_records.append(row)
        self._persist_rating_record(row)
        return row.record_id

    def reassign_trip_by_account(self, target_trip: str, account: str, account_password: str, room_id: Optional[int] = None, *, only_unassigned: bool) -> int:
        trip_key = str(target_trip or '').strip()
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
        trip_key = str(target_trip or '').strip()
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
        entries = []
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
        
        if 'by_room' not in self.leaderboards:
            self.leaderboards['by_room'] = {}
        self.leaderboards['by_room'][room_id] = entries
    
    def get_leaderboard(self, scope: str = 'global', room_id: Optional[int] = None) -> List[LeaderboardEntry]:
        """Get leaderboard"""
        if scope == 'global':
            return self.leaderboards.get('global', [])
        elif scope == 'room' and room_id:
            return self.leaderboards.get('by_room', {}).get(room_id, [])
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
