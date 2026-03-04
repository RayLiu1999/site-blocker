# SiteFocus — 網站封鎖專注插件 SPEC

## 1. 概覽

**SiteFocus** 是一款 Chrome/Edge 瀏覽器插件，功能對標 BlockSite Block Websites & Stay Focused，幫助使用者封鎖分心網站、建立專注習慣，並提供彈性的排程與統計功能。

---

## 2. 核心功能模組

### 2.1 網站封鎖（Block List）

- 使用者可手動輸入網域（domain）或完整 URL 加入封鎖清單
- 支援萬用字元（wildcard）：例如 `*.youtube.com`、`reddit.com/*`
- 支援整個網域封鎖（自動匹配子域名）
- 可一鍵封鎖目前瀏覽的網站
- 封鎖清單可匯出 / 匯入（JSON 格式）
- 預設提供常見分心網站分類快速加入（Social Media、News、Gaming、Adult）

### 2.2 白名單模式（Whitelist / Allow-Only Mode）

- 可切換為白名單模式：只允許清單內的網站，其餘一律封鎖
- 白名單與封鎖清單可各自獨立管理

### 2.3 封鎖頁面（Blocked Page）

- 訪問被封鎖網站時，跳轉至插件內的封鎖提示頁（`blocked.html`）
- 封鎖頁顯示：
  - 被封鎖的網域名稱
  - 激勵語句（可自訂或隨機顯示內建語句）
  - 剩餘封鎖時間（若有排程）
  - 「暫時解除封鎖」按鈕（需輸入密碼或等待冷靜計時器）

### 2.4 排程封鎖（Schedule）

- 對每個網站（或群組）設定封鎖時段：
  - 指定星期幾（Mon–Sun）
  - 指定時間範圍（例如 09:00–18:00）
- 非排程時段自動解除封鎖
- 可設定「全天封鎖」快捷選項

### 2.5 專注模式（Focus Mode）

- 啟動一次性專注計時（Pomodoro 風格）：
  - 使用者設定專注時長（預設 25 分鐘）與休息時長（預設 5 分鐘）
  - 專注期間封鎖清單啟動，休息期間暫停
- 計時器顯示於 popup 及（可選）頁面角落浮動視窗
- 專注結束時瀏覽器通知提醒

### 2.6 暫時解除封鎖（Break / Snooze）

- 三種解除方式：
  1. **冷靜計時器（Cool-down Timer）**：點擊解除後需等待 N 秒（可設定，預設 30 秒）才可通過
  2. **密碼保護**：輸入正確密碼才可暫時解除
  3. **固定時長解除**：解除封鎖 X 分鐘後自動重新封鎖（可設定，預設 5 分鐘）
- 以上方式可組合使用

### 2.7 密碼保護（Password Lock）

- 使用者可設定插件設定頁的密碼
- 封鎖清單修改、排程修改、插件停用均需輸入密碼
- 密碼以 SHA-256 hash 儲存於 `chrome.storage.local`
- 支援密碼提示（非密碼本身）

### 2.8 統計與報表（Stats）

- 記錄每日：
  - 各網站被封鎖次數（嘗試訪問次數）
  - 專注 session 完成次數與總時長
- 提供過去 7 天 / 30 天圖表（長條圖）
- 資料儲存於 `chrome.storage.local`，不上傳至外部

### 2.9 預設封鎖分類（Quick Block Categories）

| 分類 | 代表網站 |
|------|----------|
| Social Media | facebook.com, twitter.com, instagram.com, tiktok.com, reddit.com |
| News | cnn.com, bbc.com, news.yahoo.com |
| Video / Streaming | youtube.com, netflix.com, twitch.tv |
| Gaming | twitch.tv, steam.com, ign.com |
| Adult | （預設啟用關鍵字過濾清單，不逐一列出） |

---

## 3. UI 介面規劃

### 3.1 Popup（點擊插件圖示）

```
┌─────────────────────────────────┐
│  SiteFocus          [設定 ⚙]   │
├─────────────────────────────────┤
│  [啟用/停用] 封鎖  (toggle)     │
│                                 │
│  專注模式：[開始 ▶] 25:00      │
├─────────────────────────────────┤
│  封鎖目前網站  [+ Block This]   │
├─────────────────────────────────┤
│  今日統計：封鎖 12 次           │
│  專注完成：2 sessions           │
└─────────────────────────────────┘
```

### 3.2 Options Page（設定頁，`options.html`）

分頁式設計：

- **封鎖清單** — 新增/刪除/匯入/匯出清單，切換白名單模式
- **排程** — 每網站排程時段設定
- **專注模式** — Pomodoro 時長設定
- **暫時解除** — 解除方式與時長
- **統計** — 圖表報表
- **密碼** — 設定/變更密碼
- **關於** — 版本資訊

### 3.3 Blocked Page（`blocked.html`）

- 全頁覆蓋，簡潔設計
- 顯示封鎖資訊與激勵語句
- 提供「暫時解除」入口

---

## 4. 技術架構

### 4.1 Manifest 版本

- **Manifest V3**（符合 Chrome 現行規範）

### 4.2 主要檔案結構

```
site-blocker/
├── manifest.json
├── background.js          # Service Worker：攔截請求、排程邏輯、計時器
├── content.js             # 注入頁面：浮動計時器 UI
├── content.css
├── blocked.html           # 封鎖提示頁
├── blocked.js
├── blocked.css
├── popup.html
├── popup.js
├── popup.css
├── options.html
├── options.js
├── options.css
├── utils.js               # 共用函式：hash、時間比對、萬用字元匹配
├── stats.js               # 統計資料讀寫
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── SPEC.md
```

### 4.3 資料儲存（`chrome.storage.local`）

```json
{
  "enabled": true,
  "mode": "blocklist",          // "blocklist" | "whitelist"
  "blocklist": [
    {
      "id": "uuid",
      "pattern": "*.youtube.com",
      "category": "video",
      "schedule": {
        "enabled": false,
        "days": [1,2,3,4,5],    // 0=Sun, 1=Mon ...
        "startTime": "09:00",
        "endTime": "18:00"
      }
    }
  ],
  "whitelist": [],
  "focusMode": {
    "focusDuration": 25,        // 分鐘
    "breakDuration": 5,
    "isRunning": false,
    "sessionStart": null,
    "phase": "focus"            // "focus" | "break"
  },
  "breakSettings": {
    "type": "cooldown",         // "cooldown" | "password" | "timed"
    "cooldownSeconds": 30,
    "timedMinutes": 5
  },
  "passwordHash": null,         // SHA-256 hash
  "passwordHint": "",
  "motivationalQuotes": true,
  "stats": {
    "daily": {
      "2026-03-04": {
        "blockedAttempts": { "youtube.com": 3 },
        "focusSessions": 2,
        "focusMinutes": 50
      }
    }
  }
}
```

### 4.4 請求攔截機制

- 使用 `chrome.declarativeNetRequest`（DNR）動態規則實現 URL 封鎖
- 每次封鎖清單更新時，重新寫入 DNR 動態規則
- 封鎖時 redirect 至 `blocked.html?url=<encoded_url>`
- 排程邏輯：background service worker 依排程啟用/停用對應 DNR 規則
- 專注模式計時器：使用 `chrome.alarms` API

### 4.5 Permissions

```json
"permissions": [
  "declarativeNetRequest",
  "declarativeNetRequestWithHostAccess",
  "storage",
  "alarms",
  "notifications",
  "tabs",
  "activeTab"
],
"host_permissions": ["<all_urls>"]
```

---

## 5. 行為規則與邊界條件

| 情境 | 行為 |
|------|------|
| 插件停用 | 所有 DNR 規則移除，不攔截任何請求 |
| 白名單模式下未列出的網站 | 一律封鎖 |
| 排程：目前時間不在封鎖時段 | 該網站不受封鎖 |
| 專注模式休息階段 | 封鎖暫停，使用者可自由瀏覽 |
| 密碼遺忘 | 提示使用者重新安裝插件（無後門） |
| 超過 DNR 規則上限（5000條） | 顯示警告，建議使用分類封鎖 |
| 匯入格式錯誤 | 顯示錯誤訊息，不覆蓋現有清單 |

---

## 6. 開發里程碑

| 階段 | 功能 | 狀態 |
|------|------|------|
| M1 | 基本封鎖清單、DNR 規則寫入、blocked 頁面 | 待開發 |
| M2 | Popup UI、啟用/停用、一鍵封鎖目前網站 | 待開發 |
| M3 | 排程封鎖 | 待開發 |
| M4 | 專注模式（Pomodoro）+ alarms | 待開發 |
| M5 | 暫時解除封鎖（冷靜計時器 / 密碼） | 待開發 |
| M6 | 密碼保護設定頁 | 待開發 |
| M7 | 統計報表 | 待開發 |
| M8 | 白名單模式、分類快速加入 | 待開發 |
| M9 | 匯入 / 匯出 | 待開發 |

---

## 7. 瀏覽器相容性

| 瀏覽器 | 支援 |
|--------|------|
| Chrome 88+ | ✅（Manifest V3 原生支援） |
| Edge 88+ | ✅（Chromium 核心） |
| Firefox | ⚠️ 需調整（MV3 支援差異，DNR API 略有不同） |
| Safari | ❌ 不在本次範疇 |

---

## 8. 隱私政策說明

- 所有資料僅儲存於本地 `chrome.storage.local`，不傳送至任何伺服器
- 不收集使用者瀏覽歷史
- 密碼僅以 SHA-256 單向 hash 儲存，無法還原
