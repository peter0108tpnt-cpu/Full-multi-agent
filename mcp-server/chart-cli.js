#!/usr/bin/env node

// 命令列排盤，供 Python MCP 伺服器 (mcp_server.py) 呼叫
// 用法: node chart-cli.js '{"gender":"男","birth_year":1990,"birth_month":5,"birth_day":15,"birth_hour":"午"}'
import { buildChart } from './ziwei-chart.js';

try {
  const chart = buildChart(JSON.parse(process.argv[2] ?? '{}'));
  process.stdout.write(JSON.stringify(chart, null, 2));
} catch (error) {
  process.stderr.write(error.message);
  process.exitCode = 1;
}
