from . import area_module
from . import card_module

import random
from copy import deepcopy

class board():
    def __init__(self, room):
        self.room = room
        self.field = [
            None, None, # zone1
            None, None, # zone2
            None, None, # zone3
        ]
        self.damage_board = [[] for i in range(15)]
        self.token_place = {}
        self.card_deck = {
            'Green':deepcopy(card_module.green_card),
            'Black':deepcopy(card_module.black_card),
            'White':deepcopy(card_module.white_card),
            'Green Discard':[],
            'Black Discard':[],
            'White Discard':[],
        }
        self.dice = {
            'D6':1,
            'D4':1
        }


    ####################
    #  game start
    ####################

    def game_set(self, players):
        for account, p in players.items():
            self.token_place[p.color] = 0
            self.damage_board[0].append(p.color)
        
        areas = deepcopy(area_module.field_list)
        random.shuffle(areas)
        self.field = [
            areas[0], areas[1], 
            areas[2], areas[3], 
            areas[4], areas[5],
        ]
        for idx, area in enumerate(self.field):
            area.zone = idx // 2 + 1

        random.shuffle(self.card_deck['Green'])
        random.shuffle(self.card_deck['Black'])
        random.shuffle(self.card_deck['White'])
        # update

    def get_area_by_roll_total(self, total):
        for area in self.field:
            if area and total in (getattr(area, 'number', []) or []):
                return area
        return None

    ####################
    #  in game
    ####################

    def draw(self, color):
        # 牌庫空時，先從對應棄牌堆洗回
        if not self.card_deck[color]:
            discard_key = color + ' Discard'
            if self.card_deck.get(discard_key):
                self.card_deck[color] = self.card_deck[discard_key]
                self.card_deck[discard_key] = []
                random.shuffle(self.card_deck[color])

        if not self.card_deck[color]:
            raise IndexError(f'No cards available in {color} deck and discard pile')

        card = self.card_deck[color].pop()
        # update
        return card

    def discard(self, card):
        discard_key = card.color + ' Discard'
        self.card_deck[discard_key].append(card)
        
        # 如果牌庫空了，從棄牌堆洗回牌庫
        if not self.card_deck[card.color]:
            self.card_deck[card.color] = self.card_deck[discard_key]
            self.card_deck[discard_key] = []
            random.shuffle(self.card_deck[card.color])
        # update

    def take_card_by_name(self, pile_key, card_name):
        """
        2026-10-22 新增：GM「給裝備」功能用，從指定牌堆（例如 'White' 牌庫本身，或
        'White Discard' 棄牌堆）依名稱精準抽出一張卡片，不像 draw() 只能拿最上面那張、
        也不會觸發 draw() 的「牌庫空了從棄牌堆洗回」邏輯（GM 指定抽取不需要這個）。
        找不到就回傳 None，呼叫端自行判斷要回什麼錯誤碼。
        """
        pile = self.card_deck.get(pile_key)
        if not pile:
            return None
        target_name = str(card_name or '')
        for idx, card in enumerate(pile):
            if str(getattr(card, 'name', '') or '') == target_name:
                return pile.pop(idx)
        return None
        # update

    def roll_dice(self, roll_type): # 1: 1D4(一顆四面骰), 2: 1D6(一顆六面骰), 3: 1D4+1D6(一顆四面骰+一顆六面骰)
        D4 = 0
        D6 = 0
        if roll_type in [1, 3]:
            D4 = random.randint(1, 4)
            self.dice['D4'] = D4
        if roll_type in [2, 3]:
            D6 = random.randint(1, 6)
            self.dice['D6'] = D6
        #update
        return D4, D6
