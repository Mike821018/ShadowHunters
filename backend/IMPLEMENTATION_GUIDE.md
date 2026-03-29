# 遊戲記錄系統實作指南

## 概述

本指南說明如何在現有的 ShadowHunters 遊戲系統中整合 **遊戲記錄系統 (Game Records System)** 。

### 檔案清單

- `backend/records_system.py` — 核心記錄儲存與統計系統（已建立 ✅）
- `backend/game_records_api.py` — API 層與遊戲整合點（已建立 ✅）
- `backend/http_server.py` — HTTP 伺服器（需修改以支援記錄 API）
- `backend/room_manager.py` — 房間管理器（需修改以初始化記錄系統）
- `backend/game/room.py` — 遊戲房間（需修改以記錄遊戲事件）

---

## Phase 1：基礎整合 (當前實作)

### 1.1 修改 `room_manager.py`

在 RoomManager 類別中添加記錄系統初始化：

```python
# 在 room_manager.py 頂部導入
from backend.records_system import GameRecordStore
from backend.game_records_api import GameRecordsAPI

class RoomManager:
    def __init__(self):
        # ... 既有程式碼 ...
        
        # 初始化記錄系統
        self.record_store = GameRecordStore()
        self.records_api = GameRecordsAPI(self.record_store)
    
    def finish_game(self, room_id: int) -> str:
        """
        在遊戲結束時呼叫此方法
        返回記錄 ID，如果失敗則返回 None
        """
        room = self.get_room(room_id)
        if not room:
            return None
        
        # 記錄遊戲結果
        record_id = self.records_api.on_game_end(room)
        return record_id
```

### 1.2 修改 `room.py` (遊戲房間)

在遊戲開始時記錄：

```python
# 在 room.py 中找到遊戲開始的位置 (room_status = 2)
# 添加以下呼叫：

def start_game(self):
    # ... 既有的遊戲開始邏輯 ...
    self.room_status = 2
    
    # 記錄遊戲開始時間
    if self.manager_ref and hasattr(self.manager_ref, 'records_api'):
        self.manager_ref.records_api.on_game_start(self)
```

在遊戲結束時記錄：

```python
# 在 room.py 中找到遊戲結束的位置 (room_status = 3)
# 添加以下呼叫：

def end_game(self):
    # ... 既有的遊戲結束邏輯，決定勝者 ...
    self.room_status = 3
    
    # 記錄遊戲結果
    if self.manager_ref and hasattr(self.manager_ref, 'records_api'):
        record_id = self.manager_ref.records_api.on_game_end(self)
        # 可選：將 record_id 發送給前端
```

### 1.3 修改 `http_server.py` (HTTP 伺服器)

添加 API 伺服器路由：

```python
# 在 http_server.py 中添加記錄 API 路由

@app.route('/api/player_stats', methods=['GET'])
def api_player_stats():
    account = request.args.get('account', '')
    if room_manager and hasattr(room_manager, 'records_api'):
        result = room_manager.records_api.api_get_player_stats(account)
        return jsonify(result)
    return jsonify({'error': 'Records API not available'})

@app.route('/api/leaderboard', methods=['GET'])
def api_leaderboard():
    scope = request.args.get('scope', 'global')
    room_id = request.args.get('room_id', type=int)
    if room_manager and hasattr(room_manager, 'records_api'):
        result = room_manager.records_api.api_get_leaderboard(scope, room_id)
        return jsonify(result)
    return jsonify({'error': 'Records API not available'})

@app.route('/api/game_record/<record_id>', methods=['GET'])
def api_game_record(record_id):
    if room_manager and hasattr(room_manager, 'records_api'):
        result = room_manager.records_api.api_get_game_record(record_id)
        return jsonify(result)
    return jsonify({'error': 'Records API not available'})

@app.route('/api/player_games', methods=['GET'])
def api_player_games():
    account = request.args.get('account', '')
    limit = request.args.get('limit', 20, type=int)
    if room_manager and hasattr(room_manager, 'records_api'):
        result = room_manager.records_api.api_get_player_games(account, limit)
        return jsonify(result)
    return jsonify({'error': 'Records API not available'})

@app.route('/api/summary_stats', methods=['GET'])
def api_summary_stats():
    if room_manager and hasattr(room_manager, 'records_api'):
        result = room_manager.records_api.api_get_summary_stats()
        return jsonify(result)
    return jsonify({'error': 'Records API not available'})
```

---

## Phase 2：前端統計頁面 (後續實作)

### 2.1 建立 `stats.html`

```html
<!DOCTYPE html>
<html>
<head>
    <title>遊戲統計</title>
    <link rel="stylesheet" href="src/theme.css">
</head>
<body>
    <h1>遊戲統計</h1>
    <div id="stats-container"></div>
    
    <script src="src/constants.js"></script>
    <script src="src/apiClient.ts"></script>
    <script src="src/pages/stats.js"></script>
</body>
</html>
```

### 2.2 建立 `leaderboard.html`

建立排行榜頁面展示全球與房間排名。

---

## Phase 3：資料持久化 (遠期目標)

### 3.1 SQLite 遷移

```python
# 建立 backend/database/sqlite_records.py
# 實作 GameRecordStore 的持久化版本
```

### 3.2 資料匯出

```python
# 使用 records_system.py 中的 export_* 方法
# 支援 CSV 與 JSON 格式
```

---

## 資料結構參考

### PlayerRecord (單場遊戲玩家記錄)

```python
{
    'player_id': '玩家帳號',
    'player_name': '顯示名稱',
    'character_name': '角色名稱',
    'character_camp': 'Hunter|Shadow|Civilian',
    'is_alive': True/False,
    'final_hp': 整數,
    'damage_taken': 整數,
    'cards_played': 整數,
    'cards_equipped': ['卡牌名稱']
}
```

### GameRecord (單場遊戲記錄)

```python
{
    'record_id': 'UUID',
    'room_id': 整數,
    'game_date': 'ISO 8601 時間戳',
    'game_duration_seconds': 整數,
    'game_settings': {
        'enable_initial_green_card': True/False,
        'expansion_mode': 'all|no_extend',
        'max_players': 整數,
        'require_trip': True/False
    },
    'players': [PlayerRecord, ...],
    'winner_camp': '陣營名',
    'winner_players': ['帳號1', '帳號2'],
    'end_reason': '遊戲結束原因描述',
    'total_actions': 整數,
    'total_damage_dealt': 整數,
    'kills_count': {'帳號': 整數}
}
```

### PlayerStats (玩家累積統計)

```python
{
    'account': '玩家帳號',
    'total_games': 整數,
    'wins': 整數,
    'losses': 整數,
    'draws': 整數,
    'win_rate': 浮點數 (0-1),
    'character_stats': {
        '角色名': {
            'games_played': 整數,
            'wins': 整數,
            'win_rate': 浮點數
        }
    },
    'camp_stats': {
        '陣營名': {
            'games_played': 整數,
            'wins': 整數,
            'win_rate': 浮點數
        }
    },
    'skill_level': 'Beginner|Intermediate|Advanced|Expert'
}
```

---

## API 端點參考

### GET `/api/player_stats?account=玩家帳號`

取得玩家統計資訊

**回應範例：**
```json
{
    "account": "player1",
    "total_games": 50,
    "wins": 20,
    "win_rate": "40.00%",
    "skill_level": "Intermediate",
    "character_stats": {
        "Hunter A": {
            "games_played": 15,
            "wins": 8,
            "win_rate": "53.33%"
        }
    }
}
```

### GET `/api/leaderboard?scope=global&limit=50`

取得排行榜

| 參數 | 說明 |
|-----|------|
| `scope` | `global` 或 `room` |
| `room_id` | 當 scope=room 時必填 |
| `limit` | 回傳筆數上限，預設 50 |

### GET `/api/game_record/<record_id>`

取得單場遊戲詳細記錄

### GET `/api/player_games?account=玩家帳號&limit=20`

取得玩家最近的遊戲記錄

### GET `/api/summary_stats`

取得全局統計摘要

---

## 測試檢查清單

- [ ] 遊戲開始時成功呼叫 `on_game_start()`
- [ ] 遊戲結束時成功呼叫 `on_game_end()`
- [ ] GameRecord 成功儲存至 `record_store`
- [ ] PlayerStats 成功計算與更新
- [ ] Leaderboard 成功生成
- [ ] `/api/player_stats` 回傳正確資料
- [ ] `/api/leaderboard` 回傳正確排名
- [ ] 多個房間的記錄保持隔離
- [ ] 與現有遊戲邏輯無衝突

---

## 故障排除

### 問題：遊戲記錄未保存

1. 檢查 `manager_ref` 是否正確設置
2. 檢查 `records_api` 是否已初始化
3. 檢查遊戲結束時是否正確觸發 API

### 問題：玩家統計不更新

1. 檢查 winner_accounts 是否正確設置
2. 檢查玩家物件的 character 屬性是否存在
3. 檢查遊戲時間戳是否正確

### 問題：Leaderboard 排名不正確

1. 檢查遊戲記錄中的 winner_players 是否準確
2. 檢查 `update_leaderboards()` 是否在遊戲結束後呼叫
3. 檢查最小遊戲次數要求（預設 5）

---

## 未來擴展規畫

1. **遊戲重放系統** — 使用 GameEvent 記錄每一個動作，支援重放
2. **ELO 評分系統** — 根據對手實力調整玩家評分
3. **成就系統** — 追蹤特定成就與徽章
4. **匹配系統** — 根據玩家統計資料進行智能配對
5. **資料視覺化** — 圖表展示勝率、角色偏好等

---

## 注意事項

⚠️ **重要**：當前系統使用**記憶體儲存**。遊戲伺服器重啟後所有資料將遺失。
   - 建議在 Phase 3 實作持久化層（SQLite/PostgreSQL）
   - 或在伺服器關閉前導出資料為 CSV/JSON

✅ **備份建議**：定期導出玩家統計
```python
# 在 room_manager 中添加定期備份任務
record_store.export_player_stats_json('player_account.json', account)
```

---

## 相關文件

- [RECORDS_STRUCTURE.md](./RECORDS_STRUCTURE.md) — 完整資料結構設計
- [backend/records_system.py](./records_system.py) — 核心系統實作
- [backend/game_records_api.py](./game_records_api.py) — API 整合層
