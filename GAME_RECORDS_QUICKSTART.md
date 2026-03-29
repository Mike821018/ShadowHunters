# 遊戲記錄系統｜快速啟動指南

## 📋 系統概況

已完成第 7 項待做事項「紀錄內存變數結構定義」。系統分為 3 個核心模組：

| 模組 | 檔案 | 說明 |
|------|-----|------|
| **Data Store** | `backend/records_system.py` | 記憶體儲存與統計計算 (530+ 行) |
| **API Layer** | `backend/game_records_api.py` | HTTP API 與遊戲整合 (350+ 行) |
| **實作指南** | `backend/IMPLEMENTATION_GUIDE.md` | 分階段整合方案 |

---

## 🚀 快速開始｜5 分鐘集成

### 步驟 1：在 `room_manager.py` 初始化系統

```python
# 在檔案頂部添加
from backend.records_system import GameRecordStore
from backend.game_records_api import GameRecordsAPI

# 在 RoomManager.__init__() 中添加
self.record_store = GameRecordStore()
self.records_api = GameRecordsAPI(self.record_store)
```

### 步驟 2：在遊戲開始時記錄

```python
# 在 room.py 中，遊戲開始時 (room_status = 2) 呼叫
if self.manager_ref and hasattr(self.manager_ref, 'records_api'):
    self.manager_ref.records_api.on_game_start(self)
```

### 步驟 3：在遊戲結束時記錄

```python
# 在 room.py 中，遊戲結束時 (room_status = 3) 呼叫
if self.manager_ref and hasattr(self.manager_ref, 'records_api'):
    record_id = self.manager_ref.records_api.on_game_end(self)
```

### 步驟 4：在 `http_server.py` 中添加 API 端點

```python
@app.route('/api/player_stats', methods=['GET'])
def api_player_stats():
    account = request.args.get('account', '')
    if room_manager and hasattr(room_manager, 'records_api'):
        return jsonify(room_manager.records_api.api_get_player_stats(account))
    return jsonify({'error': 'Not available'})

# 類似添加其他端點
# - /api/leaderboard
# - /api/game_record/<id>
# - /api/player_games
# - /api/summary_stats
```

---

## 📊 核心資料結構

### GameRecord (單場遊戲)
```python
{
    'record_id': 'UUID',
    'room_id': 房間 ID,
    'game_date': '2024-...',
    'game_duration_seconds': 900,
    'players': [PlayerRecord, ...],
    'winner_camp': 'Hunter|Shadow|Civilian',
    'winner_players': ['account1', 'account2']
}
```

### PlayerStats (玩家累積統計)
```python
{
    'account': 'player_id',
    'total_games': 50,
    'wins': 20,
    'losses': 30,
    'win_rate': 0.40,
    'skill_level': 'Intermediate',
    'character_stats': {
        '角色名': {
            'games_played': 15,
            'wins': 8,
            'win_rate': 0.533
        }
    }
}
```

---

## 🔌 API 端點一覽

| 端點 | 方法 | 用途 | 回傳範例 |
|-----|------|------|---------|
| `/api/player_stats?account=X` | GET | 取得玩家統計 | `{total_games: 50, win_rate: 0.40}` |
| `/api/leaderboard?scope=global` | GET | 取得全球排行榜 | `{entries: [{rank:1, player_id:X, value:0.65}]}` |
| `/api/game_record/<id>` | GET | 取得單場遊戲記錄 | `{record_id, players, winner_camp}` |
| `/api/player_games?account=X` | GET | 取得玩家最近遊戲 | `{games: [{record_id, game_date, is_winner}]}` |
| `/api/summary_stats` | GET | 系統全局統計 | `{total_games, total_players, total_rooms}` |

---

## 📁 檔案清單

已建立：
- ✅ `backend/records_system.py` (530+ 行) — 數據模型 + 儲存邏輯
- ✅ `backend/game_records_api.py` (350+ 行) — API 端點 + 遊戲鉤子
- ✅ `backend/IMPLEMENTATION_GUIDE.md` (300+ 行) — 詳細實作步驟
- ✅ `frontend/guide.html` (已完成於第 6 項)
- ✅ 多語言翻譯 (zh.js, en.js, jp.js)

待建立：
- ⏳ 前端統計頁面 (`stats.html`, `leaderboard.html`)
- ⏳ 資料庫持久化層 (`database/sqlite_records.py`)
- ⏳ 資料導出工具

---

## 🎯 實作分階段目標

### ✅ Phase 1：基礎整合 (目前進度)
- [x] 定義資料結構 (GameRecord, PlayerStats 等)
- [x] 實作記憶體儲存 (GameRecordStore 類別)
- [x] 建立 API 層 (GameRecordsAPI 類別)
- [x] 編寫整合指南 (IMPLEMENTATION_GUIDE.md)
- [ ] 修改 room_manager.py 初始化記錄系統
- [ ] 修改 room.py 呼叫生命週期鉤子
- [ ] 修改 http_server.py 添加 API 端點

### ⏳ Phase 2：前端統計頁面
- [ ] 建立 `stats.html` — 個人統計頁面
- [ ] 建立 `leaderboard.html` — 排行榜頁面
- [ ] 前端 API 客戶端 (`pages/stats.js`)
- [ ] 統計圖表與可視化

### ⏳ Phase 3：資料持久化
- [ ] SQLite 資料庫遷移
- [ ] CSV/JSON 導出功能
- [ ] 伺服器重啟保留資料

### ⏳ Phase 4：高級功能
- [ ] ELO 評分系統
- [ ] 遊戲重放功能 (GameEvent 日誌)
- [ ] 成就/徽章系統
- [ ] 智能配對系統

---

## ⚙️ 配置選項

### records_system.py 中的參數

```python
# 最小遊戲次數才能進入排行榜 (預設：5)
# 在 _update_global_leaderboard() 中修改
if stats.total_games >= 5:  # ← 修改此數值

# 技能等級劃分 (預設)
if win_rate >= 0.6:
    stats.skill_level = 'Expert'
elif win_rate >= 0.5:
    stats.skill_level = 'Advanced'
```

---

## 🧪 測試記錄清單

### 環境準備
- [ ] 確認 Python 3.7+ 環境
- [ ] 確認 `backend/` 路徑可訪問
- [ ] 確認 `room_manager.py` 可導入新模組

### 單元測試
```python
# backend/test_records.py (建議新增)
from records_system import GameRecordStore, GameRecord, PlayerRecord
from game_records_api import GameRecordsAPI

def test_basic_flow():
    store = GameRecordStore()
    api = GameRecordsAPI(store)
    # ... 測試邏輯
```

### 整合測試
- [ ] 遊戲開始時 `on_game_start()` 成功執行
- [ ] 遊戲結束時 `on_game_end()` 成功保存記錄
- [ ] `/api/player_stats` 回傳正確資料
- [ ] `/api/leaderboard` 正確排序
- [ ] PlayerStats 在多場遊戲後累積正確

---

## 📖 詳細文件

- **完整實作指南** → [`backend/IMPLEMENTATION_GUIDE.md`](./backend/IMPLEMENTATION_GUIDE.md)
- **資料結構設計** → [`backend/RECORDS_STRUCTURE.md`](./backend/RECORDS_STRUCTURE.md)
- **系統源碼** → [`backend/records_system.py`](./backend/records_system.py)
- **API 源碼** → [`backend/game_records_api.py`](./backend/game_records_api.py)

---

## ⚠️ 注意事項

| ⚠️ | 內容 |
|----|------|
| **記憶體限制** | 當前使用記憶體儲存。伺服器重啟後所有資料遺失。建議 Phase 3 實作持久化。 |
| **語言依賴** | 需要 Python 3.7+ (使用 dataclass 特性) |
| **非同步問題** | 多個房間同時結束遊戲時可能有競態條件。Phase 2 建議加入 Lock/Queue |
| **效能限制** | 記憶體儲存適合 ≤10,000 場遊戲。超過此規模應遷移至資料庫。 |

---

## 💡 常見問題

### Q: 如何測試記錄系統而不修改既有代碼？
A: 可先在 `http_server.py` 中添加測試端點：
```python
@app.route('/api/test/simulate_game', methods=['POST'])
def test_simulate_game():
    # 模擬遊戲流程測試紀錄系統
```

### Q: 遊戲記錄去哪裡查看？
A: 目前只有 API 端點。Phase 2 會建立 `stats.html` 和 `leaderboard.html` 前端頁面。

### Q: 如何導出已儲存的記錄？
A: 使用 GameRecordStore 的 export 方法：
```python
store.export_game_records_csv('output.csv')
store.export_player_stats_json('stats.json', account)
```

### Q: 如果需要重置所有記錄怎麼辦？
A: 呼叫 `record_store.clear_all_data()`（警告：無法復原）

---

## 🔗 相關連結

- [待完成功能列表](./TODO_list.md) — 第 6-7 項已完成 ✅
- [遊戲規則指南](./frontend/guide.html) — 新建的線上指南
- [房間管理器](./backend/room_manager.py) — 整合點位置
- [遊戲房間邏輯](./backend/game/room.py) — 鉤子呼叫位置

---

**系統狀態**：✅ 核心系統已建立，等待 Phase 1 整合實作

**最後更新**：遊戲記錄系統 v1.0 (Phase 1 準備就緒)
