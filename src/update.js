/**
 * update.js - 面板内「检测更新 / 一键更新」
 *
 * 原理：项目源码以卷的方式挂载进容器（compose 中 `./:/app`），
 *       更新 = `git fetch` + `git reset --hard <目标提交>`，
 *       随后进程退出，由 Docker（restart: unless-stopped）自动拉起容器加载新代码。
 *       数据目录 /data 不在 git 中，更新不影响凭据、用户与隧道配置。
 *
 * 环境变量：
 *   APP_DIR     源码目录（默认镜像内 /app，挂载后即宿主机项目目录）
 *   GIT_BRANCH  跟踪分支（默认 main）
 */
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const store = require('./store');

const APP_DIR = process.env.APP_DIR || path.join(__dirname, '..');
const BRANCH = process.env.GIT_BRANCH || 'main';
const LOG_FILE = path.join(store.DATA_DIR, 'update.log');
const FETCH_TIMEOUT = 180000; // 国内直连 GitHub 可能较慢

const state = {
  phase: 'idle',      // idle | running | restarting | error
  startedAt: null,
  from: null,
  to: null,
  error: null,
};

// ---------- 基础工具 ----------

/** 读取当前代码版本（package.json） */
function getVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(APP_DIR, 'package.json'), 'utf8')).version || '0.0.0';
  } catch (_) { return '0.0.0'; }
}

function writeLog(line) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  try {
    fs.appendFileSync(LOG_FILE, `[${ts}] ${line}\n`);
    // 简单轮转：超过 128KB 只保留最后 200 行
    const st = fs.statSync(LOG_FILE);
    if (st.size > 131072) {
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
      fs.writeFileSync(LOG_FILE, lines.slice(-200).join('\n'));
    }
  } catch (_) { /* 日志写失败不影响主流程 */ }
}

function tailLog(n = 40) {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    return fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean).slice(-n);
  } catch (_) { return []; }
}

/** 执行 git 子命令（execFile，不经 shell，参数不会被注入） */
function git(args, timeout = 30000) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd: APP_DIR,
      timeout,
      maxBuffer: 8 * 1024 * 1024,
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', LC_ALL: 'C' },
    }, (err, stdout, stderr) => {
      const out = String(stdout || '').trim();
      const errOut = String(stderr || '').trim();
      if (err) {
        let msg = errOut || String(err.message || 'git 执行失败');
        if (err.killed) msg = `命令超时（>${Math.round(timeout / 1000)}s）`;
        else if (/ENOENT/.test(String(err.message))) msg = '未找到 git 命令';
        resolve({ ok: false, out, err: msg });
      } else {
        resolve({ ok: true, out, err: errOut });
      }
    });
  });
}

function parseHead(raw) {
  const [hash = '', short = '', subject = '', date = ''] = String(raw).split('\x1f');
  return { hash, short, subject, date };
}

async function head() {
  const r = await git(['log', '-1', '--pretty=format:%H%x1f%h%x1f%s%x1f%cI'], 15000);
  if (!r.ok) return { hash: '', short: '', subject: '', date: '' };
  return parseHead(r.out);
}

/** 已跟踪文件的本地改动数量（未跟踪文件如 data/ 不计入） */
async function localChanges() {
  const r = await git(['status', '--porcelain', '--untracked-files=no'], 20000);
  return r.ok && r.out ? r.out.split('\n').filter(Boolean).length : 0;
}

/** 仓库可用性 */
async function repoInfo() {
  if (!fs.existsSync(path.join(APP_DIR, '.git'))) {
    return {
      supported: false,
      appDir: APP_DIR,
      reason: `未检测到 Git 仓库（${APP_DIR}/.git 不存在）。面板内更新需要「源码挂载」方式部署（docker-compose.yml 中挂载 ./:/app），可先用命令更新一次：bash update.sh`,
    };
  }
  const gv = await git(['--version'], 8000);
  if (!gv.ok) {
    return { supported: false, appDir: APP_DIR, reason: '容器内未安装 git，请先执行一次 docker compose up -d --build 重建镜像后再试。' };
  }
  const rm = await git(['remote', 'get-url', 'origin'], 8000);
  const br = await git(['rev-parse', '--abbrev-ref', 'HEAD'], 8000);
  const h = await head();
  return {
    supported: true,
    appDir: APP_DIR,
    remote: rm.ok ? rm.out : '',
    branch: (br.ok && br.out && br.out !== 'HEAD') ? br.out : BRANCH,
    current: h,
    version: getVersion(),
  };
}

/** 代理 / 加速前缀参数 */
function proxyArgs(cfg) {
  const a = [];
  const proxy = String(cfg.gitProxy || '').trim();
  if (proxy) a.push('-c', `http.proxy=${proxy}`, '-c', `https.proxy=${proxy}`);
  return a;
}
function fetchUrlOf(remote, mirror) {
  const m = String(mirror || '').trim();
  if (!m) return remote;
  return (m.endsWith('/') ? m : m + '/') + remote;
}

// ---------- 检测更新 ----------

/**
 * 检测是否有新版本（会真的向更新源 fetch，耗时取决于网络）
 * @returns {Promise<object>} 统一的检测结果对象
 */
async function check() {
  const info = await repoInfo();
  const checkedAt = new Date().toISOString();
  if (!info.supported) return { ...info, checkedAt };
  if (!info.remote) return { ...info, checkedAt, error: '未配置 git 远端（origin），无法检测更新。' };

  const cfg = store.getConfig();
  const url = fetchUrlOf(info.remote, cfg.gitMirror);
  writeLog(`[check] fetch ${url} (${info.branch})`);
  const f = await git([...proxyArgs(cfg), 'fetch', '--quiet', '--force', url, info.branch], FETCH_TIMEOUT);
  if (!f.ok) {
    const error = `连接更新源失败：${f.err}`;
    writeLog(`[check] ${error}`);
    const result = { ...info, checkedAt, fetchFailed: true, error };
    saveCache(result);
    return result;
  }

  const cnt = await git(['rev-list', '--count', 'HEAD..FETCH_HEAD'], 15000);
  const behind = cnt.ok ? (parseInt(cnt.out || '0', 10) || 0) : 0;
  let commits = [];
  if (behind) {
    const lg = await git(['log', '--oneline', '--no-decorate', '-n', '30', 'HEAD..FETCH_HEAD'], 15000);
    commits = lg.ok ? lg.out.split('\n').filter(Boolean) : [];
  }
  let latest = null;
  let latestVersion = '';
  if (behind) {
    const l = await git(['log', '-1', '--pretty=format:%H%x1f%h%x1f%s%x1f%cI', 'FETCH_HEAD'], 15000);
    if (l.ok) latest = parseHead(l.out);
    const pkg = await git(['show', 'FETCH_HEAD:package.json'], 15000);
    if (pkg.ok) { try { latestVersion = JSON.parse(pkg.out).version || ''; } catch (_) { /* 忽略 */ } }
  }

  const result = {
    supported: true,
    appDir: info.appDir,
    remote: info.remote,
    branch: info.branch,
    current: info.current,
    version: info.version,
    hasUpdate: behind > 0,
    behind,
    commits,
    latest,
    latestVersion,
    localChanges: await localChanges(),
    checkedAt,
    error: '',
  };
  saveCache(result);
  writeLog(`[check] 当前 ${info.current.short}，落后 ${behind} 个提交${behind ? `，最新 ${latestVersion || (latest && latest.short)}` : ''}`);
  return result;
}

function saveCache(r) {
  store.updateConfig({
    updateCache: {
      checkedAt: r.checkedAt,
      hasUpdate: !!r.hasUpdate,
      behind: r.behind || 0,
      commits: (r.commits || []).slice(0, 10),
      latestVersion: r.latestVersion || '',
      latestShort: r.latest ? r.latest.short : '',
      latestSubject: r.latest ? r.latest.subject : '',
      version: r.version || '',
      error: r.error || '',
      supported: !!r.supported,
    },
  });
}

// ---------- 执行更新 ----------

/**
 * 更新到最新版本：fetch → reset --hard（不触碰 data/）
 * 成功后由调用方调度进程退出，Docker 会自动重启容器加载新代码。
 */
async function apply() {
  if (state.phase === 'running' || state.phase === 'restarting') throw new Error('更新正在进行中，请稍候…');
  const info = await repoInfo();
  if (!info.supported) throw new Error(info.reason);

  state.phase = 'running';
  state.startedAt = new Date().toISOString();
  state.error = null;

  const c = await check();
  if (c.error) { state.phase = 'error'; state.error = c.error; throw new Error(c.error); }
  if (!c.hasUpdate) { state.phase = 'idle'; return { updated: false, message: '已是最新版本，无需更新' }; }

  const target = await git(['rev-parse', 'FETCH_HEAD'], 15000);
  if (!target.ok) { state.phase = 'error'; state.error = '无法解析目标版本'; throw new Error(state.error); }
  const hash = target.out.trim();

  state.from = c.current;
  state.to = { hash, short: hash.slice(0, 7), subject: '', date: '' };

  writeLog(`[update] 开始更新：${c.current.short} → ${hash.slice(0, 7)}（${c.behind} 个提交）`);
  (c.commits || []).slice(0, 12).forEach(l => writeLog(`         ${l}`));
  if (c.localChanges) writeLog(`[update] 注意：本地有 ${c.localChanges} 个已跟踪文件被修改，将被覆盖（data/ 不受影响）`);

  const r = await git(['reset', '--hard', hash], 60000);
  if (!r.ok) {
    state.phase = 'error';
    state.error = `代码更新失败：${r.err}`;
    writeLog(`[update] ${state.error}`);
    throw new Error(state.error);
  }

  const after = await head();
  state.to = after;
  writeLog(`[update] 代码已更新：${after.short} ${after.subject}`);
  writeLog(`[update] 如需回退：git reset --hard ${c.current.hash}`);
  // 刷新检测缓存：刚更新完就不再提示「有新版本」，避免重启后误报
  store.updateConfig({
    updateCache: {
      checkedAt: new Date().toISOString(),
      hasUpdate: false,
      behind: 0,
      commits: [],
      latestVersion: getVersion(),
      latestShort: after.short,
      latestSubject: after.subject,
      version: getVersion(),
      error: '',
      supported: true,
    },
  });
  writeLog('[update] 重启面板以加载新版本…');
  state.phase = 'restarting';
  return { updated: true, from: c.current, to: after, behind: c.behind, restartInMs: 1500 };
}

/** 退出进程，交给 Docker 重启（restart: unless-stopped） */
function scheduleRestart(ms = 1500) {
  setTimeout(() => {
    writeLog('[update] 进程退出，等待 Docker 自动重启容器');
    process.exit(0);
  }, ms).unref?.();
}

// ---------- 状态 ----------

async function getStatus() {
  const info = await repoInfo();
  const cfg = store.getConfig();
  return {
    supported: info.supported,
    reason: info.reason || '',
    appDir: info.appDir || '',
    remote: info.remote || '',
    branch: info.branch || '',
    version: getVersion(),
    current: info.current || null,
    localChanges: info.supported ? await localChanges() : 0,
    phase: state.phase,
    from: state.from,
    to: state.to,
    error: state.error,
    startedAt: state.startedAt,
    sources: { gitMirror: cfg.gitMirror || '', gitProxy: cfg.gitProxy || '' },
    check: cfg.updateCache || null,
    log: tailLog(40),
  };
}

/** 供 /api/system 使用的轻量摘要（不跑 git，避免拖慢首页） */
function cacheSummary() {
  const c = store.getConfig().updateCache;
  if (!c) return null;
  return { hasUpdate: !!c.hasUpdate, behind: c.behind || 0, latestVersion: c.latestVersion || '', checkedAt: c.checkedAt, error: c.error || '' };
}

module.exports = { check, apply, getStatus, getVersion, cacheSummary, scheduleRestart, writeLog, APP_DIR, BRANCH };
