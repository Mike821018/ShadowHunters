from . import area_module

class Card():
    def __init__(self):
        self.name = ''
        self.color = '' # Green, White, Black
        self.type = '' # Equipment, Action
        self.target = '' # all, others, area, one, other, self
    
    def action(self, user, target, rooms): # for action use, target=character
        ret = 0 # 0: no effect, 1: death, 2: steal, 3: reveal, 4: choose area
        extra = [] # for death: [death players], for steal: [from_player, to_player], for reveal: [to_player]
        return ret, extra

    def requires_choice(self, user, target, rooms):
        return False
    
    def equip(self, target): # for equipment use, target=character
        pass
    
    def divest(self, target): # for equipment use, target=character
        pass

class Aid(Card):
    def __init__(self):
        super().__init__()
        self.name = "Aid"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是獵人。如果是的話回復1點傷害，
        # 如果你沒有受傷的話則改為受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp == "Hunter":
                effect = True
        if effect:
            # 如果猜對，先檢查是否有損傷；若無損傷則改為受到1點傷害。
            if target.damage > 0:
                target.heal(1)
            else:
                target.defence(1, ignore_defence=True)
        return ret, extra

class Anger(Card):
    def __init__(self):
        super().__init__()
        self.name = "Anger"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是獵人或暗影。如果是的話請給你的上家一張裝備卡、
        # 如果你沒有裝備卡的話則受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp in ["Hunter", "Shadow"]:
                effect = True
        if effect:
            if target.equipment_list:
                ret = 2
                # 利用rooms找到上家資訊回傳，讓前端知道要將裝備卡給哪位玩家
                if rooms and hasattr(rooms, 'action_order') and hasattr(rooms, 'players'):
                    my_account = target.account
                    if my_account in rooms.action_order:
                        my_index = rooms.action_order.index(my_account)
                        # 從上家開始找活著的玩家
                        for i in range(1, len(rooms.action_order)):
                            prev_index = (my_index - i) % len(rooms.action_order)
                            prev_account = rooms.action_order[prev_index]
                            prev_player = rooms.players.get(prev_account)
                            if prev_player and prev_player.is_alive and prev_player != target:
                                extra = [target, prev_player]
                                break
            else:
                target.defence(1, ignore_defence=True)
                if target.check_death():
                    ret = 1
                    extra = [target]
        return ret, extra

class Blackmail(Card):
    def __init__(self):
        super().__init__()
        self.name = "Blackmail"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是中立或獵人。如果是的話請給你的上家一張裝備卡、
        # 如果你沒有裝備卡的話則受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp in ["Civilian", "Hunter"]:
                effect = True
        if effect:
            if target.equipment_list:
                ret = 2
                # 利用rooms找到上家資訊回傳，讓前端知道要將裝備卡給哪位玩家
                if rooms and hasattr(rooms, 'action_order') and hasattr(rooms, 'players'):
                    my_account = target.account
                    if my_account in rooms.action_order:
                        my_index = rooms.action_order.index(my_account)
                        # 從上家開始找活著的玩家
                        for i in range(1, len(rooms.action_order)):
                            prev_index = (my_index - i) % len(rooms.action_order)
                            prev_account = rooms.action_order[prev_index]
                            prev_player = rooms.players.get(prev_account)
                            if prev_player and prev_player.is_alive and prev_player != target:
                                extra = [target, prev_player]
                                break
            else:
                target.defence(1, ignore_defence=True)
                if target.check_death():
                    ret = 1
                    extra = [target]
        return ret, extra

class Bully(Card):
    def __init__(self):
        super().__init__()
        self.name = "Bully"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你的最大血量在11以下。如果是的話受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.hp <= 11:
                effect = True
        if effect:
            target.defence(1, ignore_defence=True)
            if target.check_death():
                ret = 1
                extra = [target]
        return ret, extra

class Exorcism(Card):
    def __init__(self):
        super().__init__()
        self.name = "Exorcism"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是暗影。如果是的話受到2點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp == "Shadow":
                effect = True
        if effect:
            target.defence(2, ignore_defence=True)
            if target.check_death():
                ret = 1
                extra = [target]
        return ret, extra

class Greed(Card):
    def __init__(self):
        super().__init__()
        self.name = "Greed"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是中立或暗影。如果是的話請給你的上家一張裝備卡、
        # 如果你沒有裝備卡的話則受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp in ["Civilian", "Shadow"]:
                effect = True
        if effect:
            if target.equipment_list:
                ret = 2
                # 利用rooms找到上家資訊回傳，讓前端知道要將裝備卡給哪位玩家
                if rooms and hasattr(rooms, 'action_order') and hasattr(rooms, 'players'):
                    my_trip = target.trip
                    if my_trip in rooms.action_order:
                        my_index = rooms.action_order.index(my_trip)
                        # 從上家開始找活著的玩家
                        for i in range(1, len(rooms.action_order)):
                            prev_index = (my_index - i) % len(rooms.action_order)
                            prev_trip = rooms.action_order[prev_index]
                            prev_player = rooms.players.get(prev_trip)
                            if prev_player and prev_player.is_alive and prev_player != target:
                                extra = [target, prev_player]
                                break
            else:
                target.defence(1, ignore_defence=True)
                if target.check_death():
                    ret = 1
                    extra = [target]
        return ret, extra

class Huddle(Card):
    def __init__(self):
        super().__init__()
        self.name = "Huddle"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是暗影。如果是的話回復1點傷害、
        # 如果你沒有受傷的話則改為受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp == "Shadow":
                effect = True
        if effect:
            # 如果猜對，先檢查是否有損傷；若無損傷則改為受到1點傷害。
            if target.damage > 0:
                target.heal(1)
            else:
                target.defence(1, ignore_defence=True)
        return ret, extra

class Nurturance(Card):
    def __init__(self):
        super().__init__()
        self.name = "Nurturance"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是中立。如果是的話回復1點傷害、
        # 如果你沒有受傷的話則改為受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp == "Civilian":
                effect = True
        if effect:
            # 如果猜對，先檢查是否有損傷；若無損傷則改為受到1點傷害。
            if target.damage > 0:
                target.heal(1)
            else:
                target.defence(1, ignore_defence=True)
        return ret, extra

class Prediction(Card):
    def __init__(self):
        super().__init__()
        self.name = "Prediction"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

        self.no_choice = True

    def action(self, user, target, rooms, force_effect=0):
        # 請將你的角色卡偷偷給你的上家查看。
        # 在目前架構中，我們暫時將角色揭示給所有人。
        ret = 3
        extra = []
        effect = True
        if effect:
            if rooms and hasattr(rooms, 'action_order') and hasattr(rooms, 'players'):
                my_trip = target.trip
                if my_trip in rooms.action_order:
                    my_index = rooms.action_order.index(my_trip)
                    # 從上家開始找活著的玩家
                    for i in range(1, len(rooms.action_order)):
                        prev_index = (my_index - i) % len(rooms.action_order)
                        prev_trip = rooms.action_order[prev_index]
                        prev_player = rooms.players.get(prev_trip)
                        if prev_player and prev_player.is_alive and prev_player != target:
                            extra = [prev_player]
                            break
        return ret, extra

class Slap(Card):
    def __init__(self):
        super().__init__()
        self.name = "Slap"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是獵人。如果是的話受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp == "Hunter":
                effect = True
        if effect:
            target.defence(1, ignore_defence=True)
            if target.check_death():
                ret = 1
                extra = [target]
        return ret, extra

class Spell(Card):
    def __init__(self):
        super().__init__()
        self.name = "Spell"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你是暗影。如果是的話受到1點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp == "Shadow":
                effect = True
        if effect:
            target.defence(1, ignore_defence=True)
            if target.check_death():
                ret = 1
                extra = [target]
        return ret, extra

class ToughLesson(Card):
    def __init__(self):
        super().__init__()
        self.name = "Tough Lesson"
        self.color = "Green"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []
        effect = False
        # 我猜你的最大血量在12以上。如果是的話受到2點傷害。
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.hp >= 12:
                effect = True
        if effect:
            target.defence(2, ignore_defence=True)
            if target.check_death():
                ret = 1
                extra = [target]
        return ret, extra

class Talisman(Card):
    def __init__(self):
        super().__init__()
        self.name = "Talisman"
        self.color = "White"
        self.type = "Equipment"
        self.target = "self"

class FortuneBrooch(Card):
    def __init__(self):
        super().__init__()
        self.name = "Fortune Brooch"
        self.color = "White"
        self.type = "Equipment"
        self.target = "self"

class MysticCompass(Card):
    def __init__(self):
        super().__init__()
        self.name = "Mystic Compass"
        self.color = "White"
        self.type = "Equipment"
        self.target = "self"

class HolyRobe(Card):
    def __init__(self):
        super().__init__()
        self.name = "Holy Robe"
        self.color = "White"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        target.eqp_df += 1
        target.eqp_atk -= 1

    def divest(self, target):
        target.eqp_df -= 1
        target.eqp_atk += 1

class SilverRosary(Card):
    def __init__(self):
        super().__init__()
        self.name = "Silver Rosary"
        self.color = "White"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        target.eqp_rob = True

    def divest(self, target):
        target.eqp_rob = False

class SpearOfLonginus(Card):
    def __init__(self):
        super().__init__()
        self.name = "Spear of Longinus"
        self.color = "White"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        if target.character.camp == "Hunter" and target.character_reveal:
            target.eqp_atk += 2

    def divest(self, target):
        if target.character.camp == "Hunter" and target.character_reveal:
            target.eqp_atk -= 2

class HolyWaterOfHealing(Card):
    def __init__(self):
        super().__init__()
        self.name = "Holy Water of Healing"
        self.color = "White"
        self.type = "Action"
        self.target = "self"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        target.heal(2)
        return ret, extra

class Advent(Card):
    def __init__(self):
        super().__init__()
        self.name = "Advent"
        self.color = "White"
        self.type = "Action"
        self.target = "self"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        if target.character.camp == "Hunter":
            target.character.reveal(target)
            target.heal(target.hp) # 回復所有血量
        return ret, extra

class Chocolate(Card):
    def __init__(self):
        super().__init__()
        self.name = "Chocolate"
        self.color = "White"
        self.type = "Action"
        self.target = "self"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        if target.character.capital in ["A", "E", "U"]:
            target.character.reveal(target)
            target.heal(target.hp) # 回復所有血量
        return ret, extra

class Blessing(Card):
    def __init__(self):
        super().__init__()
        self.name = "Blessing"
        self.color = "White"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        _, dice_result = rooms.board.roll_dice(2) # 擲一顆六面骰
        target.heal(dice_result)
        return ret, extra

class ConcealedKnowledge(Card):
    def __init__(self):
        super().__init__()
        self.name = "Concealed Knowledge"
        self.color = "White"
        self.type = "Action"
        self.target = "self"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        target.extra_turn += 1
        return ret, extra

class GuardianAngel(Card):
    def __init__(self):
        super().__init__()
        self.name = "Guardian Angel"
        self.color = "White"
        self.type = "Action"
        self.target = "self"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        target.eqp_immortal = True
        target.eqp_immortal_source = 'Guardian Angel'
        return ret, extra

class FlareOfJudgement(Card):
    def __init__(self):
        super().__init__()
        self.name = "Flare of Judgement"
        self.color = "White"
        self.type = "Action"
        self.target = "others"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        for player in rooms.players.values():
            if player != user and player.is_alive:
                player.defence(2, ignore_defence=True)
                if player.check_death():
                    ret = 1
                    extra.append(player)
        return ret, extra

class DisenchantMirror(Card):
    def __init__(self):
        super().__init__()
        self.name = "Disenchant Mirror"
        self.color = "White"
        self.type = "Action"
        self.target = "self"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        if target.character and getattr(target.character, 'can_be_revealed_by_disenchant_mirror', False):
            target.character.reveal(target)
        return ret, extra

class FirstAid(Card):
    def __init__(self):
        super().__init__()
        self.name = "First Aid"
        self.color = "White"
        self.type = "Action"
        self.target = "one"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        target.damage = 7
        return ret, extra

class Chainsaw(Card):
    def __init__(self):
        super().__init__()
        self.name = "Chainsaw"
        self.color = "Black"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        target.eqp_atk += 1

    def divest(self, target):
        target.eqp_atk -= 1

class ButcherKnife(Card):
    def __init__(self):
        super().__init__()
        self.name = "Butcher Knife"
        self.color = "Black"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        target.eqp_atk += 1

    def divest(self, target):
        target.eqp_atk -= 1

class RustedBroadAxe(Card):
    def __init__(self):
        super().__init__()
        self.name = "Rusted Broad Axe"
        self.color = "Black"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        target.eqp_atk += 1

    def divest(self, target):
        target.eqp_atk -= 1

class Masamune(Card):
    def __init__(self):
        super().__init__()
        self.name = "Masamune"
        self.color = "Black"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        target.eqp_force_atk = True
        target.eqp_atk_type = 2

    def divest(self, target):
        target.eqp_force_atk = False
        target.eqp_atk_type = 1

class MachineGun(Card):
    def __init__(self):
        super().__init__()
        self.name = "Machine Gun"
        self.color = "Black"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        target.eqp_aoe = True

    def divest(self, target):
        target.eqp_aoe = False

class Handgun(Card):
    def __init__(self):
        super().__init__()
        self.name = "Handgun"
        self.color = "Black"
        self.type = "Equipment"
        self.target = "self"

    def equip(self, target):
        target.eqp_range_atk = True

    def divest(self, target):
        target.eqp_range_atk = False

class VampireBat(Card):
    def __init__(self):
        super().__init__()
        self.name = "Vampire Bat"
        self.color = "Black"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        # 檢查目標是否裝備Talisman，如果有則免疫傷害
        has_talisman = any(type(card).__name__ == "Talisman" for card in target.equipment_list)
        if not has_talisman:
            target.defence(2, ignore_defence=True)
            if target.check_death():
                ret = 1
                extra = [target]
        # 回復使用卡片的玩家1點傷害
        user.heal(1)
        return ret, extra

class BloodthirstySpider(Card):
    def __init__(self):
        super().__init__()
        self.name = "Bloodthirsty Spider"
        self.color = "Black"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        # 檢查目標是否裝備Talisman，如果有則免疫傷害
        has_talisman = any(type(card).__name__ == "Talisman" for card in target.equipment_list)
        if not has_talisman:
            target.defence(2, ignore_defence=True)
            if target.check_death():
                ret = 1
                extra = [target]
            
            # 檢查自己是否裝備Talisman，如果有則免疫傷害
            has_talisman_self = any(type(card).__name__ == "Talisman" for card in user.equipment_list)
            if not has_talisman_self:
                user.defence(2, ignore_defence=True)
                if user.check_death():
                    ret = 1
                    extra.append(user)
        return ret, extra

class MoodyGoblin(Card):
    def __init__(self):
        super().__init__()
        self.name = "Moody Goblin"
        self.color = "Black"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        if target.equipment_list:
            if rooms and hasattr(rooms, 'current_player'):
                ret = 2
                extra = [target, user]
        return ret, extra

class SpiritualDoll(Card):
    def __init__(self):
        super().__init__()
        self.name = "Spiritual Doll"
        self.color = "Black"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        _, dice_result = rooms.board.roll_dice(2)
        if dice_result <= 4:
            target.defence(3, ignore_defence=True)
            if target.check_death():
                ret = 1
                extra = [target]
        else:
            # 對自己造成3點傷害
            if rooms and hasattr(rooms, 'current_player'):
                user.defence(3, ignore_defence=True)
                if user.check_death():
                    ret = 1
                    extra = [user]
        return ret, extra

class Dynamite(Card):
    def __init__(self):
        super().__init__()
        self.name = "Dynamite"
        self.color = "Black"
        self.type = "Action"
        self.target = "area"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        
        # 擲骰決定場地；骰出 7 代表啞彈，無任何效果
        dice4, dice6 = rooms.board.roll_dice(3)
        total = dice4 + dice6
        
        if total != 7:
            # 根據擲骰結果找到對應的 area
            affected_area = area_module.field_index[total]
    
            # 執行傷害邏輯
            # 利用rooms找到在affected_area的玩家，造成3點傷害 (包含自己)
            affected_players = [p for p in rooms.players.values() 
                            if p.area and p.area.name == affected_area.name and p.is_alive]
            for player in affected_players:
                # 檢查玩家是否裝備Talisman，如果有則免疫傷害
                has_talisman = any(type(card).__name__ == "Talisman" for card in player.equipment_list)
                if not has_talisman:
                    player.defence(3, ignore_defence=True)
                    if player.check_death():
                        ret = 1
                        extra.append(player)

        return ret, extra

class DiabolicRitual(Card):
    def __init__(self):
        super().__init__()
        self.name = "Diabolic Ritual"
        self.color = "Black"
        self.type = "Action"
        self.target = "self"

    def requires_choice(self, user, target, rooms):
        return bool(target and getattr(getattr(target, 'character', None), 'camp', '') == 'Shadow')

    def action(self, user, target, rooms, force_effect=0):
        ret = 0
        extra = []

        effect = False
        if force_effect == 1:
            effect = True
        elif force_effect == 2:
            effect = False
        else:
            if target.character.camp == "Shadow":
                effect = True

        if effect and target.character.camp == "Shadow":
            target.character.reveal(target)
            target.heal(target.hp)  # 回復所有血量
        return ret, extra

class BananaPeel(Card):
    def __init__(self):
        super().__init__()
        self.name = "Banana Peel"
        self.color = "Black"
        self.type = "Action"
        self.target = "other"

    def action(self, user, target, rooms):
        ret = 0
        extra = []
        if rooms and hasattr(rooms, 'current_player'):
            if user.equipment_list:
                # 交出裝備卡給其他玩家
                ret = 2
                extra = [user, target]
            else:
                user.defence(1, ignore_defence=True)
                if user.check_death():
                    ret = 1
                    extra = [user]
        return ret, extra


green_card = [
    Aid(),
    Anger(),
    Anger(),
    Blackmail(),
    Blackmail(),
    Bully(),
    Exorcism(),
    Greed(),
    Greed(),
    Huddle(),
    Nurturance(),
    Prediction(),
    Slap(),
    Slap(),
    Spell(),
    ToughLesson(),
]
white_card = [
    Talisman(),
    FortuneBrooch(),
    MysticCompass(),
    HolyRobe(),
    SilverRosary(),
    SpearOfLonginus(),
    HolyWaterOfHealing(),
    HolyWaterOfHealing(),
    Advent(),
    Chocolate(),
    Blessing(),
    ConcealedKnowledge(),
    GuardianAngel(),
    FlareOfJudgement(),
    DisenchantMirror(),
    FirstAid(),
]
black_card = [
    Chainsaw(),
    ButcherKnife(),
    RustedBroadAxe(),
    Masamune(),
    MachineGun(),
    Handgun(),
    VampireBat(),
    VampireBat(),
    VampireBat(),
    BloodthirstySpider(),
    MoodyGoblin(),
    MoodyGoblin(),
    SpiritualDoll(),
    Dynamite(),
    DiabolicRitual(),
    BananaPeel(),
]
