# SiteFocus — 網站封鎖專注插件 | Website Blocker & Focus Plugin

[繁體中文](#繁體中文) | [English](#english)

---

<a name="繁體中文"></a>
## 🍅 核心功能

**SiteFocus** 是一款 Chrome/Edge 瀏覽器插件 (Manifest V3)，用番茄鐘幫你封鎖分心網站、建立專注習慣。

- **網站封鎖**：輸入網域或網址即可封鎖。`youtube.com` 封鎖該網域（含 www），`*.reddit.com` 連同所有子網域，`youtube.com/shorts*` 只封鎖特定路徑。單頁應用（SPA）站內換頁也會被攔截。
- **白名單模式**：只允許清單內的網站，其他一律封鎖。
- **排程**：各網站可依週一至週日分別設定多個封鎖時段，每週重複，依本地時間生效。關閉排程則全天封鎖。
- **番茄鐘**：預設 25/5 分鐘。專注期間清單內網站一律封鎖（忽略排程），休息時暫停封鎖；網頁右下角可顯示倒數（可關閉）。
- **暫時解除**：冷靜計時（等待 N 秒）、輸入密碼或直接解除，時間到自動恢復封鎖，並導回原本要去的網址。
- **封鎖頁**：顯示被擋下的網站、專注剩餘時間或排程結束時間。
- **統計報表**：過去 7 / 30 天的每日擋下次數、完成番茄數，以及最常被擋下的網站。
- **密碼保護**：設定密碼後，開啟設定頁需先解鎖。
- **資料隱私**：所有資料只存在 `chrome.storage.local`，不連線到任何外部伺服器（包含字型）。

## 📂 檔案結構
```text
site-blocker/
├── manifest.json        # 插件配置 (MV3)
├── background.js        # Service Worker：DNR 規則、alarms、分頁攔截
├── utils.js / stats.js  # 共用邏輯（網址比對、排程、封鎖狀態）與統計
├── theme.css            # 共用色彩與字型 token
├── content.js/css       # 網頁右下角的浮動倒數
├── blocked.html/js/css  # 封鎖頁
├── popup.html/js/css    # 工具列視窗
├── options.html/js/css  # 設定頁
├── icons/               # 圖示（SVG 原始檔與 PNG）
└── tests/               # Node.js 測試
```

## 🛠 安裝教學
1. 下載或複製專案到本地資料夾。
2. 開啟 Chrome 瀏覽器，前往 `chrome://extensions/`。
3. 右上角開啟「**開發人員模式**」。
4. 點擊「**載入未封裝項目**」，選擇 `site-blocker` 資料夾。

---

<a name="english"></a>
## 🍅 Features

**SiteFocus** is a Chrome/Edge extension (Manifest V3) that pairs a Pomodoro timer with website blocking to help you build focus habits.

- **Website blocking**: `youtube.com` blocks the domain (and www), `*.reddit.com` also blocks every subdomain, and `youtube.com/shorts*` blocks a specific path. In-app navigation on single-page apps is caught too.
- **Whitelist mode**: only listed sites are allowed; everything else is blocked.
- **Schedules**: multiple blocking periods per weekday and per site, recurring weekly in local time. Turning a schedule off blocks the site all day.
- **Pomodoro timer**: 25/5 minutes by default. During focus every listed site is blocked regardless of its schedule; breaks pause blocking. An optional countdown appears in the page corner.
- **Temporary unblock**: cool-down timer, password, or instant unblock. Blocking resumes automatically, and you are returned to the URL you originally opened.
- **Block page**: shows the blocked site and how long the focus session or schedule has left.
- **Statistics**: daily blocked attempts, completed Pomodoros, and most-blocked sites for the last 7 / 30 days.
- **Password lock**: once a password is set, the settings page must be unlocked first.
- **Privacy**: everything stays in `chrome.storage.local`; the extension never contacts external servers, not even for fonts.

## 🛠 Installation
1. Download or clone this repository.
2. Open `chrome://extensions/` in Chrome or Edge.
3. Enable "**Developer mode**" in the top right corner.
4. Click "**Load unpacked**" and select the `site-blocker` folder.

---

*Focus is the key to success.*

## 開發驗證 / Development checks

使用 Node.js 22 以上版本執行測試，無需安裝套件：

```sh
node --test tests/*.test.mjs
```

開發慣例請見 [AGENTS.md](AGENTS.md)。
