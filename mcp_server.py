"""
紫微斗數 MCP 伺服器 (stdio)

工具:
- ziwei_chart: 本地排盤，使用 mcp-server/ 的 iztro 引擎（需 Node.js 18+，並先在 mcp-server/ 執行 npm install）
- analyze_ziwei: 多智能體完整分析，在專案自己的 Python 環境執行

安裝: pip install -r requirements-mcp.txt  (Python 3.10+，與主專案環境分開)
分析流程預設使用專案內的 venv/ 或 .venv/，可用環境變數 ZIWEI_PYTHON 指定直譯器路徑；
找不到 node 時（例如桌面應用程式的 PATH 較短），可用 ZIWEI_NODE 指定 node 路徑。
"""

import os
import sys
import json
import shutil
import subprocess
from pathlib import Path
from mcp.server.fastmcp import FastMCP

# 以本檔位置定位專案根目錄，不依賴啟動時的工作目錄
PROJECT_ROOT = Path(__file__).resolve().parent
CHART_CLI = PROJECT_ROOT / "mcp-server" / "chart-cli.js"

# 初始化 MCP 伺服器
mcp = FastMCP("Ziwei Expert Server")

def resolve_project_python() -> str:
    """找出執行分析流程的 Python：ZIWEI_PYTHON > 專案 venv/.venv > 目前的直譯器"""
    override = os.environ.get("ZIWEI_PYTHON")
    if override:
        return override
    for venv_dir in ("venv", ".venv"):
        for relative in (("bin", "python"), ("Scripts", "python.exe")):
            candidate = PROJECT_ROOT.joinpath(venv_dir, *relative)
            if candidate.exists():
                return str(candidate)
    return sys.executable

@mcp.tool()
def ziwei_chart(gender: str, birth_year: int, birth_month: int, birth_day: int, birth_hour: str, calendar: str = "solar", is_leap_month: bool = False) -> str:
    """排出紫微斗數本命盤（本地 iztro 引擎，不需網路或 API 金鑰），回傳 JSON：
    基本資料（陽曆、農曆、干支、五行局、命主、身主）、生年四化，以及十二宮的干支、主星與亮度、輔星、雜曜、大限與小限。

    Args:
        gender: 性別 (男/女)
        birth_year: 出生年份 (西元，如 1990)
        birth_month: 出生月份 (1-12)
        birth_day: 出生日期 (1-31)
        birth_hour: 時辰 (子、丑…亥；子 = 早子時 00:00~01:00，晚子 = 23:00~24:00) 或 0~23 點
        calendar: 出生日期的曆法 (solar 國曆 / lunar 農曆)
        is_leap_month: 農曆閏月 (僅 calendar 為 lunar 時有效)
    """
    node = os.environ.get("ZIWEI_NODE") or shutil.which("node")
    if not node:
        return "[排盤失敗]\n\n找不到 node：請安裝 Node.js 18+，或用環境變數 ZIWEI_NODE 指定 node 路徑"

    birth_data = {
        "gender": gender, "birth_year": birth_year, "birth_month": birth_month, "birth_day": birth_day,
        "birth_hour": birth_hour, "calendar": calendar, "is_leap_month": is_leap_month
    }

    try:
        result = subprocess.run(
            [node, str(CHART_CLI), json.dumps(birth_data)],
            capture_output=True, text=True, encoding="utf-8", errors="replace"
        )
    except Exception as e:
        return f"[排盤失敗]\n\n{str(e)}"

    if result.returncode != 0:
        message = result.stderr.strip()
        if "Cannot find package" in message:
            message += "\n\n請先在 mcp-server/ 目錄執行 npm install"
        return f"[排盤失敗]\n\n{message}"
    return result.stdout

@mcp.tool()
def analyze_ziwei(gender: str, birth_year: int, birth_month: int, birth_day: int, birth_hour: str, domain_type: str = "comprehensive") -> str:
    """獲取紫微斗數命盤分析與多智能體討論結果。
    
    Args:
        gender: 性別 (男/女)
        birth_year: 出生年份 (如 1990)
        birth_month: 出生月份 (1-12)
        birth_day: 出生日期 (1-31)
        birth_hour: 時辰 (子、丑、寅、卯、辰、巳、午、未、申、酉、戌、亥)
        domain_type: 分析領域 (comprehensive, love, wealth, future 等)
    """
    
    # 由於需要依賴原專案 (Python 3.9) 的諸多巨型套件 (如 torch, langchain)
    # 這裡我們透過 subprocess 呼叫原有的 venv 環境來執行
    cmd = [
        resolve_project_python(), str(PROJECT_ROOT / "run_analysis.py"),
        gender, str(birth_year), str(birth_month), str(birth_day), birth_hour, domain_type
    ]
    # 強制子行程以 UTF-8 輸出中文，避免 Windows 預設編碼 (cp950) 造成亂碼
    env = {**os.environ, "PYTHONIOENCODING": "utf-8"}

    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
            cwd=PROJECT_ROOT, env=env
        )
        
        if result.returncode != 0:
            return f"[分析發錯錯誤]\n\n錯誤代碼: {result.returncode}\n{result.stderr}"
            
        return result.stdout.strip()
    except Exception as e:
        return f"[內部伺服器錯誤]\n\n{str(e)}"

if __name__ == "__main__":
    # 以 stdio 模式執行，讓 MCP 客戶端（如同 Cursor / Claude Desktop / Antigravity）可以連上
    mcp.run(transport='stdio')
