import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const serverPath = fileURLToPath(new URL('../ziwei-server.js', import.meta.url));
const cliPath = fileURLToPath(new URL('../chart-cli.js', import.meta.url));
const BIRTH = { gender: '男', birth_year: 1990, birth_month: 5, birth_day: 15, birth_hour: '午' };

test('MCP stdio：從其他目錄啟動，列出 ziwei_chart 並回傳命盤', async () => {
  const client = new Client({ name: 'ziwei-test', version: '1.0.0' });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: tmpdir(),
    stderr: 'ignore'
  }));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map((tool) => tool.name), ['ziwei_chart']);

    const result = await client.callTool({ name: 'ziwei_chart', arguments: BIRTH });
    assert.ok(!result.isError);
    const chart = JSON.parse(result.content[0].text);
    assert.equal(chart.palaces[0].name, '命宮');
    assert.equal(chart.palaces[0].ganzhi, '丁亥');

    const failed = await client.callTool({ name: 'ziwei_chart', arguments: { ...BIRTH, birth_day: 32 } });
    assert.equal(failed.isError, true);
    assert.match(failed.content[0].text, /birth_day/);
  } finally {
    await client.close();
  }
});

test('chart-cli：成功時輸出 JSON，失敗時 exit code 1', () => {
  const ok = spawnSync(process.execPath, [cliPath, JSON.stringify(BIRTH)], { encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.equal(JSON.parse(ok.stdout).basic_info.wuxing_ju, '土五局');

  const bad = spawnSync(process.execPath, [cliPath, JSON.stringify({ ...BIRTH, gender: 'x' })], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /gender/);
});
