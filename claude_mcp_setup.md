# Claude MCP 設定指南

## 📋 概述

本專案提供兩個 MCP 伺服器（stdio 傳輸），共用同一個本地排盤引擎 `mcp-server/ziwei-chart.js`（基於 [iztro](https://github.com/SylarLong/iztro)），排盤不需網路或 API 金鑰：

| 伺服器 | 啟動檔 | 工具 | 需求 |
|---|---|---|---|
| `ziwei-mcp-server` | `mcp-server/ziwei-server.js` | `ziwei_chart`：排出本命盤 | Node.js 18+ |
| Ziwei Expert Server | `mcp_server.py` | `ziwei_chart`（同上）、`analyze_ziwei`：多智能體完整分析 | Python 3.10+ 獨立環境；`analyze_ziwei` 另需專案 `venv/` 與 API 金鑰 |

只需要命盤時，設定 `ziwei-mcp-server` 即可。

## 🔧 設定步驟（Windows）

### 1. 安裝依賴

需要 [Node.js 18+](https://nodejs.org/)。在命令提示字元或 PowerShell（以下以 `C:\dev\Full-multi-agent` 為例，請換成您的專案位置）：

```bat
cd C:\dev\Full-multi-agent\mcp-server
npm install
npm test
```

`npm test` 會驗證排盤結果（含與 fate.windada.com 命盤的逐宮比對）。建議把專案放在 OneDrive 等同步資料夾之外（例如 `C:\dev\Full-multi-agent`），避免 `node_modules` 被同步或被設為「僅線上可用」而導致伺服器啟動失敗。

### 2. 寫入 Claude Desktop 設定並檢查連線

```bat
node check-desktop.js --install
```

這會在 Claude Desktop 設定檔加入（或更新）`ziwei-mcp-server`，使用本機 node 與伺服器的絕對路徑，保留其他伺服器設定並備份原檔（`.bak`），接著照設定啟動伺服器、完成 MCP 握手，並試排一張命盤確認結果正確。之後隨時可用 `node check-desktop.js` 重新檢查。

也可以手動編輯：Claude Desktop →「設定 → 開發者 → 編輯設定」，設定檔在 `%APPDATA%\Claude\claude_desktop_config.json`（Microsoft Store 版可能在 `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\`，以「編輯設定」開啟的檔案為準）：

```json
{
  "mcpServers": {
    "ziwei-mcp-server": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\dev\\Full-multi-agent\\mcp-server\\ziwei-server.js"]
    }
  }
}
```

- **路徑一律用絕對路徑**：Claude Desktop 啟動伺服器時的工作目錄不是專案目錄，`./mcp-server/...` 會連線失敗
- **反斜線要寫成 `\\`**（或改用 `/`）：`"C:\Users\..."` 不是有效的 JSON，Claude Desktop 會整個忽略設定檔
- `command` 用 `where node` 顯示的完整路徑最穩定

### 3. 重新啟動 Claude Desktop

關閉視窗後 Claude Desktop 仍在系統匣執行，必須在系統匣圖示按右鍵 → **Quit**，再重新開啟。之後在「設定 → 開發者」應看到 `ziwei-mcp-server` 狀態為 running，對話的工具清單中出現 `ziwei_chart`。

### 4.（選用）Python 伺服器

需要多智能體分析 `analyze_ziwei` 時，另建 Python 3.10+ 獨立環境（`mcp` 套件與 `requirements.txt` 鎖定的版本衝突）：

```bat
cd C:\dev\Full-multi-agent
py -3.11 -m venv mcp-venv
mcp-venv\Scripts\pip install -r requirements-mcp.txt
```

在設定檔的 `mcpServers` 中加入：

```json
"ziwei-expert": {
  "command": "C:\\dev\\Full-multi-agent\\mcp-venv\\Scripts\\python.exe",
  "args": ["C:\\dev\\Full-multi-agent\\mcp_server.py"]
}
```

- `ZIWEI_NODE`（放在該伺服器的 `"env"`）：Python 伺服器找不到 node 時指定其路徑
- `ZIWEI_PYTHON`：`analyze_ziwei` 使用的 Python 不在專案 `venv\` 或 `.venv\` 時指定

`node mcp-server\check-desktop.js` 會一併檢查這個伺服器。

### macOS / Linux

設定檔在 `~/Library/Application Support/Claude/claude_desktop_config.json`（macOS）或 `~/.config/Claude/claude_desktop_config.json`（Linux），步驟相同。macOS 桌面程式的 PATH 通常不含 Homebrew 或 nvm 安裝的 node，`command` 請用 `which node` 顯示的完整路徑；`check-desktop.js --install` 會自動使用完整路徑。

## 🧭 `ziwei_chart` 工具

輸入：

| 參數 | 說明 |
|---|---|
| `gender` | `男` / `女` |
| `birth_year`、`birth_month`、`birth_day` | 出生年月日（預設為國曆） |
| `birth_hour` | `子`~`亥`（`子` = 早子時 00:00~01:00）、`晚子`（23:00~24:00），或 `0`~`23` 點 |
| `calendar` | 選填：`solar`（國曆，預設）或 `lunar`（農曆） |
| `is_leap_month` | 選填：農曆閏月 |

輸出 JSON：

- `basic_info`：陽曆、農曆、干支、時辰、五行局 (`wuxing_ju`)、命主 (`ming_zhu`)、身主 (`shen_zhu`)、命宮與身宮地支
- `sihua`：生年四化
- `palaces`：由命宮起的十二宮，含干支、是否身宮、主星與亮度、輔星、雜曜、長生/博士/將前/歲前十二神、大限 (`daxian`)、小限 (`xiaoxian`)

### 準確性

`npm test` 以專案根目錄的 `corrected_response.html`（fate.windada.com 對國曆 1990-05-15 午時、陽男的排盤結果）逐宮比對：十二宮干支、十四主星位置、輔星、生年四化、五行局、命主與身主、長生與博士十二神、大限與小限完全一致。已知的流派差異：

- **亮度**：iztro 採《紫微斗數全書》七級（廟、旺、得、利、平、不、陷）；windada 只顯示五級，「得」寫作「地」，「不」併入「陷」
- **雜曜**：windada 另列月馬與第二個旬空；iztro 另列天廚、天德、月德、年解；天殤與天傷為同一星；截路、空亡在午、未兩宮的分配相反

## 🔍 驗證設定

1. `cd mcp-server && npm test`：排盤與伺服器測試
2. `node mcp-server\check-desktop.js`：以 Claude Desktop 的實際設定啟動伺服器、握手並試排命盤
3. 在 Claude Desktop 中詢問：「請用紫微斗數工具排出 1990 年 5 月 15 日午時出生男性的命盤」，命宮應為丁亥、天梁陷

## 🛠️ 故障排除

| 症狀 | 原因與處理 |
|---|---|
| 「開發者」頁面看不到伺服器 | 設定檔不是有效 JSON（多半是反斜線沒寫成 `\\`），或 Claude Desktop 沒有從系統匣完全結束再開啟 |
| 伺服器狀態為 failed | 使用了相對路徑 → 改用絕對路徑；或 `command` 找不到 node → 改用 `where node` 的完整路徑 |
| 工具回傳 `Cannot find package 'iztro'` | 尚未安裝依賴 → 在 `mcp-server\` 執行 `npm install` |
| Python 伺服器 `No module named 'mcp'` | `command` 指向的 Python 未安裝 `requirements-mcp.txt` |

`check-desktop.js` 會針對以上情況給出具體提示。Claude Desktop 的記錄檔（`mcp.log`、`mcp-server-ziwei-mcp-server.log`）位於：

- **Windows**: `%APPDATA%\Claude\logs\`
- **macOS**: `~/Library/Logs/Claude/`

## 📝 注意事項

1. **安全性**: MCP 伺服器在本機執行，只在可信環境中使用
2. **版本**: `iztro` 在 `package.json` 鎖定版本，升級後請重新執行 `npm test` 確認排盤結果
