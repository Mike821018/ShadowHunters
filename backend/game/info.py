info_ch = {
    ## area
    "Hermit's Cabin":{
        'name':"隱士小屋",
        'info':"你可以抽取一張隱士卡牌",
    },
    "Church":{
        'name':"教堂",
        'info':"你可以抽取一張白色卡牌",
    },
    "Cemetery":{
        'name':"墓園",
        'info':"你可以抽取一張黑色卡牌",
    },
    "Underworld Gate":{
        'name':"時空之門",
        'info':"你可以抽取任意一張卡牌(黑色卡片、白色卡片、隱士卡片)",
    },
    "Weird Woods":{
        'name':"希望與絕望的森林",
        'info':"你可以對一位玩家造成2點傷害，或是治癒玩家1點血量",
    },
    "Erstwhile Altar":{
        'name':"古代祭壇",
        'info':"你可以拿取任何一位玩家的一張裝備",
    },

    ## character
    # Shadow
    "Wight":{
        'name':"屍妖",
        'info':\
        """
        HP14*
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(增值)
            在你的回合結束時，額外進行等同於死亡角色數量的回合。
            (每場遊戲限用一次)
        """,
    },
    "Vampire":{
        'name':"吸血鬼",
        'info':\
        """
        HP13
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(吸血)
            當你攻擊一位角色並造成傷害時，治癒你受到的2點傷害。
        """,
    },
    "Werewolf":{
        'name':"狼男",
        'info':\
        """
        HP14
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(反擊)
            當你遭受攻擊之後，你可以馬上攻擊那位攻擊你的角色。
        """,
    },
    "Ultra Soul":{
        'name':"究極靈魂",
        'info':\
        """
        HP11*
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(殺人光線)
            在你的回合一開始，選擇一位身處於「時空之門」的玩家，對他造成3點傷害。
        """,
    },
    "Unknown":{
        'name':"謎",
        'info':\
        """
        HP11
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(詐欺)
            當你收到隱士卡時，你可以選擇說謊。
            (使用此項能力不需要展示身分)
        """,
    },
    "Valkyrie":{
        'name':"女武神",
        'info':\
        """
        HP11
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(開戰的號角)
            當你攻擊的時後，只擲四面骰，直接造成骰面的傷害。
        """,
    },
    # Hunter
    "Gregor":{
        'name':"葛雷格",
        'info':\
        """
        HP14*
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(幽靈護盾)
            在你的回還結束時使用，直到你的下一個回合開始，你不會受到任何傷害。
            (每場遊戲限用一次)
        """,
    },
    "Emi":{
        'name':"映魅",
        'info':\
        """
        HP10
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(瞬間移動)
            當你移動時，你可以擲骰進行一般的移動，或是直接移動至接臨的地區。
        """,
    },
    "George":{
        'name':"喬治",
        'info':\
        """
        HP14
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(破碎)
            在你的回合一開始，你可以選擇一位角色，擲一枚四面骰，並對他造成骰面上的傷害。
            (每場遊戲限用一次)
        """,
    },
    "Franklin":{
        'name':"法蘭克林",
        'info':\
        """
        HP12
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(雷擊)
            在你的回合一開始，你可以選擇一位角色，擲一枚六面骰，並對他造成骰面上的傷害。
            (每場遊戲限用一次)
        """,
    },
    "Ellen":{
        'name':"艾蓮",
        'info':\
        """
        HP10*
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(禁咒枷鎖)
            在你的回合一開始，選擇一位角色，該角色不能使用特殊能力直到遊戲結束。
            (每場遊戲限用一次)
        """,
    },
    "Fu-ka":{
        'name':"楓花",
        'info':\
        """
        HP10*
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(爆彈護士)
            在你的回合一開始，選擇一位玩家，將該玩家的HP值調整為7。
            (每場遊戲限用一次)
        """,
    },
    # Civilian
    "Agnes":{
        'name':"艾妮絲",
        'info':\
        """
        HP8*
        勝利條件:
            當你的上一位的玩家獲得勝利。
        特殊能力：(善變)
            在你的回合開始，你可以將勝利條件變更為「當你的下一位的玩家獲得勝利」。
        """,
    },
    "Allie":{
        'name':"艾莉",
        'info':\
        """
        HP8
        勝利條件:
            當遊戲結束時，你仍然存活。
        特殊能力：(母愛)
            治癒你受到的所有傷害。
            (每場遊戲限用一次)
        """,
    },
    "Charles":{
        'name':"查爾斯",
        'info':\
        """
        HP11
        勝利條件:
            當你殺死其他角色時，而且死亡角色總數為3或以上。
        特殊能力：(血腥盛宴)
            在你攻擊之後，你可以對你自己造成2點傷害，並對同一位角色再進行一次攻擊。
        """,
    },
    "Bryan":{
        'name':"布萊恩",
        'info':\
        """
        HP10*
        勝利條件:
            當你的攻擊造成HP大於13的角色死亡時，
            或者是遊戲結束時，你身處於「古代祭壇」。
        特殊能力：(My God!)
            當你的攻擊造成HP小於12的角色死亡時，你必須要展示你的身分。
        """,
    },
    "Bob":{
        'name':"巴布",
        'info':\
        """
        HP10
        勝利條件:
            你擁有超過4張裝備時。
            如果你有使用過特殊能力改為5張裝備。
        特殊能力：(掠奪)
            當你的攻擊造成一位角色死亡時，你獲得該角色擁有的所有裝備。
        """,
    },
    "Catherine":{
        'name':"凱薩琳",
        'info':\
        """
        HP11*
        勝利條件:
            你是第一位死亡的角色，
            或是最後只剩下你以及另外一位角色存活。
        特殊能力：(聖痕)
            在你的回合一開始，治癒1點你受到的傷害。
        """,
    },
    "Daniel":{
        'name':"丹尼爾",
        'info':\
        """
        HP13
        勝利條件:
            你是第一位死亡的角色
            或是所有暗影角色死亡而你仍存活。
        特殊能力：(尖嘯)
            當有其他角色死亡時，你必須要展示你的身分。
        """,
    },
    "David":{
        'name':"大衛",
        'info':\
        """
        HP13*
        勝利條件:
            當你持有「神聖法袍」、「秘銀念珠」、「辟邪護符」、「隆基努司之槍」4種裝備中的任意3種以上時。
        特殊能力：(掘墓者)
            你獲得棄牌堆中一張你所選的裝備。
            (每場遊戲限用一次)
        """,
    },

    ## card
    # green
    "Aid":{
        'name':"援助",
        'info':\
        """
        我猜你是獵人。
        如果是的話回復1點傷害、
        如果你沒有受傷的話則改為受到1點傷害。
        """,
    },
    "Anger":{
        'name':"憤怒",
        'info':\
        """
        我猜你是獵人或暗影。
        如果是的話請給你的上家一張裝備卡、
        如果你沒有裝備卡的話則受到1點傷害。
        """,
    },
    "Blackmail":{
        'name':"勒索",
        'info':\
        """
        我猜你是中立或獵人。
        如果是的話請給你的上家一張裝備卡、
        如果你沒有裝備卡的話則受到1點傷害。
        """,
    },
    "Bully":{
        'name':"霸凌",
        'info':\
        """
        我猜你的最大血量在11以下。
        如果是的話受到1點傷害。
        """,
    },
    "Exorcism":{
        'name':"驅魔",
        'info':\
        """
        我猜你是暗影。
        如果是的話受到2點傷害。
        """,
    },
    "Greed":{
        'name':"貪婪",
        'info':\
        """
        我猜你是中立或暗影。
        如果是的話請給你的上家一張裝備卡、
        如果你沒有裝備卡的話則受到1點傷害。
        """,
    },
    "Huddle":{
        'name':"縮成一團",
        'info':\
        """
        我猜你是暗影。
        如果是的話回復1點傷害、
        如果你沒有受傷的話則改為受到1點傷害。
        """,
    },
    "Nurturance":{
        'name':"養育",
        'info':\
        """
        我猜你是中立。
        如果是的話回復1點傷害、
        如果你沒有受傷的話則改為受到1點傷害。
        """,
    },
    "Prediction":{
        'name':"預言",
        'info':\
        """
        請將你的角色卡偷偷給你的上家查看。
        """,
    },
    "Slap":{
        'name':"巴掌",
        'info':\
        """
        我猜你是獵人。
        如果是的話受到1點傷害。
        """,
    },
    "Spell":{
        'name':"咒語",
        'info':\
        """
        我猜你是暗影。
        如果是的話受到1點傷害。
        """,
    },
    "Tough Lesson":{
        'name':"嚴厲教訓",
        'info':\
        """
        我猜你的最大血量在12以上。
        如果是的話受到2點傷害。
        """,
    },

    # white
    "Talisman":{
        'name':"辟邪護符",
        'info':\
        """
        免疫「血腥蜘蛛」、「吸血蝙蝠」、「炸藥」的效果。
        """,
    },
    "Fortune Brooch":{
        'name':"財富胸針",
        'info':\
        """
        免疫「希望與絕望的森林」效果。(但可以對自己使用)
        """,
    },
    "Mystic Compass":{
        'name':"神秘羅盤",
        'info':\
        """
        移動階段，可以擲兩次骰子，選擇自己想要的結果移動。
        """,
    },
    "Holy Robe":{
        'name':"神聖法袍",
        'info':\
        """
        受到的傷害減1，輸出的傷害也減1。
        """,
    },
    "Silver Rosary":{
        'name':"秘銀念珠",
        'info':\
        """
        殺死一名玩家，可以獲得該玩家所有的裝備卡。
        """,
    },
    "Spear of Longinus":{
        'name':"隆基努司之槍",
        'info':\
        """
        獵人裝備時，攻擊成功可以增加2點傷害，你必須先揭露身分才能使用。
        """,
    },
    "Holy Water of Healing":{
        'name':"治癒聖水",
        'info':\
        """
        回復2點傷害。
        """,
    },
    "Advent":{
        'name':"降臨",
        'info':\
        """
        如果你是獵人，揭露身分並回復所有血量。
        """,
    },
    "Chocolate":{
        'name':"巧克力",
        'info':\
        """
        如果你是「A」、「E」、「U」開頭的角色，揭露你的身分並回復所有傷害。
        """,
    },
    "Blessing":{
        'name':"祝福",
        'info':\
        """
        選擇你以外的玩家，擲一顆六面骰，回復所骰點數的傷害。
        """,
    },
    "Concealed Knowledge":{
        'name':"隱藏的智慧",
        'info':\
        """
        你結束這回合時，可以再繼續一次回合。
        """,
    },
    "Guardian Angel":{
        'name':"守護天使",
        'info':\
        """
        到下一個回合開始前，你不會受到其他玩家的攻擊傷害。
        """,
    },
    "Flare of Judgement":{
        'name':"閃電裁判",
        'info':\
        """
        除了使用者外，其餘玩家受到2點傷害。
        """,
    },
    "Disenchant Mirror":{
        'name':"照妖鏡",
        'info':\
        """
        如果你是「吸血鬼」或「人狼」，揭露你的身分。
        """,
    },
    "First Aid":{
        'name':"急救箱",
        'info':\
        """
        選擇任意一位玩家，將該玩家的HP值調整為7。
        """,
    },

    # black
    "Chainsaw":{
        'name':"電鋸",
        'info':\
        """
        攻擊成功時可以增加1點傷害。
        """,
    },
    "Butcher Knife":{
        'name':"菜刀",
        'info':\
        """
        攻擊成功時可以增加1點傷害。
        """,
    },
    "Rusted Broad Axe":{
        'name':"斧頭",
        'info':\
        """
        攻擊成功時可以增加1點傷害。
        """,
    },
    "Masamune":{
        'name':"被詛咒的妖刀",
        'info':\
        """
        攻擊改為擲1顆四面骰並造成骰面的傷害，你必須攻擊。
        """,
    },
    "Machine Gun":{
        'name':"機槍",
        'info':\
        """
        攻擊時，同區域內的所有玩家都會受到傷害。
        """,
    },
    "Handgun":{
        'name':"手槍",
        'info':\
        """
        只能攻擊不同區域的玩家。
        """,
    },
    "Vampire Bat":{
        'name':"吸血蝙蝠",
        'info':\
        """
        選擇一名玩家造成2點傷害，並回復自己1點傷害。
        """,
    },
    "Bloodthirsty Spider":{
        'name':"血腥蜘蛛",
        'info':\
        """
        選擇一名玩家造成2點傷害，並對自己造成2點傷害。
        """,
    },
    "Moody Goblin":{
        'name':"穆迪精靈",
        'info':\
        """
        選擇一名玩家，奪走他的1張裝備卡。
        """,
    },
    "Spiritual Doll":{
        'name':"詛咒娃娃",
        'info':\
        """
        選擇一名玩家，擲出1顆六面骰。若結果為1-4，對該玩家造成3點傷害；若結果為5-6，對自己造成3點傷害。
        """,
    },
    "Dynamite":{
        'name':"炸藥",
        'info':\
        """
        同時擲一顆四面骰與六面骰，擲出總和對應的場地內玩家受到3點傷害。
        (包含自己。擲出7則無事發生。)
        """,
    },
    "Diabolic Ritual":{
        'name':"魔鬼儀式",
        'info':\
        """
        如果你是暗影，可以揭露身分，並回復所有傷害。
        """,
    },
    "Banana Peel":{
        'name':"香蕉皮",
        'info':\
        """
        你必須將1張裝備卡交給其他玩家。
        如果你沒有裝備卡，則受到1點傷害。
        """,
    }
}

info_en = {
    ## area
    "Hermit's Cabin":{
        'name':"Hermit's Cabin",
        'info':"你可以抽取一張隱士卡牌",
    },
    "Church":{
        'name':"Church",
        'info':"你可以抽取一張白色卡牌",
    },
    "Cemetery":{
        'name':"Cemetery",
        'info':"你可以抽取一張黑色卡牌",
    },
    "Underworld Gate":{
        'name':"Underworld Gate",
        'info':"你可以抽取任意一張卡牌(黑色卡片、白色卡片、隱士卡片)",
    },
    "Weird Woods":{
        'name':"Weird Woods",
        'info':"你可以對一位玩家造成2點傷害，或是治癒玩家1點血量",
    },
    "Erstwhile Altar":{
        'name':"Erstwhile Altar",
        'info':"你可以拿取任何一位玩家的一張裝備",
    },

    ## character
    # Shadow
    "Wight":{
        'name':"Wight",
        'info':\
        """
        HP14*
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(增值)
            在你的回合結束時，額外進行等同於死亡角色數量的回合。
            (每場遊戲限用一次)
        """,
    },
    "Vampire":{
        'name':"Vampire",
        'info':\
        """
        HP13
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(吸血)
            當你攻擊一位角色並造成傷害時，治癒你受到的2點傷害。
        """,
    },
    "Werewolf":{
        'name':"Werewolf",
        'info':\
        """
        HP14
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(反擊)
            當你遭受攻擊之後，你可以馬上攻擊那位攻擊你的角色。
        """,
    },
    "Ultra Soul":{
        'name':"Ultra Soul",
        'info':\
        """
        HP11*
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(殺人光線)
            在你的回合一開始，選擇一位身處於「時空之門」的玩家，對他造成3點傷害。
        """,
    },
    "Unknown":{
        'name':"Unknown",
        'info':\
        """
        HP11
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(詐欺)
            當你收到隱士卡時，你可以選擇說謊。
            (使用此項能力不需要展示身分)
        """,
    },
    "Valkyrie":{
        'name':"Valkyrie",
        'info':\
        """
        HP11
        勝利條件:
            所有獵人角色死亡，
            或3位中立角色死亡。
        特殊能力：(開戰的號角)
            當你攻擊的時後，只擲四面骰，直接造成骰面的傷害。
        """,
    },
    # Hunter
    "Gregor":{
        'name':"Gregor",
        'info':\
        """
        HP14*
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(幽靈護盾)
            在你的回還結束時使用，直到你的下一個回合開始，你不會受到任何傷害。
            (每場遊戲限用一次)
        """,
    },
    "Emi":{
        'name':"Emi",
        'info':\
        """
        HP10
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(瞬間移動)
            當你移動時，你可以擲骰進行一般的移動，或是直接移動至接臨的地區。
        """,
    },
    "George":{
        'name':"George",
        'info':\
        """
        HP14
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(破碎)
            在你的回合一開始，你可以選擇一位角色，擲一枚四面骰，並對他造成骰面上的傷害。
            (每場遊戲限用一次)
        """,
    },
    "Franklin":{
        'name':"Franklin",
        'info':\
        """
        HP12
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(雷擊)
            在你的回合一開始，你可以選擇一位角色，擲一枚六面骰，並對他造成骰面上的傷害。
            (每場遊戲限用一次)
        """,
    },
    "Ellen":{
        'name':"Ellen",
        'info':\
        """
        HP10*
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(禁咒枷鎖)
            在你的回合一開始，選擇一位角色，該角色不能使用特殊能力直到遊戲結束。
            (每場遊戲限用一次)
        """,
    },
    "Fu-ka":{
        'name':"Fu-ka",
        'info':\
        """
        HP10*
        勝利條件:
            所有暗影角色死亡。
        特殊能力：(爆彈護士)
            在你的回合一開始，選擇一位玩家，將該玩家的HP值調整為7。
            (每場遊戲限用一次)
        """,
    },
    # Civilian
    "Agnes":{
        'name':"Agnes",
        'info':\
        """
        HP8*
        勝利條件:
            當你的上一位的玩家獲得勝利。
        特殊能力：(善變)
            在你的回合開始，你可以將勝利條件變更為「當你的下一位的玩家獲得勝利」。
        """,
    },
    "Allie":{
        'name':"Allie",
        'info':\
        """
        HP8
        勝利條件:
            當遊戲結束時，你仍然存活。
        特殊能力：(母愛)
            治癒你受到的所有傷害。
            (每場遊戲限用一次)
        """,
    },
    "Charles":{
        'name':"Charles",
        'info':\
        """
        HP11
        勝利條件:
            當你殺死其他角色時，而且死亡角色總數為3或以上。
        特殊能力：(血腥盛宴)
            在你攻擊之後，你可以對你自己造成2點傷害，並對同一位角色再進行一次攻擊。
        """,
    },
    "Bryan":{
        'name':"Bryan",
        'info':\
        """
        HP10*
        勝利條件:
            當你的攻擊造成HP大於13的角色死亡時，
            或者是遊戲結束時，你身處於「古代祭壇」。
        特殊能力：(My God!)
            當你的攻擊造成HP小於12的角色死亡時，你必須要展示你的身分。
        """,
    },
    "Bob":{
        'name':"Bob",
        'info':\
        """
        HP10
        勝利條件:
            你擁有超過4張裝備時。
            如果你有使用過特殊能力改為5張裝備。
        特殊能力：(掠奪)
            當你的攻擊造成一位角色死亡時，你獲得該角色擁有的所有裝備。
        """,
    },
    "Catherine":{
        'name':"Catherine",
        'info':\
        """
        HP11*
        勝利條件:
            你是第一位死亡的角色，
            或是最後只剩下你以及另外一位角色存活。
        特殊能力：(聖痕)
            在你的回合一開始，治癒1點你受到的傷害。
        """,
    },
    "Daniel":{
        'name':"Daniel",
        'info':\
        """
        HP13
        勝利條件:
            你是第一位死亡的角色
            或是所有暗影角色死亡而你仍存活。
        特殊能力：(尖嘯)
            當有其他角色死亡時，你必須要展示你的身分。
        """,
    },
    "David":{
        'name':"David",
        'info':\
        """
        HP13*
        勝利條件:
            當你持有「神聖法袍」、「秘銀念珠」、「辟邪護符」、「隆基努司之槍」4種裝備中的任意3種以上時。
        特殊能力：(掘墓者)
            你獲得棄牌堆中一張你所選的裝備。
            (每場遊戲限用一次)
        """,
    },

    ## card
    # green
    "Aid":{
        'name':"Aid",
        'info':\
        """
        Hunter heal 1 damage.(if you have none take 1 damage)
        """,
    },
    "Anger":{
        'name':"Anger",
        'info':\
        """
        Hunter or Shadow - give 1 equipment to current player or take 1 damage.
        """,
    },
    "Blackmail":{
        'name':"Blackmail",
        'info':\
        """
        Hunter or Neutral - give 1 equipment to current player or take 1 damage.
        """,
    },
    "Bully":{
        'name':"Bully",
        'info':\
        """
        HP less or equal 11 (A,B,C,E,U) take 1 damage.
        """,
    },
    "Exorcism":{
        'name':"Exorcism",
        'info':\
        """
        Shadow - take 2 damage.
        """,
    },
    "Greed":{
        'name':"Greed",
        'info':\
        """
        Neutral or Shadow - give 1 equipment to current player or take 1 damage.
        """,
    },
    "Huddle":{
        'name':"Huddle",
        'info':\
        """
        Shadow heal 1 damage (if you have none take 1 damage).
        """,
    },
    "Nurturance":{
        'name':"Nurturance",
        'info':\
        """
        Neutral heal 1 damage (if you have none take 1 damage).
        """,
    },
    "Prediction":{
        'name':"Prediction",
        'info':\
        """
        Show your character card to current player.
        """,
    },
    "Slap":{
        'name':"Slap",
        'info':\
        """
        Hunter - take 1 damage.
        """,
    },
    "Spell":{
        'name':"Spell",
        'info':\
        """
        Shadow - take 1 damage.
        """,
    },
    "Tough Lesson":{
        'name':"Tough Lesson",
        'info':\
        """
        HP greater or equal 12 (D,F,G,V,W) take 2 damage.
        """,
    },

    # white
    "Talisman":{
        'name':"Talisman",
        'info':\
        """
        免疫「血腥蜘蛛」、「吸血蝙蝠」、「炸藥」的效果。
        """,
    },
    "Fortune Brooch":{
        'name':"Fortune Brooch",
        'info':\
        """
        免疫「希望與絕望的森林」效果。(但可以對自己使用)
        """,
    },
    "Mystic Compass":{
        'name':"Mystic Compass",
        'info':\
        """
        移動階段，可以擲兩次骰子，選擇自己想要的結果移動。
        """,
    },
    "Holy Robe":{
        'name':"Holy Robe",
        'info':\
        """
        受到的傷害減1，輸出的傷害也減1。
        """,
    },
    "Silver Rosary":{
        'name':"Silver Rosary",
        'info':\
        """
        殺死一名玩家，可以獲得該玩家所有的裝備卡。
        """,
    },
    "Spear of Longinus":{
        'name':"Spear of Longinus",
        'info':\
        """
        獵人裝備時，攻擊成功可以增加2點傷害，你必須先揭露身分才能使用。
        """,
    },
    "Holy Water of Healing":{
        'name':"Holy Water of Healing",
        'info':\
        """
        回復2點傷害。
        """,
    },
    "Advent":{
        'name':"Advent",
        'info':\
        """
        如果你是獵人，揭露身分並回復所有血量。
        """,
    },
    "Chocolate":{
        'name':"Chocolate",
        'info':\
        """
        如果你是「A」、「E」、「U」開頭的角色，揭露你的身分並回復所有傷害。
        """,
    },
    "Blessing":{
        'name':"Blessing",
        'info':\
        """
        選擇你以外的玩家，擲一顆六面骰，回復所骰點數的傷害。
        """,
    },
    "Concealed Knowledge":{
        'name':"Concealed Knowledge",
        'info':\
        """
        你結束這回合時，可以再繼續一次回合。
        """,
    },
    "Guardian Angel":{
        'name':"Guardian Angel",
        'info':\
        """
        到下一個回合開始前，你不會受到其他玩家的攻擊傷害。
        """,
    },
    "Flare of Judgement":{
        'name':"Flare of Judgement",
        'info':\
        """
        除了使用者外，其餘玩家受到2點傷害。
        """,
    },
    "Disenchant Mirror":{
        'name':"Disenchant Mirror",
        'info':\
        """
        如果你是「吸血鬼」或「人狼」，揭露你的身分。
        """,
    },
    "First Aid":{
        'name':"First Aid",
        'info':\
        """
        選擇任意一位玩家，將該玩家的HP值調整為7。
        """,
    },

    # black
    "Chainsaw":{
        'name':"Chainsaw",
        'info':\
        """
        If your attack is successful, you give 1 extra point of damage.
        """,
    },
    "Butcher Knife":{
        'name':"Butcher Knife",
        'info':\
        """
        If your attack is successful, you give 1 extra point of damage.
        """,
    },
    "Rusted Broad Axe":{
        'name':"Rusted Broad Axe",
        'info':\
        """
        If your attack is successful, you give 1 extra point of damage.
        """,
    },
    "Masamune":{
        'name':"Masamune",
        'info':\
        """
        攻擊改為擲1顆四面骰並造成骰面的傷害，你必須攻擊。
        """,
    },
    "Machine Gun":{
        'name':"Machine Gun",
        'info':\
        """
        攻擊時，同區域內的所有玩家都會受到傷害。
        """,
    },
    "Handgun":{
        'name':"Handgun",
        'info':\
        """
        只能攻擊不同區域的玩家。
        """,
    },
    "Vampire Bat":{
        'name':"Vampire Bat",
        'info':\
        """
        選擇一名玩家造成2點傷害，並回復自己1點傷害。
        """,
    },
    "Bloodthirsty Spider":{
        'name':"Bloodthirsty Spider",
        'info':\
        """
        Give 2 points of damage to any player's character and take 2 points of damage yourself.
        """,
    },
    "Moody Goblin":{
        'name':"Moody Goblin",
        'info':\
        """
        選擇一名玩家，奪走他的1張裝備卡。
        """,
    },
    "Spiritual Doll":{
        'name':"Spiritual Doll",
        'info':\
        """
        選擇一名玩家，擲出1顆六面骰。若結果為1-4，對該玩家造成3點傷害；若結果為5-6，對自己造成3點傷害。
        """,
    },
    "Dynamite":{
        'name':"Dynamite",
        'info':\
        """
        Roll both dice and give 3 points of damage to all characters in that area. On a 7 nothing happens.
        """,
    },
    "Diabolic Ritual":{
        'name':"Diabolic Ritual",
        'info':\
        """
        If you are a Shadow you may reveal your identity and fully heal your damage.
        """,
    },
    "Banana Peel":{
        'name':"Banana Peel",
        'info':\
        """
        Give one of your equipment cards to another player.
        If you have none take 1 point of damage.
        """,
    }
}