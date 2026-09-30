/**
 * server.js - 主入口
 * 19090 Web 面板（静态 + 内部 API，多用户：首个注册者为管理员，后续注册需审核）
 * 19092 外部 RESTful API（X-API-Key）
 * 19093 MCP 服务（X-API-Key）
 */
const express = require('express');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const tunnelMgr = require('./tunnels');
const cfd = require('./cloudflare');
const external = require('./external');
const mcp = require('./mcp');
const update = require('./update');

const WEB_PORT = parseInt(process.env.WEB_PORT || '19090');
const API_PORT = parseInt(process.env.API_PORT || '19092');
const MCP_PORT = parseInt(process.env.MCP_PORT || '19093');
const STARTED_AT = new Date().toISOString();

const app = express();
app.use(express.json());

// ================= 站点名称 & 防搜索引擎收录 =================
const DEFAULT_SITE_NAME = 'Cloudflare Tunnel 管理面板';

function siteName() {
  const n = (store.getConfig().siteName || '').trim();
  return n || DEFAULT_SITE_NAME;
}
function noIndexOn() { return store.getConfig().noIndex !== false; }

// 所有响应都带 noindex 头（比 robots.txt 更硬：即使被抓到也不会被收录）
app.use((req, res, next) => {
  if (noIndexOn()) res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive, nosnippet, noimageindex, notranslate');
  next();
});

// 爬虫协议：默认全站禁止抓取
app.get('/robots.txt', (req, res) => {
  res.type('text/plain');
  if (noIndexOn()) return res.send('User-agent: *\nDisallow: /\n');
  res.send('User-agent: *\nDisallow: /api/\n');
});

// ================= 用户与会话 =================
// sessions: sid -> { username, exp }；'__master' 为紧急管理密码（ADMIN_PASSWORD）登录的虚拟管理员
// 会话持久化到 data/sessions.json —— 面板内更新会重启进程，持久化后无需重新登录
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const SESS_FILE = path.join(store.DATA_DIR, 'sessions.json');
const sessions = new Map();

(function loadSessions() {
  try {
    if (!fs.existsSync(SESS_FILE)) return;
    const obj = JSON.parse(fs.readFileSync(SESS_FILE, 'utf8'));
    const now = Date.now();
    for (const [sid, v] of Object.entries(obj)) {
      if (v && v.username && v.exp > now) sessions.set(sid, v);
    }
  } catch (e) { console.error('[session] 读取会话失败，忽略:', e.message); }
})();

function saveSessions() {
  try {
    const obj = {};
    for (const [sid, v] of sessions) obj[sid] = v;
    fs.writeFileSync(SESS_FILE, JSON.stringify(obj));
  } catch (e) { console.error('[session] 写入会话失败:', e.message); }
}

function newSalt() { return crypto.randomBytes(16).toString('hex'); }
function hashPassword(pwd, salt) { return crypto.scryptSync(String(pwd), salt, 32).toString('hex'); }
function newSid() { return crypto.randomBytes(24).toString('hex'); }

function issueSession(res, username) {
  const sid = newSid();
  sessions.set(sid, { username, exp: Date.now() + SESSION_TTL });
  saveSessions();
  res.setHeader('Set-Cookie', `session=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
}

function sessionOf(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)session=([a-f0-9]+)/);
  return m ? m[1] : null;
}

function currentUser(req) {
  const sid = sessionOf(req);
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s || !s.username) return null;
  if (s.exp && s.exp < Date.now()) { sessions.delete(sid); saveSessions(); return null; }
  const username = s.username;
  if (username === '__master') return { id: '__master', username: 'master', role: 'admin', status: 'approved' };
  const u = store.getUsers().find(x => x.username === username);
  if (!u || u.status !== 'approved') return null; // 待审核/禁用立即失效
  return u;
}

function requireAuth(req, res, next) {
  if (!currentUser(req)) return res.status(401).json({ success: false, error: '未登录' });
  next();
}
function requireAdmin(req, res, next) {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ success: false, error: '未登录' });
  if (u.role !== 'admin') return res.status(403).json({ success: false, error: '需要管理员权限' });
  next();
}

function validateUser(username, password) {
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(username || '')) return '用户名仅限字母/数字/下划线，2-32 位';
  if (!password || String(password).length < 6) return '密码至少 6 位';
  return null;
}

// ---- 免认证路由 ----

app.get('/api/auth/state', (req, res) => {
  const users = store.getUsers();
  const u = currentUser(req);
  res.json({
    success: true,
    data: {
      needsSetup: users.length === 0,
      regOpen: store.getConfig().regOpen !== false,
      loggedIn: !!u,
      me: u ? { username: u.username, role: u.role } : null,
      siteName: siteName(), // 登录页也要显示站点名
    },
  });
});

// 首次使用：创建管理员
app.post('/api/setup', (req, res) => {
  if (store.getUsers().length) return res.status(400).json({ success: false, error: '管理员已存在，请直接登录' });
  const { username, password } = req.body || {};
  const err = validateUser(username, password);
  if (err) return res.status(400).json({ success: false, error: err });
  const users = store.getUsers();
  const salt = newSalt();
  users.push({ id: 'u_' + crypto.randomUUID(), username, passSalt: salt, passHash: hashPassword(password, salt), role: 'admin', status: 'approved', createdAt: new Date().toISOString() });
  store.saveUsers(users);
  issueSession(res, username);
  res.json({ success: true });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  const cfg = store.getConfig();
  const u = store.getUsers().find(x => x.username === username);
  if (u) {
    if (u.status === 'pending') return res.status(403).json({ success: false, error: '账号待管理员审核，请稍后再试' });
    if (u.status === 'disabled') return res.status(403).json({ success: false, error: '账号已被禁用，请联系管理员' });
    if (hashPassword(password, u.passSalt) !== u.passHash) return res.status(401).json({ success: false, error: '用户名或密码错误' });
    issueSession(res, u.username);
    return res.json({ success: true });
  }
  // 紧急通道：配置/环境变量中的管理密码（用 master/admin 或留空用户名登录）
  if (cfg.adminPassword && password === cfg.adminPassword && (!username || username === 'master' || username === 'admin')) {
    issueSession(res, '__master');
    return res.json({ success: true, master: true });
  }
  res.status(401).json({ success: false, error: '用户名或密码错误' });
});

app.post('/api/register', (req, res) => {
  const { username, password } = req.body || {};
  const err = validateUser(username, password);
  if (err) return res.status(400).json({ success: false, error: err });
  const users = store.getUsers();
  if (!users.length) return res.status(400).json({ success: false, error: '请先创建管理员账户' });
  if (users.some(x => x.username === username)) return res.status(400).json({ success: false, error: '用户名已存在' });
  if (store.getConfig().regOpen === false) return res.status(403).json({ success: false, error: '注册已关闭，请联系管理员开通' });
  const salt = newSalt();
  users.push({ id: 'u_' + crypto.randomUUID(), username, passSalt: salt, passHash: hashPassword(password, salt), role: 'user', status: 'pending', createdAt: new Date().toISOString() });
  store.saveUsers(users);
  res.json({ success: true, message: '注册成功，等待管理员审核后即可登录' });
});

app.post('/api/logout', (req, res) => {
  const sid = sessionOf(req);
  if (sid) { sessions.delete(sid); saveSessions(); }
  res.setHeader('Set-Cookie', 'session=; Path=/; Max-Age=0');
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  const u = currentUser(req);
  res.json({ success: true, data: { username: u.username, role: u.role } });
});

// ---- 以下全部需要登录 ----
app.use('/api', (req, res, next) => {
  if (['/login', '/register', '/setup', '/auth/state', '/logout'].includes(req.path)) return next();
  requireAuth(req, res, next);
});

// ---- 用户管理（管理员） ----

function sanitizeUser(u) { return { id: u.id, username: u.username, role: u.role, status: u.status, createdAt: u.createdAt, remark: u.remark || '' }; }

app.get('/api/users', requireAdmin, (req, res) => {
  res.json({ success: true, data: store.getUsers().map(sanitizeUser) });
});

// 备注（仅管理员可见，不影响用户本身）
app.patch('/api/users/:id/remark', requireAdmin, (req, res) => {
  const users = store.getUsers();
  const u = users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ success: false, error: '用户不存在' });
  u.remark = String((req.body || {}).remark || '').trim().slice(0, 64);
  store.saveUsers(users);
  res.json({ success: true, data: { remark: u.remark } });
});

// 管理员直接添加（免审核）
app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role } = req.body || {};
  const err = validateUser(username, password);
  if (err) return res.status(400).json({ success: false, error: err });
  const users = store.getUsers();
  if (users.some(x => x.username === username)) return res.status(400).json({ success: false, error: '用户名已存在' });
  const salt = newSalt();
  users.push({ id: 'u_' + crypto.randomUUID(), username, passSalt: salt, passHash: hashPassword(password, salt), role: role === 'admin' ? 'admin' : 'user', status: 'approved', createdAt: new Date().toISOString() });
  store.saveUsers(users);
  res.json({ success: true });
});

app.post('/api/users/:id/approve', requireAdmin, (req, res) => {
  const users = store.getUsers();
  const u = users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ success: false, error: '用户不存在' });
  u.status = 'approved';
  store.saveUsers(users);
  res.json({ success: true });
});

app.post('/api/users/:id/disable', requireAdmin, (req, res) => {
  const users = store.getUsers();
  const u = users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ success: false, error: '用户不存在' });
  if (u.username === currentUser(req).username) return res.status(400).json({ success: false, error: '不能禁用自己' });
  u.status = 'disabled';
  store.saveUsers(users);
  res.json({ success: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const users = store.getUsers();
  const u = users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ success: false, error: '用户不存在' });
  if (u.username === currentUser(req).username) return res.status(400).json({ success: false, error: '不能删除自己' });
  store.saveUsers(users.filter(x => x.id !== u.id));
  res.json({ success: true });
});

app.post('/api/users/:id/password', requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || String(password).length < 6) return res.status(400).json({ success: false, error: '密码至少 6 位' });
  const users = store.getUsers();
  const u = users.find(x => x.id === req.params.id);
  if (!u) return res.status(404).json({ success: false, error: '用户不存在' });
  u.passSalt = newSalt();
  u.passHash = hashPassword(password, u.passSalt);
  store.saveUsers(users);
  res.json({ success: true });
});

// 注册开关
app.post('/api/config/regopen', requireAdmin, (req, res) => {
  store.updateConfig({ regOpen: !!(req.body && req.body.open) });
  res.json({ success: true });
});

// ================= 系统配置 =================

app.get('/api/config', (req, res) => {
  const cfg = store.getConfig();
  res.json({ success: true, data: { accountId: cfg.accountId, protocol: cfg.protocol, edgeIpVersion: cfg.edgeIpVersion, hasToken: !!cfg.apiToken, defaultDomain: cfg.defaultDomain || '', deviceName: cfg.deviceName || '', gitMirror: cfg.gitMirror || '', gitProxy: cfg.gitProxy || '', siteName: cfg.siteName || '', noIndex: cfg.noIndex !== false } });
});

app.post('/api/config', requireAdmin, async (req, res) => {
  try {
    const { accountId, apiToken, protocol, edgeIpVersion, defaultDomain } = req.body || {};
    if (accountId !== undefined || apiToken !== undefined) {
      const cfg = store.getConfig();
      const aid = accountId !== undefined ? accountId.trim() : cfg.accountId;
      const tok = apiToken !== undefined && apiToken !== '' ? apiToken.trim() : cfg.apiToken;
      await cfd.testCredentials(aid, tok); // 先测试再保存
      store.updateConfig({ accountId: aid, apiToken: tok });
    }
    const patch = {};
    if (['quic', 'http2'].includes(protocol)) patch.protocol = protocol;
    if (['4', '6', 'auto'].includes(edgeIpVersion)) patch.edgeIpVersion = edgeIpVersion;
    if (typeof defaultDomain === 'string') patch.defaultDomain = defaultDomain.trim();
    if (typeof (req.body || {}).deviceName === 'string') patch.deviceName = req.body.deviceName.trim().slice(0, 32); // 本设备自定义显示名
    // 站点名称（留空 = 恢复默认）与防收录开关
    if (typeof (req.body || {}).siteName === 'string') patch.siteName = req.body.siteName.trim().replace(/[<>]/g, '').slice(0, 32);
    if (typeof (req.body || {}).noIndex === 'boolean') patch.noIndex = req.body.noIndex;
    // 面板内更新的更新源配置（拉取慢/失败时使用）
    if (typeof (req.body || {}).gitMirror === 'string') patch.gitMirror = req.body.gitMirror.trim().slice(0, 200);
    if (typeof (req.body || {}).gitProxy === 'string') patch.gitProxy = req.body.gitProxy.trim().slice(0, 200);
    store.updateConfig(patch);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

app.post('/api/config/test', async (req, res) => {
  try {
    const { accountId, apiToken } = req.body || {};
    await cfd.testCredentials((accountId || '').trim(), (apiToken || '').trim());
    res.json({ success: true });
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// 可选的默认域名列表（Cloudflare 托管的 zones）
app.get('/api/zones', async (req, res) => {
  try {
    const zones = await cfd.listZones();
    res.json({ success: true, data: zones.map(z => z.name) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ================= 隧道管理 =================

// 归属校验：管理员可管理全部本机隧道；普通用户仅能操作自己创建的隧道
// 返回本机隧道定义记录（不存在 = 其他设备创建的隧道，本机只读）
function tunnelGuard(req, res, { needManage = true } = {}) {
  const t = store.findTunnel(req.params.id);
  if (!t) return null; // 调用方处理：可能是远端隧道
  const u = currentUser(req);
  if (needManage && u.role !== 'admin' && t.owner && t.owner !== u.username) {
    res.status(403).json({ success: false, error: '只能操作自己创建的隧道' });
    return false;
  }
  return t;
}

app.get('/api/tunnels', async (req, res) => {
  try {
    const s = await tunnelMgr.fullStatus();
    const u = currentUser(req);
    // 普通用户数据隔离：只能看到自己创建的隧道（其他设备隧道/他人隧道一律隐藏）
    if (u.role !== 'admin') s.tunnels = s.tunnels.filter(t => t.isLocal && t.owner === u.username);
    res.json({ success: true, data: s });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/tunnels', async (req, res) => {
  try {
    const u = currentUser(req);
    const name = (req.body.name || '').trim();
    const group = (req.body.group || '').trim().slice(0, 32);
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(name)) return res.status(400).json({ success: false, error: '名称仅限字母/数字/连字符，最长 64 位' });
    const cfT = await cfd.createTunnel(name);
    const tunnels = store.getTunnels();
    const rec = {
      id: 't_' + crypto.randomUUID(), cfId: cfT.id, name,
      group, owner: u.username, hostName: os.hostname(),
      autostart: true, createdAt: new Date().toISOString(),
    };
    tunnels.push(rec);
    store.saveTunnels(tunnels);
    res.json({ success: true, data: rec });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 批量重命名分组（管理员）：该组所有隧道一起改
app.post('/api/tunnels/groups/rename', requireAdmin, (req, res) => {
  const from = ((req.body || {}).from || '').trim();
  const to = ((req.body || {}).to || '').trim().slice(0, 32);
  if (!from) return res.status(400).json({ success: false, error: '缺少原分组名' });
  const tunnels = store.getTunnels();
  let n = 0;
  for (const t of tunnels) {
    const cur = t.group || '';
    if (cur === from && cur !== to) { t.group = to; n++; }
  }
  if (n) store.saveTunnels(tunnels);
  res.json({ success: true, data: { renamed: n } });
});

// 修改分组（管理员或创建者）
app.patch('/api/tunnels/:id/meta', (req, res) => {
  const t = tunnelGuard(req, res);
  if (!t) return res.status(404).json({ success: false, error: '隧道不存在（其他设备创建的隧道无法在本机修改）' });
  if (typeof (req.body || {}).group === 'string') t.group = req.body.group.trim().slice(0, 32);
  store.saveTunnels(store.getTunnels());
  res.json({ success: true, data: { group: t.group } });
});

app.delete('/api/tunnels/:id', async (req, res) => {
  try {
    const t = tunnelGuard(req, res);
    if (!t) return res.status(404).json({ success: false, error: '隧道不存在（其他设备创建的隧道无法在本机删除）' });
    tunnelMgr.stopTunnel(t.id);
    await cfd.deleteTunnel(t.cfId);
    store.saveTunnels(store.getTunnels().filter(x => x.id !== t.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 连接/断开/自启：只能操作本机隧道（进程跑在本机）
app.post('/api/tunnels/:id/connect', async (req, res) => {
  try {
    const t = tunnelGuard(req, res);
    if (!t) return res.status(400).json({ success: false, error: '该隧道由其他设备管理，请到对应设备的面板连接' });
    res.json({ success: true, data: await tunnelMgr.startTunnel(t.id) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/tunnels/:id/disconnect', (req, res) => {
  const t = tunnelGuard(req, res);
  if (!t) return res.status(400).json({ success: false, error: '该隧道由其他设备管理' });
  res.json({ success: true, data: tunnelMgr.stopTunnel(t.id) });
});

app.post('/api/tunnels/:id/autostart', (req, res) => {
  const t = tunnelGuard(req, res);
  if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
  t.autostart = !!(req.body && req.body.autostart);
  store.saveTunnels(store.getTunnels());
  res.json({ success: true, data: { autostart: t.autostart } });
});

// ---- 转发规则 ----

app.get('/api/tunnels/:id/rules', async (req, res) => {
  try {
    // 管理员可查看任意隧道（含其他设备创建的，按 cfId 查）；普通用户仅限自己创建的
    const u = currentUser(req);
    const t = store.findTunnel(req.params.id);
    if (u.role !== 'admin') {
      if (!t || t.owner !== u.username) return res.status(404).json({ success: false, error: '隧道不存在' });
    }
    const cfId = t ? t.cfId : req.params.id;
    const conf = await cfd.getTunnelConfig(cfId);
    res.json({ success: true, data: { ingress: ((conf.config && conf.config.ingress) || []), tunnel: { id: t ? t.id : cfId, name: t ? t.name : cfId } } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/tunnels/:id/rules', async (req, res) => {
  try {
    const t = tunnelGuard(req, res);
    if (!t) return res.status(400).json({ success: false, error: '其他设备创建的隧道，规则请在对应设备上配置' });
    const { hostname, service, noTLSVerify, originServerName } = req.body || {};
    if (!hostname || !service) return res.status(400).json({ success: false, error: '域名与服务地址必填' });
    const dns = await cfd.ensureCname(hostname, t.cfId);
    const conf = await cfd.getTunnelConfig(t.cfId);
    const rules = ((conf.config && conf.config.ingress) || []).filter(r => r.hostname);
    rules.push({ hostname, service, ...(noTLSVerify ? { noTLSVerify: true } : {}), ...(originServerName ? { originServerName } : {}) });
    await cfd.putTunnelConfig(t.cfId, rules, 'http_status:404');
    res.json({ success: true, data: { dns, rules } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/tunnels/:id/rules/:index', async (req, res) => {
  try {
    const t = tunnelGuard(req, res);
    if (!t) return res.status(400).json({ success: false, error: '其他设备创建的隧道，规则请在对应设备上配置' });
    const idx = parseInt(req.params.index);
    const conf = await cfd.getTunnelConfig(t.cfId);
    const rules = ((conf.config && conf.config.ingress) || []).filter(r => r.hostname);
    if (!(idx >= 0 && idx < rules.length)) return res.status(400).json({ success: false, error: '规则序号无效' });
    const removed = rules.splice(idx, 1)[0];
    try { await cfd.removeCname(removed.hostname, t.cfId); } catch (_) { /* DNS 清理失败不阻塞 */ }
    await cfd.putTunnelConfig(t.cfId, rules, 'http_status:404');
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// ---- 运行日志 ----

app.get('/api/logs', (req, res) => {
  res.json({ success: true, data: tunnelMgr.getLogs(req.query.tunnel || 'all').slice(-500) });
});

// ---- API 凭证（管理员） ----

app.get('/api/creds', requireAdmin, (req, res) => res.json({ success: true, data: external.listCreds() }));
app.post('/api/creds', requireAdmin, (req, res) => {
  const cred = external.createCred((req.body && req.body.name) || '');
  res.json({ success: true, data: cred });
});
app.delete('/api/creds/:id', requireAdmin, (req, res) => {
  external.deleteCred(req.params.id);
  res.json({ success: true });
});

// ---- 系统信息 ----

app.get('/api/system', (req, res) => {
  const u = currentUser(req);
  const admin = !!u && u.role === 'admin';
  res.json({
    success: true,
    data: {
      version: update.getVersion(),
      commit: process.env.GIT_COMMIT || '',
      platform: process.platform,
      node: process.version,
      uptimeSec: Math.floor(process.uptime()),
      startedAt: STARTED_AT,
      dataDir: store.DATA_DIR,
      appDir: update.APP_DIR,
      apiPort: API_PORT,
      mcpPort: MCP_PORT,
      siteName: siteName(),
      siteNameDefault: DEFAULT_SITE_NAME,
      noIndex: noIndexOn(),
      update: admin ? update.cacheSummary() : null, // 有新版时前端显示提示（仅管理员）
    },
  });
});

// ---- 面板内更新（仅管理员） ----

// 更新状态（不主动联网，读缓存 + 本地 git 信息）
app.get('/api/update/status', requireAdmin, async (req, res) => {
  try { res.json({ success: true, data: await update.getStatus() }); }
  catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 检测更新（会向更新源 fetch，可能较慢）
app.post('/api/update/check', requireAdmin, async (req, res) => {
  try {
    await update.check();
    res.json({ success: true, data: await update.getStatus() });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 执行更新（需人工确认；成功后自动重启面板加载新版本）
app.post('/api/update/apply', requireAdmin, async (req, res) => {
  try {
    const r = await update.apply();
    res.json({ success: true, data: r });
    if (r.updated) update.scheduleRestart(r.restartInMs || 1500);
  } catch (e) { res.status(400).json({ success: false, error: e.message }); }
});

// ---------- 静态前端 ----------

const PUB = path.join(__dirname, '..', 'public');
app.use(express.static(PUB));
app.get(/^(?!\/api\/).*/, (req, res) => res.sendFile(path.join(PUB, 'index.html')));

// ---------- 启动三个服务 ----------

app.listen(WEB_PORT, () => console.log(`[web] 管理面板: http://0.0.0.0:${WEB_PORT}`));

external.createExternalApi().listen(API_PORT, () => console.log(`[api] 外部 API: http://0.0.0.0:${API_PORT}/api/v1`));
mcp.createMcpServer().listen(MCP_PORT, () => console.log(`[mcp] MCP 服务: http://0.0.0.0:${MCP_PORT}/mcp`));

// 启动后自动拉起自启隧道
setTimeout(async () => {
  try {
    const results = await tunnelMgr.autostartAll();
    for (const r of results) console.log(`[autostart] ${r.name}: ${r.ok ? 'OK' : r.error}`);
  } catch (e) {
    console.log('[autostart] 跳过:', e.message);
  }
}, 1500);
