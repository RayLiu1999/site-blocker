# SiteFocus — 網站封鎖專注插件 SPEC

## 1. 概覽

**SiteFocus** 是一款 Chrome/Edge 瀏覽器插件，功能對標 BlockSite Block Websites & Stay Focused，幫助使用者封鎖分心網站、建立專注習慣，並提供彈性的排程與統計功能。

---

## 2. 核心功能模組

### 2.1 網站封鎖（Block List）

- 使用者可手動輸入網域（domain）或完整 URL 加入封鎖清單；輸入會正規化（去除 scheme、`www.`、port、結尾 `/`，轉小寫，國際化網域轉 punycode），無法辨識時顯示錯誤
- 比對規則：
  - `youtube.com`：只比對該網域與 `www.`
  - `*.youtube.com`：比對該網域與所有子網域
  - `youtube.com/shorts*`：比對該網域下以該路徑開頭的網址，`*` 為萬用字元
- 可一鍵封鎖目前瀏覽的網站（白名單模式下停用）
- SPA 站內換頁（history API）也會被攔截
- 封鎖清單可匯出 / 匯入（JSON 格式）
- 預設提供常見分心網站分類快速加入（Social Media、News、Gaming、Adult）

### 2.2 白名單模式（Whitelist / Allow-Only Mode）

- 可切換為白名單模式：只允許清單內的網站，其餘一律封鎖
- 白名單與封鎖清單可各自獨立管理

### 2.3 封鎖頁面（Blocked Page）

- 訪問被封鎖網站時，跳轉至插件內的封鎖提示頁（`blocked.html`）
- 封鎖頁顯示：
  - 被封鎖的網域名稱
  - 激勵語句（隨機顯示內建語句）
  - 剩餘封鎖時間（專注中顯示剩餘分鐘；排程封鎖顯示當前時段結束時間）
  - 「暫時解除封鎖」按鈕（需輸入密碼或等待冷靜計時器）
- 原始網址以 hash 帶入（`blocked.html#<原始網址>`），解除後導回原網址
- 重新整理或返回封鎖頁不重複計入統計

### 2.4 排程封鎖（Schedule）

- 對每個網站（或群組）設定封鎖時段：
  - 週一至週日可分別啟用，並設定不同的多個時段
  - 指定時間範圍（例如週一 09:00–12:00、週二 14:00–18:00），依本地時間每週重複
- 開啟排程後，未勾選的星期與時段外自動解除封鎖；關閉排程則全天封鎖
- 相容舊版共用時段，原有時段會帶入各指定星期
- 可設定「全天封鎖」快捷選項（關閉排程）
- 結束時間 23:59 視為當日結束（包含最後一分鐘）；跨午夜需分成兩天設定

### 2.5 專注模式（Focus Mode）

- 啟動一次性專注計時（Pomodoro 風格）：
  - 使用者設定專注時長（預設 25 分鐘）與休息時長（預設 5 分鐘）
  - 專注期間封鎖清單全部生效（忽略各網站排程），休息期間暫停封鎖
  - 未啟動番茄鐘時，封鎖清單依各網站排程生效
- 計時器顯示於 popup 及（可選）頁面角落浮動視窗
- 專注結束時瀏覽器通知提醒
- 擴充功能更新或瀏覽器重開後自動補回計時器

### 2.6 暫時解除封鎖（Break / Snooze）

- 三種解除方式：
  1. **冷靜計時器（Cool-down Timer）**：點擊解除後需等待 N 秒（可設定，預設 30 秒）才可通過
  2. **密碼保護**：輸入正確密碼才可暫時解除
  3. **固定時長解除**：解除封鎖 X 分鐘後自動重新封鎖（可設定，預設 5 分鐘）
- 選擇密碼但尚未設定密碼時，封鎖頁改用冷靜計時器
- 解除期間所有網站都不封鎖

### 2.7 密碼保護（Password Lock）

- 使用者可設定插件設定頁的密碼
- 設定密碼後，開啟設定頁需先輸入密碼解鎖（封鎖清單、排程等所有設定都在設定頁內）
- 變更或移除密碼需輸入目前的密碼
- 密碼以 SHA-256 hash 儲存於 `chrome.storage.local`
- 支援密碼提示（非密碼本身）

### 2.8 統計與報表（Stats）

- 記錄每日：
  - 各網站被封鎖次數（嘗試訪問次數）
  - 專注 session 完成次數與總時長
- 提供過去 7 天 / 30 天圖表（長條圖）與最常被擋下的網站
- 日期以本地時間計算
- 資料儲存於 `chrome.storage.local`，不上傳至外部

### 2.9 預設封鎖分類（Quick Block Categories）

| 分類 | 代表網站 |
|------|----------|
| 社群媒體 | facebook.com, twitter.com, instagram.com, tiktok.com, reddit.com, threads.net, linkedin.com |
| 新聞 | cnn.com, bbc.com, news.yahoo.com, foxnews.com, nbcnews.com, apnews.com |
| 影音串流 | youtube.com, netflix.com, twitch.tv, hulu.com, disneyplus.com, primevideo.com |
| 遊戲 | twitch.tv, steampowered.com, ign.com, gamespot.com, roblox.com |
| Adult | （未實作：DNR 無關鍵字比對，需另行設計） |

---

## 3. UI 介面規劃

### 3.1 Popup（點擊插件圖示）

```
┌─────────────────────────────────┐
│  🍅 SiteFocus             [設定] │
│                                 │
│        ╭── 番茄計時盤 ──╮        │
│        │     14:32      │        │  刻度隨剩餘時間消退；
│        │     專注中     │        │  休息時轉為綠色
│        ╰────────────────╯        │
│  [         停止專注          ]  │
│         11:36 開始休息           │
├─────────────────────────────────┤
│  目前網站 youtube.com  [已封鎖]  │
├─────────────────────────────────┤
│  4 次分心被擋下   3 輪專注完成    │
└─────────────────────────────────┘
```

（原規劃的「啟用/停用」開關已移除，避免一鍵繞過封鎖。）

### 3.2 Options Page（設定頁，`options.html`）

分頁式設計：

- **封鎖清單** — 新增/刪除/匯入/匯出清單，切換白名單模式，快速分類
- **排程** — 每網站排程時段設定
- **番茄鐘** — 時長設定、浮動倒數開關
- **暫時解除** — 解除方式與時長
- **統計** — 圖表報表與最常被擋下的網站
- **密碼** — 設定/變更/移除密碼
- **關於** — 版本資訊

設定密碼後，進入設定頁前先顯示解鎖畫面。

### 3.3 Blocked Page（`blocked.html`）

- 全頁番茄紅，簡潔設計
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
├── AGENTS.md              # 開發慣例（給 coding agent 與開發者）
├── theme.css              # 共用色彩與字型 token
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
├── utils.js               # 共用函式：網址正規化與比對、排程、封鎖狀態、hash
├── stats.js               # 統計資料讀寫
├── icons/
│   ├── icon.svg / icon-small.svg   # 原始檔
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── tests/                 # Node.js 測試（含 chrome API mock）
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
        "daySchedules": {     // 0=Sun, 1=Mon ...；每個星期獨立設定
          "1": {
            "enabled": true,
            "timeSlots": [{ "startTime": "09:00", "endTime": "12:00" }]
          },
          "2": {
            "enabled": true,
            "timeSlots": [{ "startTime": "14:00", "endTime": "18:00" }]
          }
        }
      }
    }
  ],
  "whitelist": [],
  "focusMode": {
    "focusDuration": 25,        // 分鐘
    "breakDuration": 5,
    "isRunning": false,
    "sessionStart": null,
    "phase": "focus",           // "focus" | "break"
    "endTime": null             // 目前階段結束時間（ms timestamp）
  },
  "breakSettings": {
    "type": "cooldown",         // "cooldown" | "password" | "timed"
    "cooldownSeconds": 30,      // 5–300
    "timedMinutes": 5           // 1–60
  },
  "snoozeUntil": null,          // 暫時解除結束時間（ms timestamp）
  "passwordHash": null,         // SHA-256 hash
  "passwordHint": "",
  "motivationalQuotes": true,
  "showFloatingTimer": true,    // 網頁角落浮動倒數
  "ruleStatus": { "skipped": 0 }, // 超過規則上限而未生效的數量
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

- 使用 `chrome.declarativeNetRequest`（DNR）動態規則實現 URL 封鎖，每個網址一條 `regexFilter` 規則（與 JS 比對共用同一個 regex，見 `patternToRegexSource()`）
- 封鎖時以 `regexSubstitution` redirect 至 `blocked.html#<原始網址>`
- 白名單模式：priority 1 規則把所有 http(s) 導向封鎖頁，白名單網址以 priority 2 的 `allow` 規則放行
- 規則重建依序執行，並以單次 `updateDynamicRules` 原子替換；批次失敗時改為逐條加入並略過無效規則
- 每次重建後掃描已開分頁，並監聽 `tabs.onUpdated` 攔截 SPA 換頁
- 排程邏輯：每分鐘的 `schedule-check` alarm 重新計算規則
- 專注模式與暫時解除：使用 `chrome.alarms`，啟動時依 storage 補回遺失的 alarm

### 4.5 Permissions

```json
"permissions": [
  "declarativeNetRequest",
  "declarativeNetRequestWithHostAccess",
  "storage",
  "alarms",
  "notifications",
  "tabs"
],
"host_permissions": ["<all_urls>"]
```

---

## 5. 行為規則與邊界條件

| 情境 | 行為 |
|------|------|
| 插件停用（`enabled: false`） | 所有 DNR 規則移除，不攔截任何請求 |
| 專注階段 | 封鎖清單全部生效，忽略排程 |
| 白名單模式下未列出的網站 | 一律封鎖 |
| 排程：目前時間不在封鎖時段 | 該網站不受封鎖 |
| 專注模式休息階段 | 封鎖暫停，使用者可自由瀏覽 |
| 密碼遺忘 | 提示使用者重新安裝插件（無後門） |
| 超過 regex 規則上限（1000 條） | 設定頁顯示警告與未生效數量 |
| 儲存的網址格式無效 | 略過該筆，清單中標示「格式無效」，其他規則照常生效 |
| 匯入格式錯誤 | 顯示錯誤訊息，不覆蓋現有清單 |
| 匯入部分項目無效或重複 | 確認後匯入有效項目，並顯示略過數量 |

---

## 6. 開發里程碑

| 階段 | 功能 | 狀態 |
|------|------|------|
| M1 | 基本封鎖清單、DNR 規則寫入、blocked 頁面 | ✅ 完成 |
| M2 | Popup UI（番茄計時盤）、一鍵封鎖目前網站 | ✅ 完成 |
| M3 | 排程封鎖 | ✅ 完成 |
| M4 | 專注模式（Pomodoro）+ alarms | ✅ 完成 |
| M5 | 暫時解除封鎖（冷靜計時器 / 密碼） | ✅ 完成 |
| M6 | 密碼保護設定頁 | ✅ 完成 |
| M7 | 統計報表 | ✅ 完成 |
| M8 | 白名單模式、分類快速加入 | ✅ 完成 |
| M9 | 匯入 / 匯出 | ✅ 完成 |

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
