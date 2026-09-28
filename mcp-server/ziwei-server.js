#!/usr/bin/env node

import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import { buildChart } from './ziwei-chart.js';

const { version } = createRequire(import.meta.url)('./package.json');

const ZIWEI_CHART_TOOL = {
  name: 'ziwei_chart',
  description: '排出紫微斗數本命盤（本地 iztro 引擎，不需網路）。回傳 JSON：基本資料（陽曆、農曆、干支、五行局、命主、身主）、生年四化，'
    + '以及十二宮（由命宮起）的干支、主星與亮度、輔星、雜曜、長生/博士十二神、大限與小限。',
  inputSchema: {
    type: 'object',
    properties: {
      gender: {
        type: 'string',
        enum: ['男', '女'],
        description: '性別'
      },
      birth_year: {
        type: 'integer',
        description: '出生年份（西元）',
        minimum: 1900,
        maximum: 2100
      },
      birth_month: {
        type: 'integer',
        description: '出生月份',
        minimum: 1,
        maximum: 12
      },
      birth_day: {
        type: 'integer',
        description: '出生日期',
        minimum: 1,
        maximum: 31
      },
      birth_hour: {
        type: 'string',
        description: '出生時辰：子、丑、寅…亥（子 = 早子時 00:00~01:00）、晚子（23:00~24:00），或 0~23 點'
      },
      calendar: {
        type: 'string',
        enum: ['solar', 'lunar'],
        default: 'solar',
        description: '出生日期的曆法：solar 國曆（預設）或 lunar 農曆'
      },
      is_leap_month: {
        type: 'boolean',
        default: false,
        description: '農曆閏月（僅 calendar 為 lunar 時有效）'
      }
    },
    required: ['gender', 'birth_year', 'birth_month', 'birth_day', 'birth_hour']
  }
};

class ZiweiMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'ziwei-mcp-server',
        version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  setupToolHandlers() {
    // 列出可用工具
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [ZIWEI_CHART_TOOL]
    }));

    // 處理工具調用
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name !== ZIWEI_CHART_TOOL.name) {
        throw new McpError(ErrorCode.InvalidParams, `Unknown tool: ${name}`);
      }
      return this.callZiweiChart(args);
    });
  }

  callZiweiChart(args) {
    // 輸入錯誤以工具結果回報（isError），讓模型能看到原因並修正參數
    try {
      return {
        content: [{ type: 'text', text: JSON.stringify(buildChart(args), null, 2) }]
      };
    } catch (error) {
      return {
        content: [{ type: 'text', text: `排盤失敗: ${error.message}` }],
        isError: true
      };
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Ziwei MCP Server running on stdio');
  }
}

const server = new ZiweiMCPServer();
server.run().catch(console.error);
