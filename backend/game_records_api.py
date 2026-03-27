"""
Game Records API Integration - Handles recording game results and player statistics
Integrates with records_system.py and the Room/RoomManager classes
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
import uuid
import base64
import hashlib
from backend.records_system import (
    GameRecord, PlayerRecord, GameRecordStore, 
    RoomGameHistory, TripRatingRecord
)


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
        if len(value) == 8:
            return value
        return self.encrypt_trip_like_higu(value)
    
    # ===== Game Lifecycle Events =====
    
    def on_game_start(self, room: 'room'):
        """Called when game starts (room_status becomes 2)"""
        import time
        self.game_start_times[room.room_id] = time.time()
    
    def on_game_end(self, room: 'room') -> Optional[str]:
        """
        Called when game ends (room_status becomes 3)
        Returns the record_id if successful, None otherwise
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
                    final_hp=getattr(player_obj, 'hp', 0),
                    damage_taken=getattr(player_obj, 'total_damage_taken', 0),
                    cards_played=getattr(player_obj, 'cards_played_count', 0),
                    trip_display=str(getattr(player_obj, 'trip_display', '') or ''),
                    account_password_hash=self.record_store.hash_account_password(
                        account,
                        str(getattr(player_obj, 'password', '') or profile.get('password', '') or ''),
                    ),
                    cards_equipped=[c.name for c in getattr(player_obj, 'equipments', [])]
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
                    'enable_initial_green_card': room.enable_initial_green_card,
                    'expansion_mode': room.expansion_mode,
                    'max_players': room.max_players,
                    'require_trip': room.require_trip,
                },
                players=player_records,
                winner_camp=winner_camp,
                winner_players=list(room.winner_accounts),
                end_reason=self._get_end_reason(room),
                total_actions=self._count_total_actions(room),
                total_damage_dealt=self._count_total_damage(room),
                kills_count=self._count_kills(room, player_records)
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
        
        return {
            'record_id': record.record_id,
            'room_id': record.room_id,
            'game_date': record.game_date,
            'duration_seconds': record.game_duration_seconds,
            'game_settings': record.game_settings,
            'players': [
                {
                    'player_id': p.player_id,
                    'player_name': p.player_name,
                    'character_name': p.character_name,
                    'character_camp': p.character_camp,
                    'is_alive': p.is_alive,
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
            'kills_count': record.kills_count
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

    def api_get_game_records(self, limit: int = 100) -> Dict[str, Any]:
        """API: List game records in reverse chronological order"""
        records = sorted(
            self.record_store.game_records.values(),
            key=lambda r: r.game_date,
            reverse=True,
        )[: max(1, min(limit, 500))]

        def _winner_code(record: GameRecord) -> str:
            winner_set = set(record.winner_players or [])
            if not winner_set:
                return 'draw'

            camps = set()
            for p in record.players:
                if p.player_id in winner_set:
                    camps.add(str(p.character_camp or '').lower())

            # TODO_list rule: if neutral co-wins with Hunter/Shadow, display Hunter/Shadow only.
            if any(c in camps for c in ('hunter',)):
                return 'hunter'
            if any(c in camps for c in ('shadow',)):
                return 'shadow'
            if any(c in camps for c in ('civilian', 'neutral')):
                return 'civilian'
            return 'mixed'

        entries = []
        for record in records:
            options = []
            settings = record.game_settings or {}
            if settings.get('enable_initial_green_card'):
                options.append('初始綠卡')
            if settings.get('require_trip'):
                options.append('TRIP驗證')
            if str(settings.get('expansion_mode') or ''):
                options.append(str(settings.get('expansion_mode')))

            entries.append({
                'record_id': record.record_id,
                'room_id': record.room_id,
                'village_name': f"{record.room_id}村",
                'end_time': record.game_date,
                'player_count': len(record.players or []),
                'winner_code': _winner_code(record),
                'options': ' / '.join(options) if options else '-',
            })

        return {'entries': entries}

    def api_get_trip_directory(self, keyword: str = '', limit: int = 200) -> Dict[str, Any]:
        """API: List registered trip identities"""
        key = str(keyword or '').strip().lower()
        rows_by_trip: Dict[str, Dict[str, Any]] = {
            self.to_trip_display(trip): {
                'trip': self.to_trip_display(trip),
                'total_games': 0,
                'wins': 0,
                'skill_level': '-',
            }
            for trip in self.record_store.trip_registrations.keys()
        }

        for stats in self.record_store.get_all_players_stats():
            trip = self.to_trip_display(stats.trip_display)
            if not trip:
                continue
            row = rows_by_trip.setdefault(
                trip,
                {'trip': trip, 'total_games': 0, 'wins': 0, 'skill_level': '-'},
            )
            row['total_games'] += int(stats.total_games or 0)
            row['wins'] += int(stats.wins or 0)
            if row['skill_level'] in ('-', 'Beginner') and stats.skill_level:
                row['skill_level'] = stats.skill_level

        rows = []
        for row in rows_by_trip.values():
            if key and key not in row['trip'].lower():
                continue
            total_games = int(row.get('total_games', 0) or 0)
            wins = int(row.get('wins', 0) or 0)
            rows.append({
                'trip': row['trip'],
                'total_games': total_games,
                'win_rate': f"{(wins / total_games):.2%}" if total_games else '0.00%',
                'skill_level': row.get('skill_level') or '-',
            })

        rows.sort(key=lambda r: (-int(r['total_games']), r['trip']))
        return {'entries': rows[: max(1, min(limit, 500))]}

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
                winner_camp_code = str(game.winner_camp or '').strip().lower()
                if winner_camp_code in ('neutral',):
                    winner_camp_code = 'civilian'
                result_code = 'draw'
                if is_winner:
                    camp_code = str(player.character_camp or '').strip().lower()
                    if camp_code in ('hunter', 'shadow', 'civilian', 'neutral'):
                        result_code = 'civilian' if camp_code == 'neutral' else camp_code
                    else:
                        result_code = 'win'
                elif winner_camp_code in ('hunter', 'shadow', 'civilian'):
                    result_code = winner_camp_code
                elif winner_camp_code != 'draw':
                    result_code = 'lose'

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
                    'boomed': False,
                    'rating_score': self.record_store.get_trip_game_rating_score(trip_display, game.room_id),
                })

        games.sort(key=lambda g: g['game_date'], reverse=True)
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

        return {
            'trip': trip_display,
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
            'trip': str(trip or '').strip(),
            'status': status,
        }

    def api_change_trip(self, old_trip: str, old_password: str, new_trip: str, new_password: str) -> Dict[str, Any]:
        self.record_store.change_trip_registration(old_trip, old_password, new_trip, new_password)
        return {
            'trip': str(new_trip or '').strip(),
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
        if len(safe_comment) > 40:
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
    
    def _get_winner_camp(self, room: 'room', player_records: List[PlayerRecord]) -> str:
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
    
    def _get_end_reason(self, room: 'room') -> str:
        """Determine the reason the game ended"""
        # This would need to be added to room.py to track the end reason
        return 'Normal'
    
    def _count_total_actions(self, room: 'room') -> int:
        """Count total actions taken in the game"""
        # This could be tracked during the game
        return 0
    
    def _count_total_damage(self, room: 'room') -> int:
        """Count total damage dealt in the game"""
        total = 0
        for player_obj in room.players.values():
            if player_obj:
                total += getattr(player_obj, 'total_damage_dealt', 0)
        return total
    
    def _count_kills(self, room: 'room', player_records: List[PlayerRecord]) -> Dict[str, int]:
        """Count kills per player"""
        kills = {}
        for account, player_obj in room.players.items():
            kills[account] = getattr(player_obj, 'kill_count', 0)
        return kills
