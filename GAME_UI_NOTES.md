# Shadow Hunters Game UI 調整筆記 (2026-03-25)

## 玩家卡片 (Player Card) 架構

### 目前佈局（自上而下）
1. **頭部** (Header)：頭像、HP 顯示、顏色選擇器
2. **狀態行** (Meta Row)：目標狀態 + 所在區域
3. **暱稱列** (Nickname Row)：◆ + 玩家暱稱（flex 可伸縮）
4. **Trip 列** (Trip Row)：◆ + Trip（隱藏時不顯示）
5. **裝備列** (Equipment Row)：佔用剩餘垂直空間

### 關鍵樣式配置 (frontend/src/theme.css)
- `.player-card`：`display: grid; grid-template-rows: auto auto auto auto 1fr;`
  - 前 4 列固定高度，最後 `1fr` 給裝備列
- `.player-card-hp`：`display: flex; min-width: 0;` 確保 flex 內容正常收縮
- `.player-card-nickname`：`display: block; flex: 1 1 auto; min-width: 0;` 支持寬度適應和 ellipsis
- `.player-card-role`：`margin-top: 4px; gap: 6px;` 控制上下間距

### 玩家卡樣式特色
- 暱稱與 Trip 帶鑽石符號：`◆`
- 暱稱符號顏色隨頭像色彩變動
- Trip 符號為固定色（higu 風格）
- 都支援文字省略號 (ellipsis)

## 中央骰子 (Center Dice)

### 視覺佈置 (theme.css `.stage-center-badges`)
- 位置：`left: 33%; top: 54%;` 相對遊戲桌絕對定位
- 兩顆骰子：6 面骰（正方）、4 面骰（三角）
- 互動樣式：cursor pointer、focus-visible outline

### 骰子動畫邏輯 (frontend/src/pages/room.js)
- **點擊條件檢查**：
  - 遊戲進行中（status=2）
  - 輪到自己
  - 在移動擲骰階段（player.status=2）
- **動畫流程**：
  1. 發送 `next_step` 至伺服器
  2. 收到結果後立即播放亂數動畫（900ms）
  3. D6 在 1～6、D4 在 1～4 隨機跳動
  4. 動畫結束顯示最終結果
  5. 動畫期間骰子加亮（`scale(1.06)`、`brightness(1.08)`）

### 相關函數
- `playDiceAnimation(finalD6, finalD4)`：主動畫控制
- `normalizeDiceValue(value, sides)`：值驗證與限制
- `renderTableDice(data)`：狀態同步時渲染

## 場地卡 (Field Cards)

### 6 張場地卡分佈
- 卡片位置用 CSS class `.stage-card-1` ~ `.stage-card-6` 標識
- 每卡包含：區域名稱、編號列表（支援多號）、佔據玩家顏色塊
- 點擊編號會彈出浮動詳情面板

### 浮動詳情面板
- 顯示：區域名稱、所有編號、詳細說明
- 位置：靠近點擊的編號按鈕
- 關閉：點擊外部、Escape、或關閉按鈕

## 後端資料流

### 骰子初始化 (backend/game/board.py)
```python
self.dice = {
    'D6': 1,
    'D4': 1
}
```

### 擲骰方法
```python
def roll_dice(self, roll_type):
    # roll_type: 1=D4, 2=D6, 3=D4+D6
    if roll_type in [1, 3]:
        D4 = random.randint(1, 4)
        self.dice['D4'] = D4
    if roll_type in [2, 3]:
        D6 = random.randint(1, 6)
        self.dice['D6'] = D6
    return D4, D6
```

### 狀態序列化 (backend/room_manager.py)
- `_serialize_room_state()` 包含：
  - `card_piles`：{Green, Black, White} + {Discard} 計數
  - `fields`：6 張場地的 name/display_name/description/numbers
  - `dice`：{D6, D4} 最新值

### 新增 API

#### reveal_character
```python
def api_reveal_character(self, payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    玩家自主揭露角色。
    
    Payload:
    - room_id: int
    - account: str
    
    檢查條件：
    - 遊戲進行中 (status=2)
    - 玩家存在
    - 尚未揭露 (character_reveal=False)
    - 已分配角色 (character is not None)
    """
```

## 前端 API 客戶端

### 新方法 (frontend/src/apiClient.ts)
```typescript
revealCharacter(room_id: number, account: string) {
  return transport({ action: 'reveal_character', payload: { room_id, account } });
}
```

## 玩家自動揭露角色機制

### 觸發條件
- 遊戲進行中（room_status=2）
- 玩家點擊自己的卡片
- 角色未揭露（character_reveal=false）
- 已分配角色（character !== null）

### 實作位置
- **前端**：`frontend/src/pages/room.js` - `playerCardClickHandler()`
- **後端**：`backend/room_manager.py` - `api_reveal_character()`

### 玩家卡點擊處理流程
1. 檢查是否為自己的卡片
2. 檢查是否在遊戲進行中
3. 檢查是否未揭露角色
4. 滿足條件則呼叫 `reveal_character` API
5. 成功後更新遊戲狀態、重新渲染、顯示提示

## 待辦/未來考慮

### 已實裝
- [x] 骰子動畫系統（900ms 亂數+最終結果）
- [x] 場地卡互動與詳情面板
- [x] 玩家卡片排版（暱稱+Trip+裝備）
- [x] 中央骰子點擊觸發流程
- [x] 玩家自動揭露角色

### 未來可能優化
- 骰子動畫音效？
- 角色揭露動畫？
- 場地卡佔據情況的視覺回饋
- 更多鍵盤快捷鍵支持

## 關鍵檔案清單

### 前端
- `frontend/src/pages/room.js`：房間頁面邏輯、骰子/卡片互動
- `frontend/src/ui.js`：玩家卡片 HTML 模板
- `frontend/src/theme.css`：所有卡片/骰子/面板樣式
- `frontend/src/apiClient.ts`：API 客戶端
- `frontend/src/types.ts`：TypeScript 型別定義
- `frontend/room.html`：卡片容器標記

### 後端
- `backend/room_manager.py`：API 分派與實作
- `backend/game/room.py`：遊戲邏輯（next_step）
- `backend/game/board.py`：棋盤狀態（骰子、牌庫、場地）
- `backend/game/player.py`：玩家物件

## 訊息/提示詞彙

### 新增翻譯鍵
- `toast.character_revealed`：角色已揭露

## 版本資訊
- 建檔日期：2026-03-25
- 涵蓋功能至：玩家自動揭露角色 + 骰子動畫系統
