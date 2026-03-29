# Git 提交指南 - v0.1.0-test (2026-03-29)

## 說明
本指南用於將 ShadowHunters v0.1.0-test 版本提交到 git 並建立標籤。

## 準備工作
確保已安裝 Git，如未安裝請從 https://git-scm.com 下載安裝。

## 操作步驟

### 1. 打開 Git Bash 或命令提示字元
```bash
cd d:\Game\ShadowHunters
```

### 2. 查看當前狀態
```bash
git status
```

### 3. 暫存所有變更
```bash
git add .
```
或只暫存特定檔案：
```bash
git add VERSION.md
git add issue_list/issue_list_29_final.md
```

### 4. 提交變更
```bash
git commit -m "Release v0.1.0-test

已完成工作：
- Issue 27：回放路由修正
- Issue 28：聊天 UI 改進與驗證
- Issue 29：13 項遊戲流程與 UI 修正

驗證結果：
- 40 局遊戲（20 隨機 + 20 八玩家）
- 0 暴斃事件
- 180 評價提交成功

技術棧：Python 3.9 + Flask + Vanilla JS
版本狀態：測試階段（未推至生產）"
```

### 5. 建立版本標籤
```bash
git tag -a v0.1.0-test -m "v0.1.0-test: Initial test release with issue 27-29 fixes

Completed:
- Issue 27: Replay route validation
- Issue 28: Chat UI improvements with 20+20 validation
- Issue 29: 13 game flow and UI fixes

Test Results:
- 40 games completed (20 random + 20 eight-player)
- 0 boomed events
- 180 ratings submitted
- avg_steps: 277.2 (random) / 398.85 (eight-player)

Status: Testing phase, not production ready"
```

### 6. 查看提交日誌
```bash
git log --oneline -5
git tag -l
```

### 7.（可選）推送到遠端倉庫
```bash
git push origin main
git push origin v0.1.0-test
```

## 提交内容説明

### 新增檔案
- `VERSION.md`：版本紀錄與變更日誌
- `issue_list/issue_list_29_final.md`：Issue 29 最終驗證報告

### 修改檔案（issue 27-29 過程中已提交）
- `backend/game/room.py`：遊戲流程修正
- `backend/room_manager.py`：序列化與 API 改進
- `backend/game/player.py`：角色狀態管理
- `frontend/src/pages/room.js`：UI 邏輯修正
- `frontend/src/ui.js`：能力狀態公開顯示
- `frontend/src/locales/zh.js`：文字修正（狼男）
- `frontend/src/theme.css`：聊天區域佈局
- `frontend/replay_room.html`：回放頁面改進
- `scripts/http_random_game_validator.py`：頭像驗證更新

## 版本標籤説明

`v0.1.0-test` 方案：
- `v` - 版本前綴
- `0.1.0` - 語義版本 (Major.Minor.Patch)
- `-test` - 預發佈標籤，表示測試階段

## 提交後驗證

確認提交成功：
```bash
git log --oneline -1
git show v0.1.0-test
```

## 注意事項

- 本版本標記為測試階段 (`-test`)，未推至生產環境
- 建議在上傳前本地驗證所有測試通過
- 如需修改提交訊息，使用 `git commit --amend`
- 標籤推送需要明確的 `git push origin <tag-name>` 指令

---

完成以上步驟後，本版本即可正式納入版本控制歷史。
