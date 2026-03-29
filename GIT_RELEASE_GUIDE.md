# Git 提交與發版指南（含版號管控）

## 說明
本指南用於將 ShadowHunters 版本提交到 git，並確保每次推送都完成：
- 版號更新（SemVer）
- 版本紀錄（VERSION.md）
- Git Tag

> 規範：凡是功能修正、行為變更、驗證結果更新，都必須更新版號與版本紀錄後再 push。

## 準備工作
確保已安裝 Git，如未安裝請從 https://git-scm.com 下載安裝。

## 🚨 提交鐵則

> **每次 commit 前，必須先更新 `VERSION.md`，寫入本次變更的版本號與修正內容，再執行 `git add / commit`。**
> 未更新 VERSION.md 的提交視為不完整版本，禁止推送到 master。

## 操作步驟

### 1. 打開 Git Bash 或命令提示字元
```bash
cd d:\Game\ShadowHunters
```

### 2. 查看當前狀態
```bash
git status
```

### 3. 版號管控（必做）
先決定本次版本號（建議遵守 SemVer）：
- Patch（`x.y.Z`）：錯誤修復、相容性修正
- Minor（`x.Y.z`）：新增功能且向下相容
- Major（`X.y.z`）：破壞性變更

同步更新：
- `VERSION.md`：新增一節新版本（日期、修正項目、驗證結果）
- 若有額外發版說明檔，也一併更新

### 4. 暫存所有變更
```bash
git add .
```
或只暫存特定檔案：
```bash
git add VERSION.md
git add issue_list/issue_list_29_final.md
```

### 5. 提交變更
```bash
git commit -m "Release vX.Y.Z

已完成工作：
- <重點修正 1>
- <重點修正 2>

驗證結果：
- <測試摘要>

版本狀態：<test/stable>"
```

### 6. 建立版本標籤（必做）
```bash
git tag -a vX.Y.Z[-suffix] -m "vX.Y.Z[-suffix]: release note summary

Completed:
- <key change 1>
- <key change 2>

Test Results:
- <validation summary>

Status: <test/stable>"
```

### 7. 查看提交日誌
```bash
git log --oneline -5
git tag -l
```

### 8. 推送到遠端倉庫
```bash
git push origin master
git push origin vX.Y.Z[-suffix]
```

### 9. 推送後驗證（必做）
```bash
git log -1 --oneline
git ls-remote --heads origin master
git ls-remote --tags origin vX.Y.Z[-suffix]
```

確認遠端分支與標籤皆可查到新 hash 才算完成。

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

## 版本標籤說明

`vX.Y.Z[-suffix]` 規則：
- `v` - 版本前綴
- `0.1.0` - 語義版本 (Major.Minor.Patch)
- `-test` / `-rc` - 預發佈標籤（可選）

## 提交後驗證

確認提交成功：
```bash
git log --oneline -1
git show v0.1.0-test
```

## 注意事項

- 禁止只 push 程式碼而不更新版號與 VERSION.md
- 建議在上傳前本地驗證所有測試通過
- 如需修改提交訊息，使用 `git commit --amend`
- 標籤推送需要明確的 `git push origin <tag-name>` 指令

---

完成以上步驟後，本版本即可正式納入版本控制歷史。
