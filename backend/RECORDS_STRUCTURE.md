# 遊戲紀錄系統（Records System）- 內存變數結構定義

## 概述

此文檔定義了 ShadowHunters 遊戲紀錄系統未來的資料結構。目前使用內存變數儲存，未來可擴展至資料庫。

---

## 1. 遊戲紀錄 (GameRecord)

單局遊戲結束後保存的紀錄。

```python
class GameRecord:
    """單局遊戲紀錄"""
    
    # 基本資訊
    record_id: str                    # 紀錄唯一識別碼 (UUID)
    room_id: int                      # 房間 ID
    game_date: str                    # 遊戲日期 (ISO 8601 format)
    game_duration_seconds: int        # 遊戲耗時（秒）
    
    # 遊戲設置
    game_settings: Dict[str, Any]     # 遊戲選項配置
      - enable_initial_green_card: bool
      - expansion_mode: str           # 'all' / 'no_extend'
      - require_trip: bool
      - hide_trip: bool
      - max_players: int
    
    # 玩家資訊
    players: List[PlayerRecord]       # 遊戲玩家列表
      - player_id: str                # 玩家帳號
      - player_name: str              # 玩家暱稱
      - character_name: str           # 扮演角色名稱
      - character_camp: str           # 陣營 ('Hunter' / 'Shadow' / 'Civilian')
      - is_alive: bool                # 遊戲結束時是否生存
      - final_hp: int                 # 最終 HP
      - damage_taken: int             # 總傷害
      - cards_played: int             # 使用卡牌數
      - cards_equipped: List[str]    # 最後持有的裝備清單
    
    # 遊戲結果
    winner_camp: str                  # 勝利陣營 ('Hunter' / 'Shadow' / 'Civilian' / 'Draw')
    winner_players: List[str]         # 勝利玩家帳號清單
    end_reason: str                   # 遊戲結束原因
      - 'hunter_victory'              # 獵人消滅所有影子
      - 'shadow_victory'              # 影子數量 >= 獵人數量
      - 'civilian_survival'           # 平民存活到遊戲結束
      - 'room_disbanded'              # 房間廢置
      - 'player_timeout'              # 玩家超時
    
    # 統計數據
    total_actions: int                # 總行動數（移動 + 攻擊 + 卡牌）
    total_damage_dealt: int           # 總造成傷害
    total_healing: int                # 總治療量
    kills_count: Dict[str, int]       # 殺敗計數 {玩家帳號 -> 數量}
    
    # 事件日誌
    game_log: List[GameEvent]         # 所有遊戲事件日誌（選擇性保存）
```

---

## 2. 玩家遊戲統計 (PlayerStats)

單個玩家的累計遊戲統計。

```python
class PlayerStats:
    """玩家統計資訊"""
    
    # 基本資訊
    account: str                      # 玩家帳號 (Primary Key)
    trip_display: str                 # 顯示用 TRIP
    total_games: int                  # 總遊戲場數
    
    # 勝負統計
    wins: int                         # 勝利場數
    losses: int                       # 失敗場數
    draws: int                        # 平手場數
    win_rate: float                   # 勝率 (wins / total_games)
    
    # 角色統計
    character_stats: Dict[str, CharacterStats]  # 各角色統計
      - character_name: str
        - games_played: int
        - wins: int
        - losses: int
        - win_rate: float
        - total_damage_dealt: int
        - average_damage_per_game: float
        - kills: int
    
    # 陣營統計
    camp_stats: Dict[str, CampStats]  # 各陣營統計
      - 'Hunter':
        - games_played: int
        - wins: int
        - win_rate: float
      - 'Shadow':
        - games_played: int
        - wins: int
        - win_rate: float
      - 'Civilian':
        - games_played: int
        - wins: int
        - win_rate: float
    
    # 卡牌統計
    cards_used: Dict[str, int]        # 卡牌使用頻率 {卡牌名稱 -> 使用次數}
    cards_equipped: Dict[str, int]    # 裝備使用頻率 {裝備名稱 -> 裝備次數}
    
    # 其他統計
    average_duration_per_game: float  # 平均遊戲時長（秒）
    last_played: str                  # 最後遊戲時間 (ISO 8601)
    created_date: str                 # 帳號創建日期
    
    # 評分系統（未來擴展）
    elo_rating: float                 # ELO 評分（可選）
    skill_level: str                  # 技能等級 ('Beginner' / 'Intermediate' / 'Advanced' / 'Expert')
```

---

## 3. 房間遊戲紀錄 (RoomGameHistory)

房間內所有遊戲的歷史紀錄。

```python
class RoomGameHistory:
    """房間遊戲歷史"""
    
    room_id: int                      # 房間 ID (Primary Key)
    room_name: str                    # 房間名稱
    room_created_date: str            # 房間創建日期
    
    # 遊戲列表
    games: List[GameRecord]           # 房間內進行的所有遊戲紀錄
    total_games: int                  # 房間內總遊戲場數
    
    # 房間統計
    room_stats: Dict[str, Any]
      - most_active_players: List[str]  # 最常在此房間遊戲的玩家
      - average_win_rate: float         # 房間內平均勝率
      - popular_characters: List[str]   # 最常選擇的角色
      - popular_game_settings: Dict     # 最常使用的遊戲設置
    
    # 排行榜（針對此房間）
    leaderboard: List[LeaderboardEntry]
      - rank: int
      - player_id: str
      - games_played: int
      - wins: int
      - win_rate: float
```

---

## 4. 遊戲事件 (GameEvent)

遊戲中發生的單個事件（用於詳細日誌）。

```python
class GameEvent:
    """遊戲事件日誌"""
    
    event_id: int                     # 事件序號（在遊戲內遞增）
    timestamp: str                    # 事件發生時間戳 (ISO 8601)
    event_type: str                   # 事件類型
      - 'game_start'                  # 遊戲開始
      - 'game_end'                    # 遊戲結束
      - 'player_move'                 # 玩家移動
      - 'player_attack'               # 玩家攻擊
      - 'card_played'                 # 卡牌使用
      - 'card_equipped'               # 裝備動作
      - 'player_damage'               # 玩家受傷
      - 'player_heal'                 # 玩家治療
      - 'player_died'                 # 玩家死亡
      - 'character_revealed'          # 角色揭露
      - 'role_ability_used'           # 角色能力使用
      - 'player_kicked'               # 玩家被踢出
      - 'turn_changed'                # 回合切換
    
    player_id: str                    # 事件主角（誰執行了此事件）
    target_players: List[str]         # 受影響的玩家列表（可選）
    
    # 事件詳細內容
    event_details: Dict[str, Any]     # 事件特定的細節
      - card_name: str                # 使用的卡牌名稱（card_played）
      - target: str                   # 卡牌目標（card_played）
      - area: str                     # 移動到的地點（player_move）
      - damage_amount: int            # 傷害數值（player_damage）
      - equipment_name: str           # 裝備名稱（card_equipped）
    
    game_state_snapshot: Dict[str, Any]  # 事件後遊戲狀態快照（可選，用於回放）
```

---

## 5. 排行榜 (Leaderboard)

全局或按房間的玩家排名。

```python
class LeaderboardEntry:
    """排行榜項目"""
    
    rank: int                         # 排名（1 為第一名）
    player_id: str                    # 玩家帳號
    player_name: str                  # 玩家暱稱
    
    # 排名依據
    sorting_key: str                  # 排序方式
      - 'win_rate'                    # 勝率（需最少 N 場遊戲）
      - 'total_wins'                  # 總勝場數
      - 'games_played'                # 遊戲場數
      - 'elo_rating'                  # ELO 評分（如果啟用）
    
    value: float                      # 該排序方式的數值
    trend: str                        # 排名變化趨勢
      - 'up'                          # 上升
      - 'down'                        # 下降
      - 'stable'                      # 穩定
    
    last_update: str                  # 最後更新時間 (ISO 8601)
```

---

## 6. 內存存儲實現 (In-Memory Store)

Python 實現的內存存儲結構。

```python
class GameRecordStore:
    """遊戲紀錄內存存儲"""
    
    def __init__(self):
        # 主要存儲
        self.game_records: Dict[str, GameRecord] = {}        # {record_id -> GameRecord}
        self.player_stats: Dict[str, PlayerStats] = {}       # {account -> PlayerStats}
        self.room_histories: Dict[int, RoomGameHistory] = {} # {room_id -> RoomGameHistory}
        self.leaderboards: Dict[str, List[LeaderboardEntry]] = {
            'global': [],
            'by_room': {},  # {room_id -> List[LeaderboardEntry]}
        }
    
    # 遊戲紀錄方法
    def save_game_record(self, record: GameRecord) -> str:
        """保存單局遊戲紀錄"""
        self.game_records[record.record_id] = record
        return record.record_id
    
    def get_game_record(self, record_id: str) -> Optional[GameRecord]:
        """取得單局遊戲紀錄"""
        return self.game_records.get(record_id)
    
    def get_player_games(self, account: str) -> List[GameRecord]:
        """取得玩家所有遊戲紀錄"""
        return [r for r in self.game_records.values() 
                if account in [p.player_id for p in r.players]]
    
    # 玩家統計方法
    def update_player_stats(self, account: str, game_record: GameRecord):
        """根據遊戲紀錄更新玩家統計"""
        stats = self.player_stats.get(account) or PlayerStats(account=account)
        # ... 更新邏輯 ...
        self.player_stats[account] = stats
    
    def get_player_stats(self, account: str) -> Optional[PlayerStats]:
        """取得玩家統計"""
        return self.player_stats.get(account)
    
    # 房間歷史方法
    def add_game_to_room_history(self, room_id: int, game_record: GameRecord):
        """將遊戲紀錄新增至房間歷史"""
        history = self.room_histories.get(room_id) or RoomGameHistory(room_id=room_id)
        history.games.append(game_record)
        history.total_games += 1
        self.room_histories[room_id] = history
    
    # 排行榜方法
    def update_leaderboards(self):
        """更新全局和房間排行榜"""
        # ... 計算並更新排行榜 ...
        pass
    
    def get_leaderboard(self, scope: str = 'global', room_id: Optional[int] = None) -> List[LeaderboardEntry]:
        """取得排行榜"""
        if scope == 'global':
            return self.leaderboards['global']
        elif scope == 'room':
            return self.leaderboards['by_room'].get(room_id, [])
    
    # 數據匯出方法
    def export_game_records_csv(self, output_path: str, account: Optional[str] = None):
        """匯出遊戲紀錄為 CSV"""
        # ... CSV 匯出邏輯 ...
        pass
    
    def export_player_stats_json(self, output_path: str, account: str):
        """匯出玩家統計為 JSON"""
        # ... JSON 匯出邏輯 ...
        pass
```

---

## 7. 後端集成點

### 在 Room 類中添加：

```python
class Room:
    # ... 現有程式碼 ...
    
    def __init__(self, ...):
        # ... 現有初始化 ...
        self.game_events: List[GameEvent] = []  # 遊戲事件記錄
        self._record_start_time = None          # 遊戲開始時間
    
    def record_event(self, event_type: str, player_id: str, details: Dict[str, Any]):
        """記錄遊戲事件"""
        event = GameEvent(
            event_id=len(self.game_events),
            timestamp=datetime.now().isoformat(),
            event_type=event_type,
            player_id=player_id,
            event_details=details
        )
        self.game_events.append(event)
    
    def on_game_end(self) -> GameRecord:
        """遊戲結束時生成紀錄"""
        record = GameRecord(
            record_id=str(uuid.uuid4()),
            room_id=self.room_id,
            game_date=self._record_start_time.isoformat(),
            game_duration_seconds=(datetime.now() - self._record_start_time).total_seconds(),
            # ... 其他欄位 ...
            game_log=self.game_events
        )
        return record
```

### 在 RoomManager 中添加：

```python
class RoomManager:
    def __init__(self):
        # ... 現有程式碼 ...
        self.record_store = GameRecordStore()
    
    def finalize_game(self, room_id: int) -> str:
        """遊戲結束時調用，保存紀錄並更新統計"""
        room = self.rooms[room_id]
        game_record = room.on_game_end()
        
        # 保存紀錄
        record_id = self.record_store.save_game_record(game_record)
        
        # 更新玩家統計
        for player in room.players.values():
            self.record_store.update_player_stats(player.account, game_record)
        
        # 更新房間歷史
        self.record_store.add_game_to_room_history(room_id, game_record)
        
        # 更新排行榜
        self.record_store.update_leaderboards()
        
        return record_id
    
    def api_get_player_stats(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """API：取得玩家統計"""
        account = payload.get('account')
        stats = self.record_store.get_player_stats(account)
        return self._success('get_player_stats', stats.__dict__ if stats else None)
    
    def api_get_leaderboard(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """API：取得排行榜"""
        scope = payload.get('scope', 'global')
        room_id = payload.get('room_id')
        leaderboard = self.record_store.get_leaderboard(scope, room_id)
        return self._success('get_leaderboard', [e.__dict__ for e in leaderboard])
```

---

## 8. 未來擴展建議

### 資料庫遷移
當需要持久化時，可使用以下選項：
- **SQLite** - 輕量級，適合小規模部署
- **PostgreSQL** - 功能完整，適合中等規模
- **MongoDB** - 靈活的文檔存儲

### 高級功能
1. **ELO 評分系統** - 基於遊戲結果計算玩家技能評分
2. **重放系統** - 使用 GameEvent 日誌重現遊戲過程
3. **匹配系統** - 根據統計匹配相近水平的玩家
4. **成就系統** - 解鎖特殊成就和徽章
5. **API 分析** - 遊戲統計數據 API

---

## 9. CSV 匯出格式

### game_records.csv
```
record_id,room_id,game_date,duration_seconds,players,winner_camp,end_reason
abc123,1,2026-03-27T12:00:00,1800,player1|player2|player3|player4,Hunter,hunter_victory
```

### player_stats.csv
```
account,total_games,wins,losses,win_rate,average_duration,last_played
player1,50,30,20,0.60,1800,2026-03-27T12:00:00
```

### leaderboard.csv
```
rank,player_id,games_played,wins,win_rate,sorting_key
1,player1,50,30,0.60,win_rate
2,player2,45,25,0.556,win_rate
```

---

## 10. 實裝優先順序

1. **第一階段** - 基礎紀錄保存
   - [ ] GameRecord 結構和保存邏輯
   - [ ] 遊戲結束時生成紀錄
   - [ ] 簡單的 API 查詢

2. **第二階段** - 玩家統計
   - [ ] PlayerStats 計算邏輯
   - [ ] 排行榜生成
   - [ ] 玩家統計 API

3. **第三階段** - 資料匯出
   - [ ] CSV 匯出功能
   - [ ] JSON 匯出功能
   - [ ] 前端下載界面

4. **第四階段** - 進階功能
   - [ ] 遊戲重放系統
   - [ ] ELO 評分
   - [ ] 成就系統

---

**最後更新時間:** 2026-03-27  
**狀態:** 待實裝（已完成結構定義）
