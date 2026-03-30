class area():
    def __init__(self):
        self.name = ""
        self.number = []
        self.zone = 0
        self.is_draw = False
        self.draw_type = '' # Green, White, Black, Any
        self.is_action = False
        self.target = '' # all, others, area, one, other, self
        self.additional_choose = False

    def action(self, user, target, action_type) -> tuple:
        ret = 0 # 0: no effect, 1: death, 2: steal
        extra = [] # for death: [death players], for steal: [from_player, to_player]
        return 0, []

class Cabin(area):
    def __init__(self):
        super().__init__()
        self.name = "Hermit's Cabin"
        self.number = [2, 3]
        self.is_draw = True
        self.draw_type = 'Green' # Green, White, Black, Any

class Church(area):
    def __init__(self):
        super().__init__()
        self.name = "Church"
        self.number = [6]
        self.is_draw = True
        self.draw_type = 'White' # Green, White, Black, Any

class Cemetery(area):
    def __init__(self):
        super().__init__()
        self.name = "Cemetery"
        self.number = [8]
        self.is_draw = True
        self.draw_type = 'Black' # Green, White, Black, Any

class Gate(area):
    def __init__(self):
        super().__init__()
        self.name = "Underworld Gate"
        self.number = [4, 5]
        self.is_draw = True
        self.draw_type = 'Any' # Green, White, Black, Any

class Woods(area):
    def __init__(self):
        super().__init__()
        self.name = "Weird Woods"
        self.number = [9]
        self.is_action = True
        self.target = 'one'
        self.additional_choose = True
        self.options = ['Heal', 'Hurt']
    
    def action(self, user, target, action_type):
        ret = 0
        extra = []
        if action_type == 'Heal':
            target.heal(1)
        if action_type == 'Hurt':
            # 檢查目標是否裝備Fortune Brooch，如果有則免疫傷害
            has_brooch = any(getattr(card, 'name', '') == "Fortune Brooch" for card in target.equipment_list)
            if not has_brooch or user == target:
                target.defence(2, ignore_defence=True)
                if target.check_death():
                    ret = 1
                    extra = [target]
        return ret, extra

class Altar(area):
    def __init__(self):
        super().__init__()
        self.name = "Erstwhile Altar"
        self.number = [10]
        self.is_action = True
        self.target = 'other'
    
    def action(self, user, target, action_type=''):
        return 2, [target, user]

field_index = [None, None, Cabin(), Cabin(), Gate(), Gate(), Church(), 'Any', Cemetery(), Woods(), Altar()]
field_list = [Cabin(), Gate(), Church(), Cemetery(), Woods(), Altar()]
