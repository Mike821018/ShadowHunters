from . import board
from . import player

import random
from threading import Thread
import time
from typing import Any


GREEN_CARD_HIT_CAMP = {
    'Aid': ('Hunter',),
    'Anger': ('Hunter', 'Shadow'),
    'Blackmail': ('Civilian', 'Hunter'),
    'Exorcism': ('Shadow',),
    'Greed': ('Civilian', 'Shadow'),
    'Huddle': ('Shadow',),
    'Nurturance': ('Civilian',),
    'Slap': ('Hunter',),
    'Spell': ('Shadow',),
}

class room(Thread):
    def __init__(self):
        super().__init__(daemon=True)
        self.stop = False
        self.room_id = 0
        self.room_name = ''
        self.room_status = 0 # 1:before game, 2:in game, 3:after game
        self.board: Any = None
        self.players = {}
        self.action_order = [] # list of player account in action order
        self.current_player: Any = None
        self.active_card: Any = None
        self._attack_target = None   # 暫存本回合攻擊目標
        self._compass_areas = []     # 暫存 Mystic Compass 兩次擲骰的可選區域
        self._move_area_options = [] # 擲到 7 時可選的任意區域
        self._pending_kill_loot = None  # 擊殺後待處理掠奪: {'attacker': player, 'deaths': [player], 'allow_full': bool}
        self._pending_steal = None  # 待處理裝備轉移: {'from_player': player, 'to_player': player, 'chooser_account': str, 'source': str}
        self._pending_green_card = None  # 待確認綠卡: {'from_player': player, 'to_player': player, 'card': card, 'choice': 'effect1'|'effect2'|None}
        self._pending_counter_attack = None  # 反擊待處理: {'original_attacker': player, 'counter_player': player}
        self.winner_accounts = []
        self.require_trip: bool = False  # 是否需要 Trip 驗證才能加入（需比對資料庫）
        self.hide_trip: bool = True  # 是否隱藏 Trip（遊戲結束後才顯示）
        self.trip_min_games: int = 0  # 加入村子所需的 Trip 最低遊戲場數
        self.manager_trip: str = ''  # 村長 Trip（匹配者視為村長身分）
        self.manager_trip_encrypted: bool = True  # 村長 Trip 是否為加密後值
        self.is_chat_room: bool = False  # 聊天村：不開局、較高人數上限
        self.expansion_mode: str = 'all'  # all | no_extend
        self.enable_initial_green_card: bool = False  # 遊戲開始時執行初始綠卡
        self.max_players: int = 8
        self.idle_timeout_seconds: int = 15 * 60
        self.turn_timeout_seconds: int = 3 * 60
        self.turn_last_action_at: float = 0.0
        self.latest_boom_notice: dict = {}
        self.last_activity_at: float = time.time()
        self.manager_ref = None
        self.kick_votes = {}  # {target_account: set(voter_account)}
        self.private_character_visibility = {}  # {viewer_account: set(target_account)}
        self._join_seq: int = 0
        self._initial_green_card_executed: bool = False  # 初始綠卡流程是否進行中
        self._initial_green_card: Any = None  # 初始綠卡流程使用的同一卡片
        self._initial_green_card_players_executed: set = set()  # 已執行初始綠卡的玩家帳號集合
        self.chat_messages = []
        self._chat_seq = 0

    def touch_activity(self):
        self.last_activity_at = time.time()

    def touch_turn_action(self):
        self.turn_last_action_at = time.time()

    def _clear_turn_timeout_notice(self):
        self.latest_boom_notice = {}

    def _current_turn_timeout_remaining(self):
        if int(getattr(self, 'room_status', 0) or 0) != 2:
            return None
        current = getattr(self, 'current_player', None)
        if not current or not bool(getattr(current, 'is_alive', False)):
            return None
        if getattr(self, '_pending_green_card', None):
            return None
        status = int(getattr(current, 'status', 0) or 0)
        if status not in (1, 2, 3, 4, 5, 6):
            return None
        last_at = float(getattr(self, 'turn_last_action_at', 0) or 0)
        if last_at <= 0:
            return int(self.turn_timeout_seconds)
        remain = int(self.turn_timeout_seconds - (time.time() - last_at))
        return max(0, remain)

    def get_turn_timeout_snapshot(self):
        remaining = self._current_turn_timeout_remaining()
        if remaining is None:
            return None
        current = getattr(self, 'current_player', None)
        return {
            'limit_seconds': int(self.turn_timeout_seconds),
            'remaining_seconds': int(remaining),
            'current_account': str(getattr(current, 'account', '') or ''),
            'current_name': str(getattr(current, 'name', '') or ''),
            'current_trip_display': str(getattr(current, 'trip_display', '') or ''),
            'warning': bool(remaining <= 30),
        }

    def _handle_turn_timeout(self):
        current = getattr(self, 'current_player', None)
        if not current or not bool(getattr(current, 'is_alive', False)):
            return False

        current.is_alive = False
        current.is_boomed = True
        current.hp = 0
        current.status = 0
        if not bool(getattr(current, 'character_reveal', False)):
            current.reveal_character()

        self.latest_boom_notice = {
            'account': str(getattr(current, 'account', '') or ''),
            'trip_display': str(getattr(current, 'trip_display', '') or ''),
            'name': str(getattr(current, 'name', '') or ''),
            'timestamp': int(time.time()),
        }
        self.add_system_message(f"[{current.name or current.account}] 回合超時，判定暴斃")

        self.active_card = None
        self._attack_target = None
        self._compass_areas = []
        self._move_area_options = []
        self._pending_kill_loot = None
        self._pending_steal = None
        self._pending_green_card = None
        self._pending_counter_attack = None

        self._handle_death([current])
        if int(getattr(self, 'room_status', 0) or 0) == 2:
            if bool(getattr(self, '_initial_green_card_executed', False)) and getattr(self, '_initial_green_card', None) is not None:
                self._initial_green_card_players_executed.add(str(getattr(current, 'account', '') or ''))
                self._set_next_alive_player_after_trip(str(getattr(current, 'trip', '') or ''))
                if self.current_player:
                    self.current_player.status = 3
                    self.active_card = self._initial_green_card
            else:
                self._set_next_alive_player_after_trip(str(getattr(current, 'trip', '') or ''))
            self.touch_turn_action()
        return True

    def should_auto_abolish(self):
        if self.is_chat_room:
            return False
        if self.room_status not in (1, 2):
            return False
        return (time.time() - float(self.last_activity_at or 0)) >= self.idle_timeout_seconds

    def run(self):
        while not self.stop:
            time.sleep(1)
            if not self.should_auto_abolish():
                timeout_remaining = self._current_turn_timeout_remaining()
                if timeout_remaining is not None and timeout_remaining <= 0:
                    self._handle_turn_timeout()
                continue
            manager = self.manager_ref
            if manager and manager.get_room(self.room_id) is self:
                manager.remove_room(self.room_id)
            break

    ####################
    #  before game
    ####################

    def create(self):
        self.board = board.board(self)
        self.touch_activity()
        self.add_system_message(f"村莊已建立：{self.room_name or self.room_id}村")
        self.start()

    def _push_message(self, message_type, text, account='', name=''):
        text_value = str(text or '').strip()
        if not text_value:
            return
        self._chat_seq = int(getattr(self, '_chat_seq', 0) or 0) + 1
        self.chat_messages.append({
            'id': int(self._chat_seq),
            'type': str(message_type or 'chat'),
            'account': str(account or '').strip(),
            'name': str(name or '').strip(),
            'text': text_value,
            'timestamp': int(time.time()),
        })

    def add_chat_message(self, account, name, text):
        self._push_message('chat', text=text, account=account, name=name)

    def add_system_message(self, text):
        self._push_message('system', text=text)

    def join(self, player_info):  # pyright: ignore[reportIncompatibleMethodOverride]
        ret = False
        requested_trip_display = str(player_info.get('trip') or '').strip()
        internal_account = str(player_info.get('account') or '').strip()
        if internal_account and internal_account not in self.players:
            normalized_player_info = dict(player_info)
            self._join_seq += 1
            normalized_player_info['trip'] = internal_account
            normalized_player_info['trip_display'] = requested_trip_display
            normalized_player_info['join_order'] = self._join_seq
            self.players[internal_account] = player.player(self, normalized_player_info)
            self.clear_votes_for_account(internal_account)
            self.touch_activity()
            ret = True
        return ret

    def has_trip(self, trip):
        if not trip:
            return False
        return any(p.trip_display == trip for p in self.players.values())

    def has_account(self, account):
        for p in self.players.values():
            if p.profile.get('account') == account:
                return True
        return False

    def has_name(self, name):
        if not name:
            return False
        return any(p.profile.get('name', '') == name for p in self.players.values())

    def kick(self, account):
        ret = False
        if account in self.players:
            del self.players[account]
            self.clear_private_character_visibility_for_account(account)
            self.clear_votes_for_account(account)
            if account in self.action_order:
                self.action_order = [acc for acc in self.action_order if acc != account]
            self.touch_activity()
            ret = True
        return ret

    def clear_all_kick_votes(self):
        self.kick_votes = {}

    def clear_votes_for_account(self, account):
        if not account:
            return
        next_votes = {}
        for target, voters in self.kick_votes.items():
            if target == account:
                continue
            kept = {v for v in voters if v != account}
            if kept:
                next_votes[target] = kept
        self.kick_votes = next_votes

    def cast_kick_vote(self, voter_account, target_account):
        if not voter_account or not target_account:
            return 0

        # 每位玩家同一時間只能有一票：改投時會從舊目標移除
        for target in list(self.kick_votes.keys()):
            voters = self.kick_votes.get(target, set())
            if voter_account in voters:
                voters.discard(voter_account)
            if not voters:
                del self.kick_votes[target]
            else:
                self.kick_votes[target] = voters

        target_voters = self.kick_votes.get(target_account, set())
        target_voters.add(voter_account)
        self.kick_votes[target_account] = target_voters
        self.touch_activity()
        return len(target_voters)

    def reset_all_ready(self):
        for p in self.players.values():
            p.profile['is_ready'] = False
        self.touch_activity()

    def login(self, account, password):
        """
        認證現有住民。以帳號 + 密碼比對已登記玩家。
        找到匹配者回傳其 account，否則回傳 None。
        """
        for player_account, p in self.players.items():
            profile = p.profile
            if profile.get('account') == account and profile.get('password') == password:
                self.touch_activity()
                return player_account
        return None

    ####################
    #  game start
    ####################

    def game_start(self):
        self.touch_activity()
        self.touch_turn_action()
        self._clear_turn_timeout_notice()
        self.private_character_visibility = {}
        self.action_order = list(self.players.keys())
        random.shuffle(self.action_order)
        self.board.game_set(self.players)
        self.room_status = 2
        if self.manager_ref and hasattr(self.manager_ref, 'records_api'):
            self.manager_ref.records_api.on_game_start(self)
        for p in self.players.values():
            p.status = 0
        self.current_player = self.players[self.action_order[0]] if self.action_order else None
        if self.current_player:
            self.add_system_message(f"首位行動玩家：[{self.current_player.name or self.current_player.account}]")

        # 初始綠卡流程：若啟用，所有玩家先執行一張綠卡，再開始常規回合
        if self.enable_initial_green_card:
            self._initial_green_card_executed = True
            self._initial_green_card_players_executed.clear()
            self._initial_green_card = self.board.draw('Green')
            if self.current_player:
                self.current_player.status = 3
                self.active_card = self._initial_green_card
                if self.active_card:
                    self.add_system_message(f"[{self.current_player.name or self.current_player.account}] 初始綠卡：{str(getattr(self.active_card, 'name', '') or '未知卡')}")
                    return
            self._initial_green_card_executed = False
            self._initial_green_card = None
            self._initial_green_card_players_executed.clear()
        
        # 常規遊戲開始
        if self.current_player:
            self.current_player.status = 1
        self.active_card = None
        self._attack_target = None
        self._compass_areas = []
        self._move_area_options = []
        self._pending_kill_loot = None
        self._pending_steal = None
        self._pending_green_card = None
        self._pending_counter_attack = None
        self.winner_accounts = []
        # update

    def _set_next_alive_player_after_trip(self, trip):
        if not self.action_order:
            self.current_player = None
            return
        try:
            idx = self.action_order.index(trip)
        except ValueError:
            idx = -1
        for i in range(1, len(self.action_order) + 1):
            next_trip = self.action_order[(idx + i) % len(self.action_order)]
            next_player = self.players.get(next_trip)
            if next_player and next_player.is_alive:
                self.current_player = next_player
                self.current_player.status = 1
                self.touch_turn_action()
                return
        self.current_player = None

    def set_pending_green_card_choice(self, account, choice):
        pending = self._pending_green_card
        if not pending:
            return False
        from_player = pending.get('from_player')
        to_player = pending.get('to_player')
        card = pending.get('card')
        if not from_player or not to_player:
            return False
        if str(getattr(to_player, 'account', '') or '') != str(account or ''):
            return False
        if not self._green_card_requires_choice(to_player, card):
            return False
        normalized_choice = str(choice or '').strip().lower()
        if normalized_choice == 'effect1':
            normalized_choice = 'activate'
        elif normalized_choice == 'effect2':
            normalized_choice = 'skip'
        if normalized_choice not in ('activate', 'skip'):
            return False
        pending['choice'] = normalized_choice
        return True

    def _run_active_card_action(self, target=None, force_effect=None):
        card = self.active_card
        if not card:
            return 0, []
        # target='self' 的卡前端不傳目標，自動補上 current_player
        if target is None and str(getattr(card, 'target', '') or '') == 'self':
            target = self.current_player
        if force_effect in (1, 2):
            try:
                return card.action(self.current_player, target, self, force_effect=force_effect)
            except TypeError:
                pass
        return card.action(self.current_player, target, self)

    def _capture_effect_snapshot(self):
        return {
            account: {
                'damage': int(getattr(player, 'damage', 0) or 0),
                'alive': bool(getattr(player, 'is_alive', False)),
            }
            for account, player in self.players.items()
        }

    def _emit_effect_delta_messages(self, before_snapshot, source_kind, source_name, source_player=None):
        source_kind_text = str(source_kind or '').strip()
        source_name_text = str(source_name or '').strip()
        if not source_kind_text or not source_name_text:
            return
        source_player_text = str(source_player or '').strip()
        for account, player in self.players.items():
            prev = before_snapshot.get(account) or {}
            prev_damage = int(prev.get('damage', 0) or 0)
            next_damage = int(getattr(player, 'damage', 0) or 0)
            delta = next_damage - prev_damage
            if delta > 0:
                if source_player_text:
                    self.add_system_message(f"[{player.name or player.account}] 因為 [{source_player_text}]({source_name_text}) 角色能力效果受到 {delta} 點傷害")
                else:
                    self.add_system_message(f"[{player.name or player.account}] 因為 {source_kind_text} {source_name_text} 效果受到 {delta} 點傷害")
            elif delta < 0:
                if source_player_text:
                    self.add_system_message(f"[{player.name or player.account}] 因為 [{source_player_text}]({source_name_text}) 角色能力效果恢復 {abs(delta)} 點傷害")
                else:
                    self.add_system_message(f"[{player.name or player.account}] 因為 {source_kind_text} {source_name_text} 效果恢復 {abs(delta)} 點傷害")

    def _resolve_snapshot_deaths(self, before_snapshot, allow_loot=False):
        deaths = []
        for account, player in self.players.items():
            prev_alive = bool((before_snapshot.get(account) or {}).get('alive', False))
            if not prev_alive:
                continue
            if bool(getattr(player, 'is_alive', False)):
                hp = int(getattr(player, 'hp', 0) or 0)
                damage = int(getattr(player, 'damage', 0) or 0)
                if hp > 0 and damage >= hp and player.check_death():
                    deaths.append(player)
        if deaths:
            self._handle_death(deaths, allow_loot=allow_loot)
        return deaths

    def _discard_remaining_equipment(self, player):
        board = getattr(self, 'board', None)
        if not player or not board:
            return
        for equipment in list(getattr(player, 'equipment_list', []) or []):
            player.divest(equipment)
            board.discard(equipment)

    def _use_ability_with_resolution(self, player, target=None):
        if not player or not getattr(player, 'character', None):
            return False
        snapshot = self._capture_effect_snapshot()
        activated = bool(player.use_ability(target))
        if not activated:
            return False
        target_label = str(getattr(target, 'name', '') or getattr(target, 'account', '') or '').strip() if target is not None else ''
        if target_label:
            self.add_system_message(f"[{player.name or player.account}] 發動能力，目標：[{target_label}]")
        else:
            self.add_system_message(f"[{player.name or player.account}] 發動能力")
        character_name = str(getattr(getattr(player, 'character', None), 'name', '') or '未知角色')
        player_display = str(player.name or player.account or '').strip()
        self._emit_effect_delta_messages(snapshot, '角色能力', character_name, source_player=player_display)
        self._resolve_snapshot_deaths(snapshot, allow_loot=False)
        return True

    def _finish_active_card_resolution(self, target, ret, extra):
        # 結算卡牌效果
        if ret == 1 and extra:
            # 有人死亡：揭示身分、檢查勝利
            self._handle_death(extra, allow_loot=False)

        elif ret == 2 and len(extra) >= 2:
            # 裝備轉移：extra=[from_player, to_player]
            # update → 通知前端從 extra[0].equipment_list 選一張裝備
            #           選好後呼叫 steal_equipment(extra[0], extra[1], <equipment>)
            active_card = self.active_card
            chooser_account = str(getattr(self.current_player, 'account', '') or '')
            card_color = str(getattr(active_card, 'color', '') or '').lower()
            if card_color == 'green':
                chooser_account = str(getattr(extra[0], 'account', '') or chooser_account)

            self._pending_steal = {
                'from_player': extra[0],
                'to_player': extra[1],
                'chooser_account': chooser_account,
                'source': str(getattr(self.active_card, 'name', '') or 'card'),
            }

        elif ret == 3 and extra:
            # 揭示身分給特定玩家：extra=[to_player]
            # update → 僅通知 extra[0] 的前端顯示目標角色身分（不公開）
            if target:
                for viewer in extra:
                    self.mark_private_character_visibility(viewer, target)

        active_card_to_check = self.active_card  # 在丢弃前保存引用

        is_initial_green_resolution = bool(
            self._initial_green_card_executed
            and self._initial_green_card is not None
            and active_card_to_check is self._initial_green_card
            and str(getattr(active_card_to_check, 'color', '') or '').lower() == 'green'
        )

        if not is_initial_green_resolution:
            self.board.discard(self.active_card)
        
        # 初始綠卡流程：每位玩家依序抽一張綠卡並對自己結算，不進入攻擊階段。
        if is_initial_green_resolution:
            if self.current_player:
                self._initial_green_card_players_executed.add(self.current_player.account)

            all_executed = self._initial_green_card_players_executed == set(self.players.keys())
            if not all_executed:
                self._set_next_alive_player_after_trip(self.current_player.trip if self.current_player else '')
                if self.current_player:
                    self.current_player.status = 3
                    self.active_card = self._initial_green_card
                    if self.active_card:
                        self.add_system_message(f"[{self.current_player.name or self.current_player.account}] 初始綠卡：{str(getattr(self.active_card, 'name', '') or '未知卡')}")
                    return
            else:
                # 所有玩家都執行了初始綠卡，回到常規回合流程
                self.board.discard(self._initial_green_card)
                self._initial_green_card_executed = False
                self._initial_green_card = None
                self._initial_green_card_players_executed.clear()
                self.current_player = self.players[self.action_order[0]] if self.action_order else None
                if self.current_player:
                    self.current_player.status = 1
                self.active_card = None
                return
        
        self.active_card = None
        if int(getattr(self, 'room_status', 0) or 0) == 3:
            self._pending_steal = None
            return
        self.current_player.status = 3 if self._pending_steal else 4
        # update → 通知前端卡牌效果結算完成，進入攻擊選擇階段

    def confirm_pending_green_card(self, account):
        self.touch_turn_action()
        pending = self._pending_green_card
        if not pending:
            return False
        to_player = pending.get('to_player')
        card = pending.get('card')
        if not to_player or not card:
            return False
        if str(getattr(to_player, 'account', '') or '') != str(account or ''):
            return False

        force_effect = self._get_green_card_force_effect(to_player, card, pending.get('choice'))
        if self._green_card_requires_choice(to_player, card) and force_effect not in (1, 2):
            return False

        choice_label = '發動' if force_effect == 1 else '不發動' if force_effect == 2 else '結算'
        self.add_system_message(f"[{to_player.name or to_player.account}] 對綠卡 {str(getattr(card, 'name', '') or '-')} 選擇：{choice_label}")
        self.active_card = card
        snapshot = self._capture_effect_snapshot()
        ret, extra = self._run_active_card_action(target=to_player, force_effect=force_effect)
        self._emit_effect_delta_messages(snapshot, '卡片', str(getattr(card, 'name', '') or '-'))
        self._pending_green_card = None
        self._finish_active_card_resolution(to_player, ret, extra)
        return True

    def confirm_equipment(self):
        """確認裝備白卡並將其裝上。"""
        self.touch_turn_action()
        if not self.active_card or str(getattr(self.active_card, 'type', '') or '').strip() != 'Equipment':
            return False
        if not self.current_player:
            return False

        card = self.active_card
        player = self.current_player
        player.equip(card)
        self.add_system_message(f"[{player.name or player.account}] 裝備了 {str(getattr(card, 'name', '') or '-')}")
        if player.check_win_timing == 2:
            self._check_all_victory(equip_trigger=player)

        self.active_card = None
        if int(getattr(self, 'room_status', 0) or 0) == 3:
            return True
        player.status = 4
        return True

    def clear_private_character_visibility_for_account(self, account):
        if not account:
            return
        next_map = {}
        for viewer, targets in self.private_character_visibility.items():
            if viewer == account:
                continue
            kept = {target for target in targets if target != account}
            if kept:
                next_map[viewer] = kept
        self.private_character_visibility = next_map

    def mark_private_character_visibility(self, viewer, target):
        viewer_account = getattr(viewer, 'account', viewer)
        target_account = getattr(target, 'account', target)
        viewer_account = str(viewer_account or '').strip()
        target_account = str(target_account or '').strip()
        if not viewer_account or not target_account or viewer_account == target_account:
            return
        target_player = self.players.get(target_account)
        if not target_player or not getattr(target_player, 'character', None):
            return
        current_targets = set(self.private_character_visibility.get(viewer_account, set()))
        current_targets.add(target_account)
        self.private_character_visibility[viewer_account] = current_targets

    def can_view_character(self, viewer_account, target_account):
        target_account = str(target_account or '').strip()
        viewer_account = str(viewer_account or '').strip()
        if not target_account:
            return False
        target_player = self.players.get(target_account)
        if not target_player:
            return False
        if int(getattr(self, 'room_status', 0) or 0) == 3:
            return True
        if target_player.character_reveal:
            return True
        if viewer_account and viewer_account == target_account:
            return True
        return bool(viewer_account and target_account in self.private_character_visibility.get(viewer_account, set()))

    ####################
    #  in game
    ####################

    def _handle_death(self, deaths, allow_loot=False):
        """
        處理死亡玩家：揭示身分、檢查所有玩家的勝利條件。
        deaths: 死亡 player 物件的 list
        """
        for dead in deaths:
            if not dead.character_reveal:
                dead.reveal_character()
            role_name = str(getattr(getattr(dead, 'character', None), 'name', '') or '未知角色')
            self.add_system_message(f"[{dead.name or dead.account}] 死亡，身份揭示為 {role_name}")
            if not allow_loot:
                self._discard_remaining_equipment(dead)
            # update → 通知所有前端顯示死亡玩家的角色身分

        # 死亡觸發型能力：使用既有的 ability_timing=9 與角色自身 ability 邏輯判定。
        # 規則：在「有玩家死亡」時，對所有 timing=9 且可用能力的存活玩家嘗試觸發一次。
        for p in self.players.values():
            if not p.is_alive or not p.character or not p.can_use_ability:
                continue
            if p.character.ability_timing != 9:
                continue

            for dead in deaths:
                if self._use_ability_with_resolution(p, dead):
                    break

        winners = self._check_all_victory(dead_trigger=deaths)
        return winners

    def _check_all_victory(self, dead_trigger=None, equip_trigger=None):
        """
        對所有存活玩家檢查勝利條件。
        dead_trigger  : 剛死亡的玩家 list，用於觸發 check_win_timing=1 的勝利判斷。
        equip_trigger : 剛取得裝備的玩家，用於觸發 check_win_timing=2 的勝利判斷。
        回傳獲勝玩家的 list；若無人獲勝回傳空 list。
        若有人獲勝則將 room_status 設為 3 並通知前端。
        """
        if int(getattr(self, 'room_status', 0) or 0) == 3:
            return [self.players[acc] for acc in self.winner_accounts if acc in self.players]

        winners = []

        # 綠卡待確認期間，不允許一般 next_step 推進，避免被「跳過場地」覆蓋流程
        if self._pending_green_card:
            return
        for trip, p in self.players.items():
            # 規則：僅「暴斃」玩家不可獲勝；一般死亡玩家仍可依角色條件判定勝利。
            if bool(getattr(p, 'is_boomed', False)) or not p.character:
                continue
            if dead_trigger and p.check_win_timing == 1:
                if p.character.win_check(self, p, dead_trigger):
                    winners.append(p)
            if equip_trigger and p == equip_trigger and p.check_win_timing == 2:
                if p.character.win_check(self, p, None):
                    winners.append(p)
        if winners:
            self.room_status = 3
            self.winner_accounts = [str(getattr(w, 'account', '') or '') for w in winners if w]
            winner_names = [str(getattr(w, 'name', '') or getattr(w, 'account', '') or '').strip() for w in winners if w]
            if winner_names:
                self.add_system_message(f"遊戲結束，勝利者：{'、'.join(winner_names)}")
            if self.manager_ref and hasattr(self.manager_ref, 'records_api'):
                self.manager_ref.records_api.on_game_end(self)
            # update → 通知前端 winners 獲勝，遊戲結束
        return winners

    def _can_activate_ability(self, p):
        """
        規則：僅「已揭露角色」可主動發動能力。
        例外由角色旗標 ability_requires_reveal 控制。
        """
        if not p or not p.character or not p.can_use_ability:
            return False
        if not getattr(p.character, 'ability_requires_reveal', True):
            return True
        return p.character_reveal

    def _get_green_card_interceptor(self, target, card):
        if not target or not card:
            return None
        if str(getattr(card, 'color', '') or '').lower() != 'green':
            return None
        character = getattr(target, 'character', None)
        if not character or not self._can_activate_ability(target):
            return None
        if not getattr(character, 'intercepts_green_cards', False):
            return None
        return character

    def _green_card_requires_choice(self, target, card):
        interceptor = self._get_green_card_interceptor(target, card)
        if not interceptor:
            return False
        return bool(interceptor.requires_green_card_choice(target, card, self.current_player, self))

    def _get_green_card_force_effect(self, target, card, choice=None):
        interceptor = self._get_green_card_interceptor(target, card)
        if not interceptor:
            return None
        return interceptor.get_green_card_force_effect(target, card, self.current_player, self, choice=choice)

    def _get_attackable_targets(self, attacker):
        """
        取得 attacker 在當前裝備規則下可指定的攻擊目標清單。
        - 一般攻擊：可指定同 zone 的玩家
        - Handgun (eqp_range_atk=True)：可指定不同 zone 的玩家
        """
        targets = []
        attacker_zone = int(getattr(attacker, 'zone', 0) or 0)
        if not attacker_zone:
            attacker_area = getattr(attacker, 'area', None)
            attacker_zone = int(getattr(attacker_area, 'zone', 0) or 0)

        for t in self.players.values():
            if not t.is_alive or t == attacker:
                continue

            target_zone = int(getattr(t, 'zone', 0) or 0)
            if not target_zone:
                target_area = getattr(t, 'area', None)
                target_zone = int(getattr(target_area, 'zone', 0) or 0)

            if attacker.eqp_range_atk:
                if attacker_zone and target_zone and attacker_zone != target_zone:
                    targets.append(t)
            else:
                if attacker_zone and target_zone and attacker_zone == target_zone:
                    targets.append(t)

        return targets

    def _get_any_move_options(self, current_area=None):
        if not current_area:
            return list(self.board.field)
        return [area for area in self.board.field if area is not current_area]

    def loot_from_kill(self, from_player, equipment=None, take_all=False):
        """
        擊殺後掠奪裝備流程（由前端在 status=5 呼叫）：
        - 預設：每名死亡玩家可掠奪 1 張裝備（需指定 equipment）
        - 全拿：僅在以下條件可用
          1) 攻擊者裝備 Silver Rosary
          2) 攻擊者是 Bob 且在此時發動能力

        Parameters
        ----------
        from_player : 死亡玩家（被掠奪者）
        equipment   : 要拿的裝備（take_all=False 時使用）
        take_all    : 是否全拿

        Returns
        -------
        bool : 是否成功處理
        """
        pending = self._pending_kill_loot
        if not pending:
            return False

        self.touch_activity()
        self.touch_turn_action()

        attacker = pending.get('attacker')
        deaths = pending.get('deaths', [])
        allow_full = pending.get('allow_full', False)

        if not attacker or from_player not in deaths:
            return False

        # 允許跳過該死亡玩家的掠奪
        if (equipment is None) and (not take_all):
            self.add_system_message(f"[{attacker.name or attacker.account}] 放棄掠奪 [{from_player.name or from_player.account}] 的裝備")
            self._discard_remaining_equipment(from_player)
            deaths.remove(from_player)
            return True

        if take_all:
            if not allow_full:
                return False

            # 若是角色能力提供全拿，依旗標決定是否需發動能力
            if (not attacker.eqp_rob) and attacker.character and getattr(attacker.character, 'can_take_all_kill_loot', False):
                if getattr(attacker.character, 'take_all_kill_loot_requires_ability', False):
                    if not self._can_activate_ability(attacker):
                        return False
                    attacker.use_ability(from_player)
                else:
                    for eq in list(from_player.equipment_list):
                        from_player.divest(eq)
                        attacker.equip(eq)
            else:
                for eq in list(from_player.equipment_list):
                    from_player.divest(eq)
                    attacker.equip(eq)

            if from_player in deaths:
                deaths.remove(from_player)
            self.add_system_message(f"[{attacker.name or attacker.account}] 掠奪了 [{from_player.name or from_player.account}] 的全部裝備")
        else:
            if equipment not in from_player.equipment_list:
                return False
            from_player.divest(equipment)
            attacker.equip(equipment)
            self.add_system_message(f"[{attacker.name or attacker.account}] 掠奪 [{from_player.name or from_player.account}] 的裝備 {str(getattr(equipment, 'name', '') or '-')}")
            self._discard_remaining_equipment(from_player)
            if from_player in deaths:
                deaths.remove(from_player)

        if attacker.check_win_timing == 2:
            winners = self._check_all_victory(equip_trigger=attacker)

        # 保留空的 pending 狀態給下一次 next_step 收尾，避免重複結算傷害。

        return True

    def next_step(self, target=None, action=False, action_type=None):
        """
        推進當前玩家的回合步驟。

        Parameters
        ----------
        target      : 依步驟不同，可能是 player 物件、area 物件或 None
        action      : 是否執行可選行動 (True=執行 / False=跳過)
        action_type : 行動類型字串，用於區域效果或牌堆顏色選擇
                      例如: 'Heal', 'Hurt', 'Green', 'White', 'Black'

        Player.status 對應階段
        ----------------------
        0 : Waiting  (非本回合，待機)
        1 : Start    (回合開始，角色能力觸發)
        2 : Move     (擲骰移動)
        3 : Area     (區域效果)
        4 : Attack   (選擇是否攻擊)
        5 : Damage   (傷害結算)
        6 : End      (回合結束，角色能力觸發)
        """
        self.touch_activity()
        self.touch_turn_action()

        # 遊戲初始化：設定第一位行動玩家
        if self.current_player is None:
            self.current_player = self.players[self.action_order[0]]
            self.current_player.status = 1
            self.touch_turn_action()

        p = self.current_player

        # ─── STATUS 1: 回合開始 ──────────────────────────────────────────────
        # [UI操作] 伺服器通知前端該玩家是否有「回合開始」能力可用。
        #          若有可用能力：前端顯示「發動能力」按鈕及對應目標選擇介面。
        #          若無能力或選擇跳過：直接進入移動階段。
        # [UI回傳] 發動能力 → next_step(action=True,  target=<目標player 或 None>)
        #          跳過     → next_step(action=False)
        if p.status == 1:
            # Gregor 的 immortal 於「自己的下一個回合開始」到期
            if p.immortal:
                p.immortal = False
                p.immortal_source = ''
            # Guardian Angel 的免疫效果同樣於「自己的下一個回合開始」到期
            if p.eqp_immortal:
                p.eqp_immortal = False
                p.eqp_immortal_source = ''

            if action and self._can_activate_ability(p):
                self._use_ability_with_resolution(p, target)
                if int(getattr(self, 'room_status', 0) or 0) == 3:
                    return
            p.status = 2
            # update → 通知前端進入「擲骰移動」介面，顯示當前場地配置

        # ─── STATUS 2: 擲骰移動 ──────────────────────────────────────────────
        # [UI操作] 前端顯示「擲骰」按鈕，伺服器擲 D4+D6 決定目的區域。
        #   具有移動能力 (ability_timing=2，如 Emi)：
        #     進入此步驟時，通知前端顯示「使用能力（鄰近區域選擇）」與「直接擲骰」兩個選項。
        #     - 選擇發動能力 → next_step(action=True, target=<選定的 area 物件>)，移動後進入區域效果
        #     - 選擇跳過能力 → next_step(action=False)，進入一般/Compass 擲骰流程
        #   一般情況：擲到 7（check_move 回傳 'Any'）則前端改為顯示六個區域選擇；
        #             擲到當前區域（check_move 回傳 None）則通知前端重骰；
        #             擲到其他區域則自動移動，進入區域效果。
        #   持有 Mystic Compass：同樣由使用者逐次觸發，每次擲一顆骰：
        #     - 擲到當前區域 → 通知前端重骰（行為與一般移動一致）
        #     - 擲到 7        → 直接改為任選六個區域之一
        #     - 第一次有效   → 暫存至 _compass_areas，通知前端繼續擲第二次
        #     - 第二次有效   → _compass_areas 湊滿兩個，通知前端顯示選項
        #     - 玩家選定後   → 帶 target 呼叫（action=False），執行移動
        # [UI回傳] 發動移動能力（如 Emi）        → next_step(action=True, target=<鄰近的 area 物件>)
        #          跳過移動能力 / 一般擲骰       → next_step(action=False) 或 next_step()
        #          一般移動骰到 7 選區域         → next_step(target=<選擇的 area 物件>)
        #          Compass 擲骰（第一／二次）    → next_step()
        #          Compass 選擇區域             → next_step(target=<選擇的 area 物件>)
        elif p.status == 2:
            has_compass = any(eq.name == "Mystic Compass" for eq in p.equipment_list)
            has_move_ability = bool(
                p.character and p.character.ability_timing == 2 and self._can_activate_ability(p)
            )

            if has_move_ability and action and target:
                # 發動移動能力（如 Emi：移動至鄰近區域），跳過擲骰
                p.use_ability(target)
                target_area_name = str(getattr(target, 'name', '') or '未知區域')
                self.add_system_message(f"[{p.name or p.account}] 發動能力並移動到 {target_area_name}")
                self._move_area_options = []
                self._compass_areas = []
                p.status = 3
                # update → 通知前端玩家透過能力移動，顯示目標區域與可用區域效果

            elif self._move_area_options and target is not None:
                if target not in self._move_area_options:
                    # update → 通知前端所選區域無效，請重新選擇
                    return
                p.move(target)
                target_area_name = str(getattr(target, 'name', '') or '未知區域')
                self.add_system_message(f"[{p.name or p.account}] 選擇移動到 {target_area_name}")
                self._move_area_options = []
                p.status = 3
                # update → 通知前端玩家以「骰到 7」的效果移動位置與可用區域效果

            elif has_compass and target is not None:
                # Compass 最終選擇：玩家已從兩個有效區域中選定一個
                if target not in self._compass_areas:
                    # update → 通知前端所選 Compass 區域無效，請重新選擇
                    return
                p.move(target)
                target_area_name = str(getattr(target, 'name', '') or '未知區域')
                self.add_system_message(f"[{p.name or p.account}] 使用神祕羅盤移動到 {target_area_name}")
                self._compass_areas = []
                self._move_area_options = []
                p.status = 3
                # update → 通知前端玩家移動位置與可用區域效果

            elif has_compass:
                # Compass 擲骰流程（由使用者逐次觸發，與一般移動一致）
                D4, D6 = self.board.roll_dice(3)
                self.add_system_message(f"[{p.name or p.account}] 羅盤擲骰：D4={D4} D6={D6}")
                new_area = p.check_move(D4, D6)

                if new_area == 'Any':
                    self._compass_areas = self._get_any_move_options(p.area)
                    self.add_system_message(f"[{p.name or p.account}] 羅盤擲出 7，可任選區域")
                    # update → 通知前端 Compass 骰到 7，可從六個區域中任選其一
                    pass  # 保持 status=2，等待含 target 的選擇呼叫
                elif new_area:
                    self._compass_areas.append(new_area)
                    area_name = str(getattr(new_area, 'name', '') or '未知區域')
                    self.add_system_message(f"[{p.name or p.account}] 羅盤擲到區域：{area_name}")
                    if len(self._compass_areas) == 1:
                        # 第一次有效：通知前端顯示結果，等待第二次擲骰
                        # update → 通知前端第一次 Compass 結果 (D4, D6)，請繼續擲第二次骰
                        pass  # 保持 status=2，等待第二次呼叫
                    else:
                        # 第二次有效：兩個選項齊備，通知前端讓玩家選擇
                        # update → 通知前端顯示兩個可選區域 (self._compass_areas)，等待玩家選擇
                        pass  # 保持 status=2，等待含 target 的選擇呼叫
                else:
                    # 擲到當前區域，需重骰（與一般移動相同）
                    # update → 通知前端 Compass 骰出當前區域 (D4+D6 結果)，請重新擲骰
                    pass  # 保持 status=2

            else:
                # 一般移動：擲骰自動決定目的地
                D4, D6 = self.board.roll_dice(3)
                self.add_system_message(f"[{p.name or p.account}] 擲移動骰：D4={D4} D6={D6}")
                new_area = p.check_move(D4, D6)
                if new_area == 'Any':
                    self._move_area_options = self._get_any_move_options(p.area)
                    self.add_system_message(f"[{p.name or p.account}] 擲出 7，可任選區域")
                    # update → 通知前端骰到 7，可從六個區域中任選其一
                    pass  # 保持 status=2，等待含 target 的下一次呼叫
                elif new_area:
                    p.move(new_area)
                    self.add_system_message(f"[{p.name or p.account}] 移動到 {str(getattr(new_area, 'name', '') or '未知區域')}")
                    p.status = 3
                    # update → 通知前端玩家移動位置與可用區域效果
                else:
                    # 擲出當前區域號碼，需重骰，保持 status=2
                    # update → 通知前端骰出當前區域 (D4+D6 結果)，請重新擲骰
                    pass

        # ─── STATUS 3: 區域效果 ──────────────────────────────────────────────
        # [UI操作]
        #   抽卡區域 (is_draw=True):
        #     一般區域        → 前端顯示「抽卡」/「跳過」按鈕
        #     Underworld Gate → 前端顯示牌堆顏色選擇 (Green / White / Black)
        #   直接效果區域 (is_action=True):
        #     Weird Woods     → 前端顯示「造成2點傷害」/「回復1點傷害」按鈕
        #                       + 目標玩家選擇介面
        #     Erstwhile Altar → 前端顯示目標玩家選擇介面，選中後
        #                       再顯示該玩家的裝備卡選擇，呼叫 steal_equipment()
        #   無效果或選擇跳過  → 自動進入攻擊選擇階段
        # [UI回傳] 跳過                   → next_step(action=False)
        #          抽卡(一般)              → next_step(action=True)
        #          抽卡(Underworld Gate)  → next_step(action=True, action_type='Green'/'White'/'Black')
        #          Weird Woods            → next_step(action=True, target=<目標player>, action_type='Heal'/'Hurt')
        #          Erstwhile Altar        → next_step(action=True, target=<目標player>)
        #          ※ 抽到行動卡時保持 status=3，前端顯示卡牌後呼叫 card_effect(target)
        elif p.status == 3:
            if self._initial_green_card_executed and self.active_card:
                # 初始綠卡期間，僅允許透過 card_effect 結算，不允許 next_step 跳過。
                return
            if action and p.area:
                if p.area.is_draw:
                    # 決定抽哪色牌堆
                    color = action_type if (p.area.draw_type == 'Any' and action_type) else p.area.draw_type
                    card = self.board.draw(color)
                    self.active_card = card
                    if card:
                        self.add_system_message(f"[{p.name or p.account}] 在 {str(getattr(p.area, 'name', '') or '區域')} 抽到 {str(getattr(card, 'name', '') or '未知卡')}（{str(getattr(card, 'color', '') or '-')})")

                    # 行動卡和裝備卡都先在執行卡片區顯示，保持 status=3
                    # 前端顯示卡牌後呼叫 card_effect(target) 或 confirm_equipment()
                    # update → 通知前端顯示 self.active_card 的卡牌資訊
                    # 若為裝備卡，顯示「裝備」按鈕
                    pass

                elif p.area.is_action:
                    area_name = str(getattr(p.area, 'name', '') or '區域')
                    if area_name == 'Weird Woods' and action_type not in ('Heal', 'Hurt'):
                        # Weird Woods 需先選擇治癒或傷害；未給定有效選項時不消耗區域效果階段。
                        return
                    target_name = str(getattr(target, 'name', '') or getattr(target, 'account', '') or '-') if target is not None else '-'
                    action_label = str(action_type or 'use')
                    self.add_system_message(f"[{p.name or p.account}] 在 {area_name} 對 [{target_name}] 執行效果：{action_label}")
                    ret, extra = p.area.action(p, target, action_type)
                    # Add effect result messages for Weird Woods
                    if area_name == 'Weird Woods' and target is not None:
                        if action_type == 'Heal':
                            self.add_system_message(f"[{target_name}] 因為 Weird Woods 效果治癒 1 點傷害")
                        elif action_type == 'Hurt':
                            has_brooch = any(getattr(c, 'name', '') == 'Fortune Brooch' for c in getattr(target, 'equipment_list', []))
                            if not has_brooch or p == target:
                                self.add_system_message(f"[{target_name}] 因為 Weird Woods 效果受到 2 點傷害")
                    if ret == 1 and extra:
                        self._handle_death(extra, allow_loot=False)
                    elif ret == 2 and len(extra) >= 2:
                        # Erstwhile Altar：extra=[from_player, to_player]
                        chooser_account = str(getattr(p, 'account', '') or '')
                        self._pending_steal = {
                            'from_player': extra[0],
                            'to_player': extra[1],
                            'chooser_account': chooser_account,
                            'source': 'Erstwhile Altar',
                        }
                        # update → 通知前端選擇從 extra[0] 奪取哪張裝備卡轉給 extra[1]
                    if int(getattr(self, 'room_status', 0) or 0) == 3:
                        return
                    p.status = 4
                    # update → 通知前端區域效果結果，進入攻擊選擇
            else:
                # 跳過區域效果
                p.status = 4
                # update → 通知前端進入攻擊選擇

        # ─── STATUS 4: 選擇攻擊 ──────────────────────────────────────────────
        # [UI操作]
        #   一般情況         → 前端顯示「攻擊」/「跳過」按鈕
        #   持有 Masamune    → 強制攻擊 (eqp_force_atk=True)，只顯示目標選擇介面，
        #                      前端禁用跳過按鈕。
        #                      若攻擊範圍內無合法目標，則自動視為無法攻擊，直接進入回合結束。
        #   持有 Handgun     → 只可選擇不同區域的玩家 (eqp_range_atk=True)
        #   持有 Machine Gun → 選擇任一目標後，同區域所有玩家均受傷害 (eqp_aoe=True)
        # [UI回傳] 攻擊 → next_step(action=True,  target=<目標player>)
        #          跳過 → next_step(action=False)
        elif p.status == 4:
            attackable_targets = self._get_attackable_targets(p)

            if not attackable_targets:
                # 無合法目標可攻擊（包含 Masamune 強制攻擊但無目標的情況）
                p.status = 6
                # update → 通知前端「目前無可攻擊目標」，自動進入回合結束

            elif action and target:
                if target not in attackable_targets:
                    # 目標不合法（不在攻擊範圍或已死亡），要求重新選擇
                    # update → 通知前端目標無效，請重新選擇可攻擊目標
                    return
                self._attack_target = target
                self.add_system_message(f"[{p.name or p.account}] 宣告攻擊 [{target.name or target.account}]")
                p.status = 5
                # update → 通知前端顯示「擲傷害骰」介面
            elif p.eqp_force_atk and not (action and target):
                # Masamune 強制攻擊但前端未提供目標，要求重新選擇
                # update → 通知前端 Masamune 強制攻擊，必須選擇目標
                pass  # 保持 status=4，等待含 target 的下一次呼叫
            else:
                # 選擇跳過攻擊
                self.add_system_message(f"[{p.name or p.account}] 本回合放棄攻擊")
                p.status = 6
                # update → 通知前端進入回合結束

        # ─── STATUS 5: 傷害結算 ──────────────────────────────────────────────
        # [UI操作] 前端顯示「擲傷害骰」按鈕，伺服器執行擲骰並自動結算傷害。
        #   一般攻擊 (eqp_atk_type=1)：擲 D4+D6，傷害 = |D6-D4| + eqp_atk
        #   Masamune (eqp_atk_type=2)：擲 1D4，傷害 = D4（必定命中）
        #   Machine Gun (eqp_aoe=True)：對目標同區域所有存活玩家施加相同傷害
        #   擊殺掠奪規則：
        #     - 預設：每名死亡玩家可掠奪 1 張裝備（由前端選擇）
        #     - Silver Rosary 或 Bob 發動能力：可選擇「全拿」
        # [UI回傳]
        #   next_step() → 觸發傷害擲骰
        #   若有待掠奪   → 前端呼叫 loot_from_kill(from_player, equipment, take_all)
        #                  全部處理完後再呼叫 next_step() 進入回合結束
        elif p.status == 5:
            # 若已進入掠奪待處理，等待前端完成選擇後再呼叫 next_step() 繼續流程
            if self._pending_kill_loot and self._pending_kill_loot.get('attacker') == p:
                if self._pending_kill_loot.get('deaths'):
                    # update → 通知前端仍有待處理掠奪項目
                    return
                self._pending_kill_loot = None
                self._attack_target = None
                p.status = 6
                # update → 通知前端掠奪完成，進入回合結束
                return

            # 根據攻擊類型擲骰
            if p.eqp_atk_type == 2:  # Masamune：擲 1D4，必定命中
                D4, _ = self.board.roll_dice(1)
                dmg = D4
                self.add_system_message(f"[{p.name or p.account}] 攻擊擲骰：D4={D4}，傷害={dmg}")
            elif int(getattr(p, 'atk_type', 1) or 1) == 2:  # 角色效果：擲 1D4
                D4, _ = self.board.roll_dice(1)
                dmg = D4
                self.add_system_message(f"[{p.name or p.account}] 攻擊擲骰：D4={D4}，傷害={dmg}")
            else:  # 一般攻擊：擲 D4+D6，傷害為差值
                D4, D6 = self.board.roll_dice(3)
                dmg = abs(D6 - D4)
                self.add_system_message(f"[{p.name or p.account}] 攻擊擲骰：D4={D4} D6={D6}，傷害={dmg}")

            if dmg > 0 and self._attack_target:
                self.add_system_message(f"[{p.name or p.account}] 對 [{self._attack_target.name or self._attack_target.account}] 造成 {dmg} 點傷害")
                deaths, counter_attackers = p.attack(self._attack_target, list(self.players.values()), dmg)

                if deaths:
                    self._handle_death(deaths, allow_loot=True)

                    lootable_deaths = [dead for dead in deaths if dead.equipment_list]
                    if lootable_deaths:
                        char_allow_full = bool(
                            p.character and
                            getattr(p.character, 'can_take_all_kill_loot', False) and
                            (
                                not getattr(p.character, 'take_all_kill_loot_requires_ability', False)
                                or self._can_activate_ability(p)
                            )
                        )
                        allow_full = p.eqp_rob or char_allow_full
                        self._pending_kill_loot = {
                            'attacker': p,
                            'deaths': lootable_deaths,
                            'allow_full': allow_full,
                        }
                        # update → 通知前端顯示擊殺掠奪選擇：
                        #          預設每位死亡玩家可選 1 張；若 allow_full=True 可選全拿
                        #          完成後呼叫 next_step() 繼續
                        return

                if counter_attackers and not self._pending_counter_attack:
                    counter_player = counter_attackers[0]
                    self._pending_counter_attack = {
                        'original_attacker': p,
                        'counter_player': counter_player,
                    }
                    p.status = 0
                    self.current_player = counter_player
                    self.current_player.status = 5
                    self._attack_target = p
                    return

            self._attack_target = None
            if self._pending_counter_attack and self._pending_counter_attack.get('counter_player') == p:
                original_attacker = self._pending_counter_attack.get('original_attacker')
                self._pending_counter_attack = None
                p.status = 0
                if original_attacker and original_attacker.is_alive:
                    self.current_player = original_attacker
                    self.current_player.status = 6
                else:
                    self._set_next_alive_player_after_trip(getattr(original_attacker, 'trip', ''))
                self._attack_target = None
                return

            p.status = 6
            # update → 通知前端顯示傷害骰結果、傷害量及死亡資訊

        # ─── STATUS 6: 回合結束 ──────────────────────────────────────────────
        # [UI操作] 伺服器通知前端是否有「回合結束」能力可用。
        #          若有可用能力：前端顯示「發動能力」按鈕及目標選擇介面。
        #          Guardian Angel (eqp_immortal) 的免疫效果在此步驟到期並重置。
        # [UI回傳] 發動能力 → next_step(action=True,  target=<目標player 或 None>)
        #          跳過     → next_step(action=False)
        elif p.status == 6:
            if action and self._can_activate_ability(p):
                self._use_ability_with_resolution(p, target)
                if int(getattr(self, 'room_status', 0) or 0) == 3:
                    return

            # 額外回合處理（Concealed Knowledge / Wight 特殊能力）
            if p.extra_turn > 0:
                p.extra_turn -= 1
                p.status = 1
                self.touch_turn_action()
                # update → 通知前端同一玩家開始額外回合
                return

            # 換下一位存活玩家
            p.status = 0
            self._set_next_alive_player_after_trip(p.trip)
            # update → 通知前端換下一位玩家開始回合

    def card_effect(self, target=None, choice=None):
        """
        執行當前 active_card（已抽到的行動卡）的效果。
        由前端在 status=3 抽到行動卡後，顯示卡牌讓玩家確認目標，再呼叫此函數。

        [UI操作]
          target='self' / 'others' / 'all'
                         → 不需選擇目標，前端直接呼叫
          target='other' / 'one'
                         → 前端顯示玩家選擇介面，選定後呼叫
          Dynamite
                         → 伺服器自動擲骰並結算，骰出 7 則無任何效果；
                           前端無需額外操作，直接呼叫 card_effect()

        [UI回傳] 一般            → card_effect(target=<目標player>)
                 self/all/others → card_effect()

        結算後若 ret=2 (裝備轉移)，前端需進一步呼叫 steal_equipment() 選擇裝備。
        """
        if not self.active_card:
            return

        self.touch_turn_action()

        if self._pending_green_card:
            return

        card_target = str(getattr(self.active_card, 'target', '') or '')
        card_color = str(getattr(self.active_card, 'color', '') or '').lower()
        resolved_target = target
        if resolved_target is None and card_target == 'self':
            resolved_target = self.current_player

        if self._initial_green_card_executed and card_color == 'green':
            # 初始綠卡固定由當前玩家對自己結算，不進入「指定他人」流程。
            resolved_target = self.current_player

        normalized_choice = str(choice or '').strip().lower()
        force_effect = None
        if normalized_choice in ('effect1', 'activate', 'yes', '1', 'true'):
            force_effect = 1
        elif normalized_choice in ('effect2', 'skip', 'no', '2', 'false'):
            force_effect = 2

        # 綠卡 (隱士小屋抽到) 採「指定目標後由目標玩家確認」流程
        if (not self._initial_green_card_executed) and card_color == 'green' and card_target in ('other', 'one') and target is not None:
            self.add_system_message(f"[{self.current_player.name or self.current_player.account}] 指定 [{target.name or target.account}] 接收綠卡 {str(getattr(self.active_card, 'name', '') or '-')}")
            self._pending_green_card = {
                'from_player': self.current_player,
                'to_player': target,
                'card': self.active_card,
                'choice': None,
            }
            # 保持 status=3，等待目標玩家確認後才真正結算與棄牌
            return

        needs_choice = False
        requires_choice_fn = getattr(self.active_card, 'requires_choice', None)
        if callable(requires_choice_fn):
            needs_choice = bool(requires_choice_fn(self.current_player, resolved_target, self))
        if needs_choice and force_effect not in (1, 2):
            return

        target_name = str(getattr(resolved_target, 'name', '') or getattr(resolved_target, 'account', '') or '-') if resolved_target is not None else '-'
        card_name = str(getattr(self.active_card, 'name', '') or '-')
        card_color = str(getattr(self.active_card, 'color', '') or '-')
        self.add_system_message(f"[{self.current_player.name or self.current_player.account}] 使用卡片 {card_name}（{card_color}），目標：[{target_name}]")
        snapshot = self._capture_effect_snapshot()
        ret, extra = self._run_active_card_action(target=resolved_target, force_effect=force_effect)
        self._emit_effect_delta_messages(snapshot, '卡片', card_name)
        if card_name == 'Blessing' and resolved_target is not None:
            dice_d6 = int(getattr(getattr(self, 'board', None), 'dice', {}).get('D6', 0) or 0)
            if dice_d6 > 0:
                self.add_system_message(f"[{resolved_target.name or resolved_target.account}] 因為 白卡(Blessing) 恢復 {dice_d6} 點傷害")
        if card_name == 'First Aid' and resolved_target is not None:
            self.add_system_message(f"[{resolved_target.name or resolved_target.account}] 因為 白卡(First Aid) 傷害變為 7")
        if card_name == 'Spiritual Doll':
            dice_d6 = int(getattr(getattr(self, 'board', None), 'dice', {}).get('D6', 0) or 0)
            if dice_d6 > 0:
                if dice_d6 <= 4:
                    self.add_system_message(f"[Spiritual Doll] 擲出 D6={dice_d6}，目標承受效果")
                else:
                    self.add_system_message(f"[Spiritual Doll] 擲出 D6={dice_d6}，改為自己承受效果")
        self._finish_active_card_resolution(resolved_target, ret, extra)

    def steal_equipment(self, from_player, to_player, equipment):
        """
        執行裝備轉移，用於 card_effect ret=2 或 Erstwhile Altar 奪取裝備。
        前端在顯示 from_player 的裝備清單後，玩家選定一張再呼叫此函數。

        [UI操作] 前端顯示 from_player 的裝備清單讓玩家選擇。
        [UI回傳] steal_equipment(from_player, to_player, <選定的 equipment 物件>)
        """
        self.touch_turn_action()
        from_player.divest(equipment)
        to_player.equip(equipment)
        self.add_system_message(f"[{to_player.name or to_player.account}] 從 [{from_player.name or from_player.account}] 取得裝備 {str(getattr(equipment, 'name', '') or '-')}")
        # 檢查裝備取得後勝利條件（如 Franklin）
        if to_player.check_win_timing == 2:
            self._check_all_victory(equip_trigger=to_player)
        if int(getattr(self, 'room_status', 0) or 0) == 3:
            self._pending_steal = None
            return
        if self.current_player and self.current_player.status == 3 and self.current_player.area and self.current_player.area.name == "Erstwhile Altar":
            self.current_player.status = 4
        if self._pending_steal and self._pending_steal.get('from_player') == from_player and self._pending_steal.get('to_player') == to_player:
            self._pending_steal = None
            if self.current_player:
                self.current_player.status = 4
        # update → 通知前端裝備轉移完成
