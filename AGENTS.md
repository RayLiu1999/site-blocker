# AGENTS.md

SiteFocus 是 Chrome / Edge 的 Manifest V3 擴充功能：封鎖分心網站，搭配番茄鐘、排程、白名單與統計。純原生 JavaScript（ES modules），沒有 build 步驟、沒有 npm 相依套件。

## 常用指令

```sh
node --test tests/*.test.mjs          # 全部測試（Node.js 22 以上，不需安裝套件）
```

手動測試：`chrome://extensions` → 開發人員模式 → 載入未封裝項目 → 選這個資料夾。修改 `background.js` 後要按「重新載入」。

## 架構

| 檔案 | 角色 |
|------|------|
| `utils.js` | 共用邏輯：網址正規化與比對、排程判斷、封鎖狀態計算、預設資料。**比對規則只能在這裡定義** |
| `background.js` | Service worker：產生 DNR 規則、alarms（排程、番茄鐘、暫時解除）、攔截已開分頁與 SPA 換頁 |
| `stats.js` | 統計讀寫（本地日期，寫入依序執行） |
| `popup.*` | 工具列視窗：番茄計時盤、封鎖目前網站、今日統計 |
| `options.*` | 設定頁（有密碼時先顯示解鎖畫面） |
| `blocked.*` | 封鎖頁，原始網址放在 hash：`blocked.html#<原始網址>` |
| `content.*` | 網頁右下角的浮動倒數（非 module，不能 import） |
| `theme.css` | 共用色彩與字型 token，popup / options / blocked 都要引入 |

### 封鎖規則的關鍵約定

- 網址格式：`example.com`（只含 www）、`*.example.com`（含所有子網域）、`example.com/path*`（路徑前綴，`*` 為萬用字元）。新增或匯入時一律先經過 `normalizePattern()`。
- `patternToRegexSource()` 產生的 regex 同時給 DNR（RE2）和 JS 使用，**不可使用 lookaround 等 RE2 不支援的語法**，且必須比對完整網址，讓 `regexSubstitution` 的 `\0` 帶出原始網址。
- 每條規則都是 regex 規則，受 `MAX_NUMBER_OF_REGEX_RULES`（1000）限制；超出的數量寫入 storage 的 `ruleStatus.skipped` 並在設定頁警告。
- 白名單模式：priority 1 的「全部導向封鎖頁」加上 priority 2 的 `allow` 規則。不要改回 `excludedInitiatorDomains`，那是比對「發起來源」而不是目的網站。
- 規則更新一律透過 `rebuildDNRRules()`：它會排隊依序執行，用單次 `updateDynamicRules` 原子替換，重建後掃描已開分頁。
- 封鎖與否只由 `getBlockingState()` 決定：停用、暫時解除中、番茄鐘休息階段 → 不封鎖；番茄鐘專注階段 → 忽略排程，全部封鎖。

### 頁面程式的約定

- 事件監聽只在 `setup*()` 綁一次；`render*()` 只更新畫面，不可在 render 裡呼叫 `addEventListener`。
- 使用者資料（網址、提示文字）一律用 `textContent` 插入，不要用 `innerHTML` 拼接。
- 背景的 `runtime.sendMessage` 送不到 content script；需要跨頁同步的狀態請寫進 `chrome.storage.local`，讓各頁監聽 `storage.onChanged`。
- 日期一律用本地時間（`localDateStr()` / `todayStr()`），不要用 `toISOString().slice(0, 10)`。
- 不載入任何外部資源（字型、CDN），以符合「資料不離開本機」的承諾。

## 設計

番茄計時器色系：番茄紅 `--tomato`、深番茄 `--tomato-deep`、果肉粉 `--flesh`、蒂頭綠 `--leaf`（休息 / 成功）。新增顏色請加在 `theme.css` 並同時定義深色模式。介面文字使用繁體中文、口語、以使用者動作命名按鈕。

Icon 原始檔是 `icons/icon.svg`（48、128px 用）與 `icons/icon-small.svg`（16px 用），修改後重新輸出：

```sh
rsvg-convert -w 128 -h 128 icons/icon.svg -o icons/icon128.png
rsvg-convert -w 48 -h 48 icons/icon.svg -o icons/icon48.png
rsvg-convert -w 16 -h 16 icons/icon-small.svg -o icons/icon16.png
```

## 測試

- `tests/helpers/chrome-mock.mjs` 模擬 storage、alarms、tabs 與 DNR，並以 `isBlocked(url)` 依規則優先度判斷實際攔截結果。
- `background.js` 有頂層副作用，每個測試檔只能 import 一次；需要不同情境時用 `chromeMock.reset()` 切換資料。
- 修改比對、排程或規則邏輯時，請在 `tests/patterns.test.mjs` 或 `tests/background-rules.test.mjs` 補測試。

## Commit 慣例

Conventional Commits，scope 用功能名稱，例如 `feat(schedule): …`、`fix(background): …`、`ui(options): …`。
