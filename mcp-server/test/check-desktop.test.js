import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkServer, configCandidates, recommendedServer } from '../check-desktop.js';

const serverPath = fileURLToPath(new URL('../ziwei-server.js', import.meta.url));

test('Windows 設定檔位置：%APPDATA%\\Claude\\claude_desktop_config.json', () => {
  const candidates = configCandidates('win32', {
    APPDATA: 'C:\\Users\\peter\\AppData\\Roaming',
    LOCALAPPDATA: 'C:\\Users\\peter\\AppData\\Local'
  }, 'C:\\Users\\peter');
  assert.equal(candidates.at(-1), 'C:\\Users\\peter\\AppData\\Roaming\\Claude\\claude_desktop_config.json');
});

test('建議設定可連線並排出正確命盤', async () => {
  const result = await checkServer(recommendedServer());
  assert.equal(result.ok, true, result.problems?.join('\n'));
  assert.ok(result.passed.some((line) => line.includes('命宮 丁亥 天梁陷')));
});

test('相對路徑、找不到 node 都會回報原因', async () => {
  const relative = await checkServer({ command: process.execPath, args: ['./mcp-server/ziwei-server.js'] });
  assert.equal(relative.ok, false);
  assert.match(relative.problems[0], /絕對路徑/);

  const missingNode = await checkServer({ command: 'node-not-installed', args: [serverPath] });
  assert.equal(missingNode.ok, false);
  assert.match(missingNode.problems.join('\n'), /完整路徑/);
});
