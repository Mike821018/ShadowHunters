from .setting import camp_setting
from typing import Optional

class Character():
    def __init__(self):
        self.is_extend = False
        self.name = ''
        self.capital = ''
        self.camp = '' # Shadow, Hunter, Civilian

        # extensible behavior flags (避免在遊戲判定中硬寫角色名稱)
        self.ability_requires_reveal = True
        self.can_be_revealed_by_disenchant_mirror = False
        self.can_take_all_kill_loot = False
        self.take_all_kill_loot_requires_ability = False
        self.intercepts_green_cards = False
        # Victory timing: 1=after death resolution, 2=after gaining equipment.
        self.check_win_timing = 1
        # End-game victory flags:
        # - has_end_game_win_check: character has extra victory check at settlement phase.
        # - defer_win_check_until_game_end: skip regular timing checks, only evaluate at settlement.
        self.has_end_game_win_check = False
        self.defer_win_check_until_game_end = False

        self.hp = 0
        self.force_atk = False
        self.leech = 0
        self.counter_atk = False

        self.can_use_ability = True
        self.ability_timing = 0 # 0: passive, 1: start, 2: move, 3:area_effect, 4: attack, 5: defense, 6: end, 7: green card, 8: any, 9:dead, 10:start_passive, 11:standby (不限自己回合，隨時可發動)
        self.target = "self" # all, others, area, one, other, self, discard

    def assign(self, user):
        user.camp = self.camp
        user.hp = self.hp
        # 2026-10-09 修正：這裡原本會把 self.counter_atk（狼男＝True）在一開局角色分配
        # 時就直接複製給玩家，導致狼男還沒揭露身份就已經能發動被動反打。Mike 確認這個
        # 自製版本的規則是「要揭露才能反擊」，不該像原版桌遊那樣允許未揭露反打。
        # counter_atk（連同 force_atk、leech 這兩個同樣是被動戰鬥屬性）本來就只在
        # reveal() 裡複製一次，開局分配這裡不該提前複製，拿掉這行就對了。
        user.check_win_timing = int(getattr(self, 'check_win_timing', 1) or 1)
        # UI 與狀態同步規則：開場皆視為可用（除非後續被禁用或已用盡）。
        # ability_requires_reveal 僅影響「可否主動發動」，不影響可用顯示。
        user.can_use_ability = bool(self.can_use_ability)

    def reveal(self, user):
        user.character_name = self.name
        user.force_atk = self.force_atk
        user.leech = self.leech
        user.counter_atk = self.counter_atk
        # Some passive combat profiles (e.g., Valkyrie) only become active after reveal.
        user.atk_type = getattr(self, 'atk_type', user.atk_type)

        user.can_use_ability = self.can_use_ability
        user.character_reveal = True

    def unreveal(self, user):
        # 2026-10-20 新增：GM 在遊戲進行中可以把已揭露、但還活著的玩家身分重新隱藏（反揭露），
        # 用來修正 GM 自己手誤揭露或想暫時隱藏身分等情況。這裡刻意做成 reveal() 的完整相反：
        # 不只是把 character_reveal 改回 False，連同 reveal() 當時一次性複製過去的被動戰鬥
        # 屬性（force_atk／leech／counter_atk／atk_type）也一併還原成未揭露前的預設值，
        # 否則像狼男的反打、Valkyrie 的攻擊骰這類「只在揭露後才生效」的被動效果，會在玩家
        # 被反揭露、身分理論上重新隱藏之後仍然繼續套用，造成戰鬥判定跟顯示狀態對不起來。
        user.character_name = ''
        user.force_atk = False
        user.leech = 0
        user.counter_atk = False
        user.atk_type = 1
        user.can_use_ability = False
        user.character_reveal = False

    def ability(self, user, target, rooms) -> bool:
        return False

    def requires_green_card_choice(self, user, card, source, rooms) -> bool:
        return False

    def get_green_card_force_effect(self, user, card, source, rooms, choice=None) -> Optional[int]:
        return None

    def disable_ability(self):
        self.can_use_ability = False

    def win_check(self, room, user, dead):
        ret = False

        if self.camp == 'Hunter':
            for p in room.players.values():
                if p.camp == 'Shadow' and p.is_alive:
                    break
            else:
                ret = True
        elif self.camp == 'Shadow':
            hunter_alive = False
            civilian_dead_cnt = 0
            for p in room.players.values():
                if p.camp == 'Hunter' and p.is_alive:
                    hunter_alive = True
                elif p.camp == 'Civilian' and not p.is_alive:
                    civilian_dead_cnt += 1
                else:
                    pass
            if civilian_dead_cnt > 2 or not hunter_alive:
                ret = True
        else:
            pass

        return ret

class Wight(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Wight'
        self.capital = 'W'
        self.camp = 'Shadow'
        self.hp = 14
        self.is_extend = True
        self.ability_timing = 6 # end
        self.target = "self"

        self.extra_turn = 0

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            death_cnt = 0
            for p in rooms.players.values():
                if not p.is_alive:
                    death_cnt += 1
            user.extra_turn += death_cnt
            user.can_use_ability = False
            ret = True
        return ret

    def disable_ability(self):
        self.can_use_ability = False

class Vampire(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Vampire'
        self.capital = 'V'
        self.camp = 'Shadow'
        self.hp = 13
        self.ability_timing = 0 # passive
        self.target = "self"
        self.can_be_revealed_by_disenchant_mirror = True

        self.leech = 2

    def disable_ability(self):
        if self.can_use_ability:
            self.leech = 0
        self.can_use_ability = False

class Werewolf(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Werewolf'
        self.capital = 'W'
        self.camp = 'Shadow'
        self.hp = 14
        self.ability_timing = 0 # passive
        self.target = "self"
        self.can_be_revealed_by_disenchant_mirror = True

        self.counter_atk = True

    def disable_ability(self):
        if self.can_use_ability:
            self.counter_atk = False
        self.can_use_ability = False

class Soul(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Ultra Soul'
        self.capital = 'U'
        self.camp = 'Shadow'
        self.hp = 11
        self.ability_timing = 1 # start
        self.is_extend = True
        self.target = "one"
    
    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability and target and getattr(target, 'is_alive', False):
            target_area_name = str(getattr(getattr(target, 'area', None), 'name', '') or '')
            if target_area_name == "Underworld Gate":
                target.defence(3, ignore_defence=True)
                user.can_use_ability = False
                ret = True
        return ret

class Unknown(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Unknown'
        self.capital = 'U'
        self.camp = 'Shadow'
        self.hp = 11
        self.ability_timing = 0 # passive
        self.target = "self"
        self.ability_requires_reveal = False
        self.intercepts_green_cards = True

    def requires_green_card_choice(self, user, card, source, rooms):
        return not bool(getattr(card, 'no_choice', False))

    def get_green_card_force_effect(self, user, card, source, rooms, choice=None):
        if bool(getattr(card, 'no_choice', False)):
            return 1

        normalized_choice = str(choice or '').strip().lower()
        if normalized_choice == 'effect1':
            normalized_choice = 'activate'
        elif normalized_choice == 'effect2':
            normalized_choice = 'skip'

        card_requires_choice = False
        requires_choice_fn = getattr(card, 'requires_choice', None)
        if callable(requires_choice_fn):
            card_requires_choice = bool(requires_choice_fn(source, user, rooms))

        # 憤怒/勒索/貪婪這類卡片：Unknown 可先決定是否發動能力。
        if card_requires_choice:
            if normalized_choice in ('activate', 'effect1', 'activate_give'):
                return 1
            if normalized_choice in ('skip', 'effect2', 'activate_damage'):
                return 2
            if normalized_choice in ('normal', 'no_activate', 'none', '0', 'false'):
                # 2026-10-13：原本回 0 代表「交給原始規則判定」，但謎的真實陣營固定就是暗影，
                # 遇到會猜暗影的綠卡（憤怒／貪婪）時，原始規則一定會判定成功，等於選了
                # 「不發動」也沒用，效果照樣發生。謎的能力應該是完全由自己決定要不要讓
                # 這張卡生效，不是「不發動就照原始規則」，所以改成回傳 3，代表強制不生效。
                return 3
            return None

        if normalized_choice == 'activate':
            return 1
        if normalized_choice == 'skip':
            return 2
        return None

class Valkyrie(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Valkyrie'
        self.capital = 'V'
        self.camp = 'Shadow'
        self.hp = 13
        self.ability_timing = 0 # passive
        self.target = "self"

        self.atk_type = 2

    def disable_ability(self):
        if self.can_use_ability:
            self.atk_type = 1
        self.can_use_ability = False

class Gregor(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Gregor'
        self.capital = 'G'
        self.camp = 'Hunter'
        self.hp = 14
        self.is_extend = True
        self.ability_timing = 6 # end
        self.target = "self"

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            user.immortal = True
            user.immortal_source = 'Gregor'
            user.can_use_ability = False
            ret = True
        return ret

class Emi(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Emi'
        self.capital = 'E'
        self.camp = 'Hunter'
        self.hp = 10
        self.ability_timing = 2 # move
        self.target = "area"
    
    def ability(self, user, target, rooms): # target 是玩家選擇的目的 area 物件
        ret = False
        field = rooms.board.field
        n = len(field)
        index = field.index(user.area)
        choose_area = [field[(index - 1) % n], field[(index + 1) % n]]
        if target in choose_area:
            user.move(target)  # 正確更新 area / area_name / zone
            ret = True
        return ret

class George(Character):
    def __init__(self):
        super().__init__()
        self.name = 'George'
        self.capital = 'G'
        self.camp = 'Hunter'
        self.hp = 14
        self.ability_timing = 1 # start
        self.target = "other"
    
    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            dmg, _ = rooms.board.roll_dice(1)
            target.defence(dmg, ignore_defence=True)
            user.can_use_ability = False
            ret = True
        return ret

class Franklin(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Franklin'
        self.capital = 'F'
        self.camp = 'Hunter'
        self.hp = 12
        self.ability_timing = 1 # start
        self.target = "other"
    
    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            _, dmg = rooms.board.roll_dice(2)
            target.defence(dmg, ignore_defence=True)
            user.can_use_ability = False
            ret = True
        return ret

class Ellen(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Ellen'
        self.capital = 'E'
        self.camp = 'Hunter'
        self.hp = 10
        self.is_extend = True
        self.ability_timing = 1 # start
        self.target = "other"

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability and target and getattr(target, 'is_alive', False):
            target.disable_ability()
            user.can_use_ability = False
            ret = True
        return ret

class FuKa(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Fu-ka'
        self.capital = 'F'
        self.camp = 'Hunter'
        self.hp = 12
        self.is_extend = True
        self.ability_timing = 1 # start
        self.target = "other"

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            target.damage = 7
            user.can_use_ability = False
            ret = True
        return ret

class Agnes(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Agnes'
        self.capital = 'A'
        self.camp = 'Civilian'
        self.hp = 8
        self.is_extend = True
        self.ability_timing = 1 # start
        self.target = "self"

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            # 只有實際發動能力時才切換為追隨下家。
            user.agnes_supports_next_player = True
            user.can_use_ability = False
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 預設追隨上家；發動能力後改為追隨下家。
        # 以 action_order 的相鄰順序判定，不跳過死亡玩家。

        my_account = user.account
        if my_account in room.action_order:
            my_index = room.action_order.index(my_account)
            supports_next_player = bool(getattr(user, 'agnes_supports_next_player', False))
            target_index = (my_index + 1) % len(room.action_order) if supports_next_player else (my_index - 1) % len(room.action_order)
            target_account = room.action_order[target_index]
            target_player = room.players.get(target_account)
            if target_player and target_player.character and hasattr(target_player.character, 'win_check'):
                ret = target_player.character.win_check(room, target_player, dead)

        return ret


class Allie(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Allie'
        self.capital = 'A'
        self.camp = 'Civilian'
        self.hp = 8
        self.ability_timing = 11 # standby：不限自己回合，隨時可發動
        self.target = "self"
        self.has_end_game_win_check = True
        self.defer_win_check_until_game_end = True

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            user.damage = 0
            user.can_use_ability = False
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 當遊戲結束時，你仍然存活
        # 實際觸發時機由 room._check_all_victory 的結算階段旗標控制。
        if int(getattr(room, 'room_status', 0) or 0) == 3:
            ret = user.is_alive
        return ret

class Charles(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Charles'
        self.capital = 'C'
        self.camp = 'Civilian'
        self.hp = 11
        self.ability_timing = 4 # attack
        self.target = "self"

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability and user.damage < (user.hp-3):
            user.damage += 2
            if user.damage >= (user.hp-2):
                user.can_use_ability = False
            user.status = 4 # 表示正在攻擊
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 當你在攻擊階段造成角色死亡，且總死亡人數達到3人或以上
        # 只有當你是當前輪到的玩家時，才視為你「殺死」了對方。
        if room.current_player == user and user.status == 5 and dead:
            # 確認此輪確實有人死亡
            if any(dp and not dp.is_alive for dp in dead):
                dead_count = sum(1 for p in room.players.values() if not p.is_alive)
                if dead_count >= 3 and user.is_alive:
                    ret = True
        return ret

class Bryan(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Bryan'
        self.capital = 'B'
        self.camp = 'Civilian'
        self.hp = 10
        self.is_extend = True
        self.ability_timing = 9 # dead
        self.target = "self"
        self.ability_requires_reveal = False
        self.has_end_game_win_check = True

    def ability(self, user, target, rooms):
        ret = False
        if (
            user.can_use_ability
            and target
            and not target.is_alive
            and target.hp < 12
            and getattr(rooms, 'current_player', None) == user
            and int(getattr(user, 'status', 0) or 0) == 5
        ):
            user.reveal_character()
            user.can_use_ability = False
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 當你的攻擊造成HP大於13的角色死亡時，或是遊戲結束時，你身處於「古代祭壇」
        
        # 條件1: 檢查是否有HP>13的角色死亡 (僅在攻擊階段才計算)
        if user.status == 5 and dead:
            for dead_player in dead:
                if dead_player and not dead_player.is_alive and dead_player.hp > 13:
                    ret = True
                    break

        # 條件2: 僅在結算階段（room_status==3 且 dead is None）檢查古代祭壇勝利。
        if not ret and dead is None and int(getattr(room, 'room_status', 0) or 0) == 3:
            area_obj = getattr(user, 'area', None)
            area_name = str(getattr(area_obj, 'name', '') or getattr(user, 'area_name', '') or '').strip()
            if area_name == "Erstwhile Altar":
                ret = True
        
        return ret

class Bob(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Bob'
        self.capital = 'B'
        self.camp = 'Civilian'
        self.hp = 10
        self.ability_timing = 9 # dead
        self.target = "other"
        self.can_take_all_kill_loot = True
        self.take_all_kill_loot_requires_ability = True
        self.check_win_timing = 2

        self.required_equipment = 4

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability and user.status == 5\
            and target and not target.is_alive:
            for eq in list(target.equipment_list):
                user.equip(eq)
                target.divest(eq)
                self.required_equipment = 5
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 你擁有超過4張裝備時。如果你有使用過特殊能力改為5張裝備。
        equipment_count = len(user.equipment_list)
        if equipment_count > self.required_equipment:
            ret = True
        return ret

class Catherine(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Catherine'
        self.capital = 'C'
        self.camp = 'Civilian'
        self.hp = 11
        self.is_extend = True
        self.ability_timing = 10 # start_passive
        self.target = "self"

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            user.heal(1)
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 你是第一位死亡的角色，或是最後只剩下你以及另外一位角色存活
        
        # 條件1: 是第一位死亡的角色
        dead_count = sum(1 for p in room.players.values() if not p.is_alive)
        if dead_count == 1 and not user.is_alive:
            ret = True

        # 條件2: 最後只剩下你以及另外一位角色存活
        if not ret:
            alive_count = sum(1 for p in room.players.values() if p.is_alive)
            if alive_count == 2 and user.is_alive:
                ret = True
        
        return ret

class Daniel(Character):
    def __init__(self):
        super().__init__()
        self.name = 'Daniel'
        self.capital = 'D'
        self.camp = 'Civilian'
        self.hp = 13
        self.ability_timing = 9 # dead
        self.target = "self"
        self.ability_requires_reveal = False
        self.has_end_game_win_check = True

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            user.reveal_character()
            user.can_use_ability = False
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 你是第一位死亡的角色，或是所有暗影角色死亡而你仍存活。
        # 若本局根本沒有暗影角色（例如中立大亂鬥），則第二條件只在遊戲結束結算時檢查，
        # 避免被其他角色死亡誤觸發。

        # 條件1: 是第一位死亡的角色
        dead_count = sum(1 for p in room.players.values() if not p.is_alive)
        if dead_count == 1 and not user.is_alive:
            ret = True

        # 條件2: 所有暗影角色死亡而自己仍存活
        if not ret:
            shadow_players = [p for p in room.players.values() if getattr(p, 'camp', '') == 'Shadow']
            shadow_count = len(shadow_players)
            shadow_alive = any(getattr(p, 'is_alive', False) for p in shadow_players)

            if shadow_count == 0:
                if dead is None and int(getattr(room, 'room_status', 0) or 0) == 3 and user.is_alive:
                    ret = True
            elif not shadow_alive and user.is_alive:
                ret = True

        return ret

class David(Character):
    def __init__(self):
        super().__init__()
        self.name = 'David'
        self.capital = 'D'
        self.camp = 'Civilian'
        self.hp = 13
        self.is_extend = True
        self.ability_timing = 8 # any
        self.target = "discard"
        self.check_win_timing = 2

    def ability(self, user, target, rooms): # 這裡的target是指玩家選擇的裝備卡，而不是技能的發動對象
        ret = False
        if user.can_use_ability\
                and target and hasattr(target, 'type') and target.type == "Equipment"\
                and target in rooms.board.card_deck['{} Discard'.format(target.color)]:
            user.equip(target)
            rooms.board.card_deck['{} Discard'.format(target.color)].remove(target)
            user.can_use_ability = False
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 當你持有「神聖法袍」、「秘銀念珠」、「辟邪護符」、「隆基努司之槍」4種裝備中的任意3種以上時

        target_equipments = ["Holy Robe", "Silver Rosary", "Talisman", "Spear of Longinus"]
        owned_equipment_names = [eq.name for eq in user.equipment_list if getattr(eq, 'type', None) == "Equipment" and hasattr(eq, 'name')]

        match_count = sum(1 for target_eq in target_equipments if target_eq in owned_equipment_names)
        if match_count >= 3:
            ret = True

        return ret

shadow_camp=[Wight, Vampire, Werewolf, Soul, Unknown, Valkyrie]
hunter_camp=[Gregor, Emi, George, Franklin, Ellen, FuKa]
civilian_camp=[Agnes, Allie, Charles, Bryan, Bob, Catherine, Daniel, David]
