from typing import Any


class player():
    def __init__(self, room, profile):
        self.room = room

        self.profile = profile
        self.account = profile['account']
        self.trip = self.account
        self.trip_display = profile.get('trip_display', profile.get('trip', ''))

        # Keep a stable display nickname for chat/system message/record snapshots.
        self.name = str(profile.get('name', '') or '').strip()
        self.color = '' # White, Black, Red, Blue, Yellow, Green, Purple, Orange

        self.is_alive = True
        self.status = 0 # 0: Waiting, 1: Start, 2: Move, 3:Area_effect, 4: Attack, 5: Damage calculation, 6: End
        self.character: Any = None
        self.character_name = ''
        self.camp = '' # Shadow, Hunter, Civilian
        self.character_reveal = False
        self.can_use_ability = False
        # ready: 可使用, used: 已主動使用一次性能力, disabled: 被外力封鎖, none: 無需顯示
        self.ability_status = 'none'
        self.check_win_timing = 1 # 1: after someone dead, 2: after get equipment

        self.area: Any = None
        self.area_name = '' # Hermit's Cabin, Church, Cemetery, Underworld Gate, Weird Woods, Erstwhile Altar
        self.zone = 0 # 1, 2, 3

        self.damage = 0
        self.hp = 0
        self.atk_type = 1 # 1:|1D6-1D4|, 2:1D4
        self.df = 0
        self.force_atk = False
        self.leech = 0
        self.immortal = False
        self.extra_turn = 0
        self.immortal_source = ''

        self.equipment_list = []
        self.eqp_atk_type = 1 # 1:|1D6-1D4|(六面骰與四面骰的差值), 2:1D4(四面骰的點數)
        self.eqp_atk = 0
        self.eqp_df = 0
        self.eqp_aoe = False
        self.eqp_range_atk = False
        self.eqp_force_atk = False
        self.eqp_immortal = False
        self.eqp_immortal_source = ''
        self.eqp_rob = False

        # 逾時暴斃狀態（AFK 死亡）
        self.is_boomed = False

    ####################
    #  before game
    ####################

    def choose_color(self, color):
        self.color = color
        # update

    ####################
    #  game start
    ####################

    def assign_character(self, character):
        self.character = character
        character.assign(self)
        self.ability_status = 'ready' if bool(self.can_use_ability) else 'disabled'
        # update

    ####################
    #  in game
    ####################

    def reveal_character(self):
        if not self.character:
            return
        self.character.reveal(self)
        if self.ability_status not in ('used', 'disabled'):
            self.ability_status = 'ready' if bool(self.can_use_ability) else 'disabled'
        # update

    def use_ability(self, target):
        ret = False
        if self.character and self.character.can_use_ability:
            ret = bool(self.character.ability(self, target, self.room))
            if ret:
                if self.can_use_ability:
                    self.ability_status = 'ready'
                else:
                    self.ability_status = 'used'
        return ret

    def disable_ability(self):
        """Disable this player's character ability and synchronize exposed combat flags."""
        if not self.character:
            return False

        self.character.disable_ability()
        self.can_use_ability = False
        self.ability_status = 'disabled'

        if self.character_reveal:
            self.force_atk = getattr(self.character, 'force_atk', self.force_atk)
            self.leech = getattr(self.character, 'leech', self.leech)
            self.counter_atk = getattr(self.character, 'counter_atk', self.counter_atk)
            self.atk_type = getattr(self.character, 'atk_type', self.atk_type)

        return True

    def check_move(self, D4, D6):
        total = D4 + D6
        if self.area and total in self.area.number:
            return None
        board = getattr(self.room, 'board', None)
        if not board:
            return None
        if total == 7:
            return 'Any'
        return board.get_area_by_roll_total(total)

    def move(self, area):
        self.area = area
        self.area_name = area.name
        self.zone = area.zone
        # update

    def execute_action(self, target):
        if not self.area:
            return
        self.area.action(self, target, self.room)
        # update

    def check_damage(self, D4, D6):
        damage = 0

        if self.atk_type == 1: # |1D6-1D4|
            if 0 in [D4, D6]:
                return -1
            damage = abs(D6-D4)
        else: # 2:1D4
            if D4 == 0:
                return -1
            damage = D4

        return damage

    def attack(self, target, players, dice_dmg):
        ret = [] # return death
        counter_attackers = []
        attack_list = []
        if not self.eqp_aoe:
            attack_list = [target]
        else:
            for p in players:
                if p.is_alive and p != self:
                    if p.zone and p.zone == target.zone:
                        attack_list.append(p)

        for p in attack_list:
            dmg = p.defence(dice_dmg, additional_damage=self.eqp_atk, is_attack_damage=True)
            if dmg > 0 and self.leech:
                self.heal(self.leech)
            if p.check_death():
                ret.append(p)
            elif dmg > 0 and p.is_alive and getattr(p, 'counter_atk', False):
                counter_attackers.append(p)

        return ret, counter_attackers

    def defence(self, damage, additional_damage=0, ignore_defence=False, is_attack_damage=False):
        # 無敵效果：
        # - immortal (角色能力)：免疫所有傷害
        # - eqp_immortal (Guardian Angel)：僅免疫玩家攻擊傷害
        if self.immortal or (self.eqp_immortal and is_attack_damage):
            return 0

        if ignore_defence:
            base_damage = damage
        else:
            base_damage = damage - self.df - self.eqp_df

        # 規則：先判斷基礎傷害是否破防，再套用裝備/效果增減。
        if base_damage <= 0:
            return 0

        final_damage = max(0, base_damage + additional_damage)
        if final_damage > 0:
            self.damage += final_damage
        # update
        return final_damage

    def heal(self, damage):
        self.damage -= damage
        if self.damage < 0:
            self.damage = 0
        # update

    def check_death(self):
        ret = False
        if self.damage >= self.hp:
            self.is_alive = False
            ret = True
        # update
        return ret

    def equip(self, equipment):
        self.equipment_list.append(equipment)
        equipment.equip(self)
        # update

    def divest(self, equipment):
        self.equipment_list.remove(equipment)
        equipment.divest(self)
        # update

    def steal(self, target, equipment):
        self.divest(equipment)
        equipment.divest(self)
        target.equip(equipment)
        equipment.equip(target)
        # update

