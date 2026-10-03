# 交接文件：手機版響應式調整

**對應 TODO 第 1 項**：規劃手機版顯示方式  
**目標寬度**：360px–430px，核心流程：大廳 → 房間 → 回放 → 紀錄  
**桌面版影響**：無（所有修改均在 480px 以下斷點內，或為非破壞性補充）

---

## Session 開始前請先做

1. 讀 `VERSION.md` 確認目前版本號
2. 執行以下兩項確認（Grep）：
   - 搜尋 `.room-layout-stage-row` 是否在 theme.css 任何地方設有 `display: grid`
   - 搜尋 `lobby.html` 與 `records.html` 是否含有 `<table` 元素
3. 在 DevTools 手機模擬器（375px）依序截圖各頁，作為 before 對照

---

## 唯一需修改的檔案

`frontend/src/theme.css`（除非 lobby / records 有 table 需加 wrapper，則另改對應 HTML）

---

## 調整項目（依建議執行順序）

---

### 1. 修正聊天室高度優先度 Bug（重要）

**問題**：[theme.css:4083](frontend/src/theme.css#L4083) 的 `.room-layout-info-chat-row .room-chat-surface` 選擇器優先度高於 640px 斷點內的一般規則，導致房間頁在手機上聊天室高度還是 420px。

**修改位置**：找到 `@media (max-width: 640px)` 區塊（約 line 3494），在內部補入：

```css
.room-layout-info-chat-row .room-chat-surface {
  height: 320px;
  min-height: 320px;
  max-height: 320px;
}
```

同時在 `@media (max-width: 480px)` 區塊（約 line 4005）補入：

```css
.room-layout-info-chat-row .room-chat-surface {
  height: 240px;
  min-height: 240px;
  max-height: 240px;
}
```

---

### 2. 確認並補齊 `.room-layout-stage-row` 的 `display: grid`

**確認方式**：Grep `.room-layout-stage-row` 確認是否已有 `display: grid`。

- 若**有**：跳過，不需改動
- 若**沒有**：在 [theme.css:4108](frontend/src/theme.css#L4108) 補上：

```css
.room-layout-stage-row {
  display: grid;  /* 補上這行 */
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
}
```

---

### 3. 修正 `.wrap` 在 480px 以下留白過窄

**修改位置**：在 `@media (max-width: 480px)` 區塊加入：

```css
.wrap {
  width: calc(100% - 16px);
}
```

（從原本 24px 改為 16px，讓 360px 螢幕多出 8px 可用空間）

---

### 4. 新增 `@media (max-width: 430px)` 斷點

**修改位置**：放在 theme.css 現有 480px 規則之後（接近檔案底部）。

```css
@media (max-width: 430px) {
  /* 大廳：狀態欄 2 欄改 1 欄 */
  .status-grid {
    grid-template-columns: 1fr;
  }

  /* Header 字號與上下 padding 縮小 */
  #header h2 {
    font-size: 18px;
  }

  #header .wrap {
    padding: 12px 0 10px;
  }

  /* 房間：場地卡在極小螢幕縮小 */
  [data-page="room"] .stage-card-field,
  .room-page .stage-card-field {
    width: clamp(60px, 15vw, 80px);
    height: clamp(44px, 11vw, 60px);
    padding: 4px 3px 3px;
  }

  /* 房間：玩家卡 avatar 縮小 */
  .player-card-head {
    grid-template-columns: 40px 1fr auto;
  }

  .avatar-badge {
    width: 40px;
    height: 40px;
  }
}
```

---

### 5. 按鈕觸控尺寸補強

**修改位置**：在 `@media (max-width: 480px)` 區塊加入：

```css
button,
.btn,
[role="button"] {
  min-height: 44px;
}
```

> 注意：icon-only 的小按鈕（如色盤色塊）不在此 class 內，不受影響。

---

### 6. 大廳 / 紀錄頁 table 橫向溢出（視確認結果決定）

**先用 Grep 確認** `lobby.html` 與 `records.html` 是否有 `<table` 元素。

- **若沒有**：跳過
- **若有**：在對應 HTML 的 table 外包一層 wrapper，**不改 table 結構本身**（以免影響桌面版）：

```html
<div style="overflow-x: auto;">
  <table ...>...</table>
</div>
```

或在 CSS 中對該 table 的父容器加：

```css
.lobby-room-list,   /* 對應 class 名稱以實際 HTML 為準 */
.records-list {
  overflow-x: auto;
}
```

---

## 不需在此次做的事

- 將 table 改為 card 佈局（會影響桌面版，屬於較大重構）
- 新增 landscape 橫屏規則（驗證後視情況補，不在此次範圍）
- 調整 replay_room、guide、operation 等次要頁面

---

## 完成後請更新

1. `VERSION.md`：以使用者語言描述「手機版核心頁面（大廳、房間、回放、紀錄）在 360–430px 寬度下可正常顯示與操作」
2. `issue_list/`：若有對應 issue 編號請一併更新狀態

---

## 驗證清單

完成修改後，在 DevTools 375px 模擬器逐一確認：

- [ ] 大廳頁：房間列表不橫向溢出、按鈕可點
- [ ] 房間頁：聊天室高度正常（不超過畫面 1/3）、玩家卡單欄、場地卡可見
- [ ] 回放頁：版面不破版
- [ ] 紀錄頁：列表不橫向溢出

並確認桌面版（1280px）上述頁面外觀未改變。
