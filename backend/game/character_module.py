from .setting import camp_setting

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

        self.hp = 0
        self.force_atk = False
        self.leech = 0
        self.counter_atk = False

        self.can_use_ability = True
        self.ability_timing = 0 # 0: passive, 1: start, 2: move, 3:area_effect, 4: attack, 5: defense, 6: end, 7: green card, 8: any, 9:dead, 10:start_passive
        self.target = "self" # all, others, area, one, other, self, discard

    def assign(self, user):
        user.camp = self.camp
        user.hp = self.hp
        # 無需揭露即可使用的能力（例如 Unknown）在配角時就可用。
        if not getattr(self, 'ability_requires_reveal', True):
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

    def ability(self, user, target, rooms):
        pass

    def requires_green_card_choice(self, user, card, source, rooms):
        return False

    def get_green_card_force_effect(self, user, card, source, rooms, choice=None):
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

            target_index = (my_index - 1) % len(room.action_order) if user.can_use_ability else (my_index + 1) % len(room.action_order)
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
        self.ability_timing = 8 # any
        self.target = "self"

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
        # 遊戲結束的條件是room_status == 3 (after game)
        if room.room_status == 3:
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
        
        # 條件2: 遊戲結束時身處於「古代祭壇」
        if not ret and room.room_status == 3:
            if user.area_name == "Erstwhile Altar":
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

    def ability(self, user, target, rooms):
        ret = False
        if user.can_use_ability:
            user.reveal_character()
            user.can_use_ability = False
            ret = True
        return ret

    def win_check(self, room, user, dead):
        ret = False
        # 勝利條件: 你是第一位死亡的角色，或是所有暗影角色死亡而你仍存活
        
        # 條件1: 是第一位死亡的角色
        dead_count = sum(1 for p in room.players.values() if not p.is_alive)
        if dead_count == 1 and not user.is_alive:
            ret = True

        # 條件2: 所有暗影角色死亡而自己仍存活
        if not ret:
            shadow_alive = any(p.camp == 'Shadow' and p.is_alive for p in room.players.values())
            if not shadow_alive and user.is_alive:
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
