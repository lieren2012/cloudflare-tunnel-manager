/**
 * tunnels.js - 多隧道进程管理器
 * 核心：每条在线隧道一个独立 cloudflared 进程，多条隧道并行在线互不影响。
 */
const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const store = require('./store');
const cfd = require('./cloudflare');

const CLOUDFLARED = process.env.CLOUDFLARED_PATH || findCloudflared();

function findCloudflared() {
  const candidates = ['/usr/local/bin/cloudflared', '/usr/bin/cloudflared', '/opt/homebrew/bin/cloudflared'];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p; } catch (_) { /* ignore */ }
  }
  return 'cloudflared'; // 依赖 PATH
}

// tunnelId -> { proc, startedAt, restarts, stopping }
const running = new Map();

// 每条隧道环形日志缓冲（最后 2000 行）
const LOG_MAX = 2000;
const logBuf = new Map(); // tunnelId -> [{ ts, line }]
const globalLog = [];

function pushLog(tunnelId, line) {
  const item = { ts: new Date().toISOString(), line: String(line).replace(/\s+$/, '') };
  if (!logBuf.has(tunnelId)) logBuf.set(tunnelId, []);
  const arr = logBuf.get(tunnelId);
  arr.push(item);
  if (arr.length > LOG_MAX) arr.splice(0, arr.length - LOG_MAX);
  globalLog.push({ ...item, tunnelId });
  if (globalLog.length > LOG_MAX) globalLog.splice(0, globalLog.length - LOG_MAX);
}

// ---------- cloudflared 可用性 ----------

function cloudflaredAvailable() {
  return new Promise((resolve) => {
    let done = false;
    const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
    try {
      const p = spawn(CLOUDFLARED, ['--version'], { stdio: 'ignore' });
      p.on('error', () => finish(false));
      p.on('exit', () => finish(true));
      setTimeout(() => finish(false), 5000);
    } catch (_) { finish(false); }
  });
}

// ---------- 启停 ----------

function isRunning(tunnelId) {
  const r = running.get(tunnelId);
  return !!(r && r.proc && !r.proc.killed && r.proc.exitCode === null);
}

async function startTunnel(tunnelId) {
  const tunnel = store.findTunnel(tunnelId);
  if (!tunnel) throw new Error('隧道不存在');
  if (isRunning(tunnelId)) return { alreadyRunning: true };

  if (!(await cloudflaredAvailable())) {
    throw new Error('未找到 cloudflared 可执行文件。Docker 镜像内已内置；本机运行请安装 cloudflared 或设置 CLOUDFLARED_PATH');
  }

  // 从 CF 拉取该隧道的运行 Token
  const token = await cfd.getTunnelToken(tunnel.cfId);

  const cfg = store.getConfig();
  // 注意参数位置：--edge-ip-version 定义在 tunnel 命令层（run 子命令不识别），
  // 必须放在 run 之前；--protocol 则两种位置都合法。合法值: auto/4/6
  const args = ['tunnel', '--no-autoupdate'];
  if (cfg.edgeIpVersion === '4' || cfg.edgeIpVersion === '6') args.push('--edge-ip-version', cfg.edgeIpVersion);
  args.push('run');
  if (cfg.protocol === 'quic' || cfg.protocol === 'http2') args.push('--protocol', cfg.protocol);
  args.push('--token', token);

  const proc = spawn(CLOUDFLARED, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const entry = { proc, startedAt: Date.now(), restarts: 0, stopping: false };
  running.set(tunnelId, entry);
  pushLog(tunnelId, `[manager] 正在连接隧道「${tunnel.name}」(${tunnel.cfId}) ...`);

  const onData = (buf) => {
    for (const line of buf.toString().split('\n')) {
      if (line.trim()) pushLog(tunnelId, line);
    }
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);

  proc.on('exit', (code, signal) => {
    const e = running.get(tunnelId);
    running.delete(tunnelId);
    const t = store.findTunnel(tunnelId);
    const name = t ? t.name : tunnelId;
    if (e && e.stopping) {
      pushLog(tunnelId, `[manager] 隧道「${name}」已断开。`);
      return;
    }
    // 从最近的日志中捞出真正的错误行（cloudflared 参数错误时会打印大段 help，淹没关键信息）
    const recent = logBuf.get(tunnelId) || [];
    const errLine = [...recent].reverse().find(l =>
      /incorrect usage|invalid|illegal|cannot|failed|error:/i.test(l.line) && !l.line.includes('ERR_CONNECTION') );
    if (errLine) pushLog(tunnelId, `[manager] ⚠️ 错误原因: ${errLine.line}`);
    // 异常退出：指数退避自动重启（1s/2s/4s... 最多 60s）
    if (t && t.autostart !== false) {
      const delay = Math.min(60000, 1000 * Math.pow(2, Math.min(e ? e.restarts : 0, 6)));
      e && (e.restarts = (e.restarts || 0) + 1);
      pushLog(tunnelId, `[manager] 隧道「${name}」异常退出(code=${code} signal=${signal})，${delay / 1000}s 后自动重连...`);
      setTimeout(() => { startTunnel(tunnelId).catch(err => pushLog(tunnelId, `[manager] 重连失败: ${err.message}`)); }, delay);
    } else {
      pushLog(tunnelId, `[manager] 隧道「${name}」进程已退出(code=${code})。`);
    }
  });

  return { started: true };
}

function stopTunnel(tunnelId) {
  const entry = running.get(tunnelId);
  if (!entry) return { notRunning: true };
  entry.stopping = true;
  try { entry.proc.kill('SIGTERM'); } catch (_) { /* ignore */ }
  // 兜底强杀
  setTimeout(() => {
    try { if (entry.proc.exitCode === null) entry.proc.kill('SIGKILL'); } catch (_) { /* ignore */ }
  }, 5000);
  return { stopped: true };
}

// 开机自启：把标记为 autostart 的隧道全部拉起（容器重启即"开机自启"）
async function autostartAll() {
  const tunnels = store.getTunnels();
  const results = [];
  for (const t of tunnels) {
    if (t.autostart === false) continue;
    try {
      await startTunnel(t.id);
      results.push({ name: t.name, ok: true });
    } catch (e) {
      pushLog(t.id, `[manager] 自启失败: ${e.message}`);
      results.push({ name: t.name, ok: false, error: e.message });
    }
  }
  return results;
}

// ---------- 状态聚合 ----------

function localStatus() {
  const out = {};
  for (const [id, e] of running) {
    out[id] = {
      running: true,
      startedAt: e.startedAt,
      uptimeSec: Math.floor((Date.now() - e.startedAt) / 1000),
      pid: e.proc.pid,
    };
  }
  return out;
}

// 云端健康状态 + 本地进程状态合并
// defined=true 表示本机创建/管理的隧道（绑定本设备）；未 defined 的是同一 CF 账号下
// 其他设备面板创建的隧道，本机只读展示（不可连接/删除）。
async function fullStatus() {
  const cfg = store.getConfig();
  if (!cfg.apiToken || !cfg.accountId) return { configured: false, tunnels: [] };
  const cfTunnels = await cfd.listTunnels(); // [{id,name,status,connections,...}]
  const local = localStatus();
  const defined = store.getTunnels();

  const tunnels = cfTunnels.map(t => {
    // 本地进程表以内部 id（t_xxx）为 key，需先由 cfId 映射到内部 id 再查在线状态
    const def = defined.find(x => x.cfId === t.id);
    return {
      cfId: t.id,
      name: t.name,
      cfStatus: t.status, // healthy | degraded | down | inactive
      connections: (t.connections || []).length,
      createdAt: t.created_at,
      online: def ? !!local[def.id] : false,
      local: def ? (local[def.id] || null) : null,
      defined: !!def,
      isLocal: !!def,
      device: def ? (def.hostName || '本机') : null,
      group: def ? (def.group || '') : '',
      owner: def ? (def.owner || '') : '',
      autostart: def ? def.autostart !== false : true,
    };
  });
  // 本地定义了但 CF 已删除的（僵尸）
  for (const t of defined) {
    if (!cfTunnels.find(x => x.id === t.cfId)) {
      tunnels.push({ cfId: t.cfId, name: t.name, cfStatus: 'deleted', connections: 0, createdAt: null, online: !!local[t.id], local: local[t.id] || null, defined: true, isLocal: true, device: t.hostName || '本机', group: t.group || '', owner: t.owner || '', autostart: t.autostart !== false });
    }
  }
  return { configured: true, tunnels, deviceName: os.hostname() };
}

function getLogs(tunnelId) {
  if (tunnelId === 'all') return globalLog;
  return logBuf.get(tunnelId) || [];
}

module.exports = { startTunnel, stopTunnel, isRunning, autostartAll, fullStatus, localStatus, getLogs, cloudflaredAvailable, pushLog };
