# SiteFocus — 網站封鎖專注插件 | Website Blocker & Focus Plugin

[繁體中文](#繁體中文) | [English](#english)

---

<a name="繁體中文"></a>
## 🚀 核心功能 (Traditional Chinese)

**SiteFocus** 是一款 Chrome/Edge 瀏覽器插件 (Manifest V3)，旨在幫助使用者封鎖分心網站、建立專注習慣，並提供彈性的排程與 Pomodoro 統計功能。

- **網站封鎖 (Block List)**：手動輸入網域或完整 URL，支援 `*.domain.com` 萬用字元。
- **白名單模式 (Whitelist)**：可切換為僅允許特定網站。
- **排程管理 (Schedule)**：設定各網站的封鎖時段（星期、起始時間）。
- **專注計時器 (Pomodoro)**：內建 25/5 分鐘計時，專注期間自動封鎖，並在頁面右下角顯示浮動計時器。
- **暫時解除封鎖 (Break/Snooze)**：支援「冷靜計時器（等待 N 秒）」、「密碼保護」或「固定時長解除」。
- **統計報表 (Stats)**：每日封鎖次數與專注 session 圖表（支援過去 7/30 天）。
- **密碼保護 (Password Lock)**：設定頁可加鎖，防止輕易修改封鎖名單。
- **資料隱私**：所有資料儲存於 `chrome.storage.local`，不上傳至外部伺服器。

## 📂 檔案結構
```text
site-blocker/
├── manifest.json      # 插件配置 (MV3)
├── background.js      # Service Worker: DNR 規則與計時邏輯
├── utils.js / stats.js # 工具函式與統計記錄
├── content.js/css     # 注入頁面的浮動計時器
├── blocked.html/js/css # 封鎖提示頁
├── popup.html/js/css   # 工具列小視窗
├── options.html/js/css # 詳細設定頁
└── icons/             # 插件圖示
```

## 🛠 安裝教學
1. 下載或複製品資到本地資料夾。
2. 開啟 Chrome 瀏覽器，前往 `chrome://extensions/`。
3. 右上角開啟「**開發人員模式**」。
4. 點擊「**載入未封裝項目**」，選擇 `site-blocker` 資料夾。

---

<a name="english"></a>
## 🚀 Features (English)

**SiteFocus** is a Chrome/Edge browser extension (Manifest V3) designed to help users block distracting websites, build focus habits, and provide flexible scheduling with Pomodoro statistics.

- **Website Blocking (Block List)**: Manually enter domains or full URLs, supports `*.domain.com` wildcards.
- **Whitelist Mode**: Switch to "Allow-Only" mode where only listed sites are accessible.
- **Schedule Management**: Set blocking periods (days of the week, start/end times) for each entry.
- **Focus Timer (Pomodoro)**: Built-in 25/5 min timer. Automatically blocks sites during focus sessions and shows a floating timer in the corner.
- **Temporary Unblock (Break/Snooze)**: Supports "Cool-down Timer (wait N seconds)", "Password Protection", or "Snooze for X minutes".
- **Statistics & Reports**: Daily charts for blocked attempts and completed focus sessions (last 7/30 days).
- **Password Protection**: Lock the options page to prevent unauthorized changes to the block list.
- **Privacy Focus**: All data is stored locally in `chrome.storage.local`, no data is sent to external servers.

## 📂 File Structure
```text
site-blocker/
├── manifest.json      # Extension Config (MV3)
├── background.js      # Service Worker: DNR rules & timer logic
├── utils.js / stats.js # Utils & Statistics recording
├── content.js/css     # Injected floating timer widget
├── blocked.html/js/css # Custom blocked landing page
├── popup.html/js/css   # Toolbar popup UI
├── options.html/js/css # Advanced settings page
└── icons/             # Extension icons
```

## 🛠 Installation
1. Download or clone this repository to your local machine.
2. Open Chrome/Edge and navigate to `chrome://extensions/`.
3. Enable "**Developer mode**" in the top right corner.
4. Click "**Load unpacked**" and select the `site-blocker` folder.

---

*Focus is the key to success.*
