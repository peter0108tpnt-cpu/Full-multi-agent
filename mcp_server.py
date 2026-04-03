import sys
import json
import subprocess
from mcp.server.fastmcp import FastMCP

# 初始化 MCP 伺服器
mcp = FastMCP("Ziwei Expert Server")

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
        "venv/bin/python", "run_analysis.py",
        gender, str(birth_year), str(birth_month), str(birth_day), birth_hour, domain_type
    ]
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, cwd="/Users/paichunc/Library/CloudStorage/OneDrive-個人/0_Ai/NotebookLM/Full-multi-agent")
        
        if result.returncode != 0:
            return f"[分析發錯錯誤]\n\n錯誤代碼: {result.returncode}\n{result.stderr}"
            
        return result.stdout.strip()
    except Exception as e:
        return f"[內部伺服器錯誤]\n\n{str(e)}"

if __name__ == "__main__":
    # 以 stdio 模式執行，讓 MCP 客戶端（如同 Cursor / Claude Desktop / Antigravity）可以連上
    mcp.run(transport='stdio')
