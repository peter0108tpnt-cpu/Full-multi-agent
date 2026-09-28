#!/usr/bin/env node

// 檢查 Claude Desktop 能否連上紫微 MCP 伺服器：讀取實際設定檔，照設定啟動伺服器、完成 MCP 握手並試排一張命盤
// 用法:
//   node check-desktop.js                  檢查 Claude Desktop 設定
//   node check-desktop.js --install        在設定檔加入（或更新）ziwei-mcp-server，並先備份原檔
//   node check-desktop.js <設定檔路徑>      檢查指定的設定檔
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const SERVER_NAME = 'ziwei-mcp-server';
const SERVER_SCRIPT = fileURLToPath(new URL('./ziwei-server.js', import.meta.url));
// 國曆 1990-05-15 午時男命：命宮應為丁亥、天梁陷（與 fate.windada.com 一致）
const SAMPLE = { gender: '男', birth_year: 1990, birth_month: 5, birth_day: 15, birth_hour: '午' };

export function configCandidates(platform = process.platform, env = process.env, home = homedir()) {
  if (platform === 'win32') {
    const candidates = [];
    // Microsoft Store (MSIX) 版的 Claude 會把 AppData\Roaming 虛擬化到套件目錄，且優先讀取該處
    const packages = path.win32.join(env.LOCALAPPDATA ?? path.win32.join(home, 'AppData', 'Local'), 'Packages');
    if (existsSync(packages)) {
      for (const dir of readdirSync(packages).filter((name) => name.startsWith('Claude_'))) {
        candidates.push(path.win32.join(packages, dir, 'LocalCache', 'Roaming', 'Claude', 'claude_desktop_config.json'));
      }
    }
    candidates.push(path.win32.join(env.APPDATA ?? path.win32.join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json'));
    return candidates;
  }
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')];
  }
  return [path.join(home, '.config', 'Claude', 'claude_desktop_config.json')];
}

// 本機建議設定：node 與伺服器都用絕對路徑，JSON.stringify 會正確跳脫 Windows 反斜線
export function recommendedServer() {
  return { command: process.execPath, args: [SERVER_SCRIPT] };
}

function isZiweiServer(name, server) {
  return /ziwei/i.test(name) || (server.args ?? []).some((arg) => /ziwei-server\.js|mcp_server\.py/.test(arg));
}

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export async function checkServer(server) {
  const { command, args = [], env = {} } = server;
  const script = args.find((arg) => /\.(c|m)?js$|\.py$/i.test(arg));
  if (!command) return { ok: false, problems: ['缺少 command'] };
  if (script && !path.isAbsolute(script)) {
    return { ok: false, problems: [`腳本必須使用絕對路徑: ${script}（Claude Desktop 啟動伺服器時的工作目錄不是專案目錄）`] };
  }
  if (script && !existsSync(script)) return { ok: false, problems: [`找不到腳本: ${script}`] };
  if (path.isAbsolute(command) && !existsSync(command)) return { ok: false, problems: [`找不到 command: ${command}`] };

  const transport = new StdioClientTransport({
    command,
    args,
    env: { ...getDefaultEnvironment(), ...env },
    cwd: homedir(),
    stderr: 'pipe'
  });
  let stderr = '';
  transport.stderr?.on('data', (chunk) => { stderr += chunk; });
  const client = new Client({ name: 'ziwei-desktop-check', version: '1.0.0' });
  const passed = [];

  try {
    await withTimeout(client.connect(transport), 60_000, 'MCP 握手逾時（60 秒）');
    const info = client.getServerVersion();
    passed.push(`MCP 握手成功（${info?.name ?? '?'} ${info?.version ?? ''}）`.trim());

    const { tools } = await client.listTools();
    passed.push(`工具: ${tools.map((tool) => tool.name).join(', ')}`);
    if (!tools.some((tool) => tool.name === 'ziwei_chart')) {
      return { ok: false, passed, problems: ['伺服器沒有 ziwei_chart 工具，請更新到最新版本'] };
    }

    const result = await withTimeout(client.callTool({ name: 'ziwei_chart', arguments: SAMPLE }), 60_000, '排盤逾時（60 秒）');
    const text = result.content?.[0]?.text ?? '';
    if (result.isError || text.startsWith('[排盤失敗]')) return { ok: false, passed, problems: [`排盤失敗: ${text}`] };
    const ming = JSON.parse(text).palaces[0];
    const majors = ming.major_stars.map((star) => star.name + (star.brightness ?? '')).join('、');
    if (ming.name !== '命宮' || ming.ganzhi !== '丁亥' || majors !== '天梁陷') {
      return { ok: false, passed, problems: [`排盤結果不符：命宮 ${ming.ganzhi} ${majors}（應為 丁亥 天梁陷）`] };
    }
    passed.push(`排盤正確（1990-05-15 午時 男 → 命宮 ${ming.ganzhi} ${majors}）`);
    return { ok: true, passed };
  } catch (error) {
    const problems = [error.message + (stderr.trim() ? `\n      伺服器輸出: ${stderr.trim()}` : '')];
    if (error.code === 'ENOENT') problems.push(`找不到 command「${command}」：改用完整路徑，例如 ${JSON.stringify(process.execPath)}`);
    if (error.code === 'EPERM' || error.code === 'EACCES') problems.push('沒有權限執行或讀取檔案：確認專案不在受保護的資料夾，或檢查防毒/同步軟體設定');
    return { ok: false, passed, problems };
  } finally {
    await client.close().catch(() => {});
  }
}

function readConfig(file) {
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`設定檔不是有效的 JSON（Claude Desktop 會整個忽略它）: ${error.message}\n`
      + '  Windows 路徑的反斜線要寫成 \\\\，或改用 /，例如 "C:/Users/you/Full-multi-agent/mcp-server/ziwei-server.js"');
  }
}

function install(file) {
  const config = existsSync(file) ? readConfig(file) : {};
  if (existsSync(file)) {
    copyFileSync(file, `${file}.bak`);
    console.log(`已備份原設定檔: ${file}.bak`);
  }
  mkdirSync(path.dirname(file), { recursive: true });
  config.mcpServers = { ...config.mcpServers, [SERVER_NAME]: recommendedServer() };
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`已寫入 ${SERVER_NAME} 到: ${file}`);
}

async function main() {
  const argv = process.argv.slice(2);
  const explicit = argv.find((arg) => !arg.startsWith('--'));
  const candidates = explicit ? [path.resolve(explicit)] : configCandidates();
  const file = candidates.find((candidate) => existsSync(candidate)) ?? candidates[candidates.length - 1];

  if (argv.includes('--install')) install(file);

  console.log(`Claude Desktop 設定檔: ${file}`);
  if (!existsSync(file)) {
    console.log('✗ 設定檔不存在。執行 node check-desktop.js --install 建立，或在 Claude Desktop「設定 → 開發者 → 編輯設定」開啟');
    return false;
  }

  const servers = Object.entries(readConfig(file).mcpServers ?? {}).filter(([name, server]) => isZiweiServer(name, server));
  if (servers.length === 0) {
    console.log('✗ 設定檔中沒有紫微 MCP 伺服器。執行 node check-desktop.js --install，或手動加入：');
    console.log(JSON.stringify({ mcpServers: { [SERVER_NAME]: recommendedServer() } }, null, 2));
    return false;
  }

  let allOk = true;
  for (const [name, server] of servers) {
    console.log(`\n[${name}] ${server.command} ${(server.args ?? []).join(' ')}`);
    const { ok, passed = [], problems = [] } = await checkServer(server);
    for (const line of passed) console.log(`  ✓ ${line}`);
    for (const line of problems) console.log(`  ✗ ${line}`);
    allOk &&= ok;
  }

  console.log(allOk
    ? '\n通過：完全結束 Claude Desktop（系統匣圖示 → Quit）後重新開啟，即可使用 ziwei_chart。'
    : '\n未通過：依上方提示修正後再執行一次。');
  return allOk;
}

// 以實際路徑比對：專案經由連結 (junction/symlink) 開啟時，argv 與 import.meta.url 的路徑寫法會不同
function isMainModule() {
  try {
    return realpathSync.native(process.argv[1]) === realpathSync.native(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  main()
    .then((ok) => { process.exitCode = ok ? 0 : 1; })
    .catch((error) => {
      console.error(`✗ ${error.message}`);
      process.exitCode = 1;
    });
}
