import sys
import json
import asyncio
import io

# 導向 stdout 避免框架的 debug 訊息污染 JSON-RPC (雖然我們不是透過 JSON-RPC 返回，
# 但我們希望 output 盡量乾淨，不要有太多不必要的 warning)
import logging
# 設定日誌只輸出 ERROR 或以上級別
logging.basicConfig(level=logging.ERROR)

from src.config.settings import get_settings
from main import create_ziwei_ai_system

async def run():
    if len(sys.argv) < 6:
        print("Invalid arguments. Needs: gender year month day hour [domain_type]")
        sys.exit(1)
        
    gender = sys.argv[1]
    birth_year = int(sys.argv[2])
    birth_month = int(sys.argv[3])
    birth_day = int(sys.argv[4])
    birth_hour = sys.argv[5]
    domain_type = sys.argv[6] if len(sys.argv) > 6 else "comprehensive"
    
    birth_data = {
        "gender": gender,
        "birth_year": birth_year,
        "birth_month": birth_month,
        "birth_day": birth_day,
        "birth_hour": birth_hour
    }
    
    system = await create_ziwei_ai_system()
    
    try:
        # 調用核心分析系統
        result = await system.analyze_ziwei_chart(
            birth_data=birth_data,
            domain_type=domain_type,
            output_format="json_to_narrative",  # 使用論述格式
            show_agent_process=False
        )
        
        if result.get("success"):
            output = result.get("result", "")
            if isinstance(output, dict):
                print(json.dumps(output, ensure_ascii=False, indent=2))
            else:
                print(output)
        else:
            print(f"Analysis Failed: {result.get('error')}")
            sys.exit(1)
            
    finally:
        await system.cleanup()

if __name__ == "__main__":
    asyncio.run(run())
