# ShadowHunters

ShadowHunters 是一個以網頁為主的暗影獵人專案，包含前端介面、後端遊戲邏輯、房間流程與對戰紀錄。

## 專案結構

- frontend/: 前端頁面與互動邏輯
- backend/: 後端 API、房間管理、遊戲規則與資料處理
- issue_list/: 問題追蹤與修正紀錄
- scripts/: 測試、驗證、模擬與維運腳本
- VERSION.md: 給玩家看的版本更新內容

## 快速啟動

1. 建立並啟用 Python 虛擬環境。
2. 安裝專案所需套件。
3. 啟動伺服器：
   - Windows: start_server.bat
   - 或使用命令：python main.py serve --host 0.0.0.0 --port 5600
4. 開啟瀏覽器：
   - http://127.0.0.1:5600/index.html

## 測試

- 執行基礎測試流程：
  - Windows: run_tests.bat

## 協作規則

- 推版前的所有調整，先持續累積在同一個目前版本區塊。
- 只有在要正式推版時，才定版號。
- issue_list/ 預設只做本地追蹤；除非有明確要求，否則不提交與推送。

## 相關文件

- GAME_UI_NOTES.md
- GAME_RECORDS_QUICKSTART.md
- GIT_RELEASE_GUIDE.md
