/**
 * server.js - 主入口
 * 19090 Web 面板（静态 + 内部 API）
 * 19092 外部 RESTful API（X-API-Key）
 * 19093 MCP 服务（X-API-Key）
 */
const express = require('express');
const crypto = require('crypto');
const path = require('path');
const store = require('./store');
const tunnelMgr = require('./tunnels');
const cfd = require('./cloudflare');
const external = require('./external');
const mcp = require('./mcp');

const WEB_PORT = parseInt(process.env.WEB_PORT || '19090');
const API_PORT = parseInt(process.env.API_PORT || '19092');
const MCP_PORT = parseInt(process.env.MCP_PORT || '19093');

const app = express();
app.use(express.json());

// ---------- 简易登录认证（可选：设置了管理密码才启用） ----------

const sessions = new Set();

function authed(req) {
  if (!store.getConfig().adminPassword) return true; // 未设置密码 = 免登录（内网使用）
  const token = (req.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    || (req.cookies || '') || '';
  const c = req.headers.cookie || '';
  const m = c.match(/session=([a-f0-9]+)/);
  return sessions.has((m && m[1]) || token);
}

app.post('/api/login', (req, res) => {
  const cfg = store.getConfig();
  if (!cfg.adminPassword) return res.json({ success: true, noAuth: true });
  if (req.body && req.body.password === cfg.adminPassword) {
    const sid = crypto.randomBytes(24).toString('hex');
    sessions.add(sid);
    res.setHeader('Set-Cookie', `session=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`);
    return res.json({ success: true });
  }
  res.status(401).json({ success: false, error: '密码错误' });
});

app.get('/api/auth-required', (req, res) => res.json({ required: !!store.getConfig().adminPassword }));

// ---------- 内部 API ----------

app.use('/api', (req, res, next) => {
  if (req.path === '/login' || req.path === '/auth-required' || authed(req)) return next();
  res.status(401).json({ success: false, error: '未登录' });
});

// 系统配置
app.get('/api/config', (req, res) => {
  const cfg = store.getConfig();
  res.json({ success: true, data: { accountId: cfg.accountId, protocol: cfg.protocol, edgeIpVersion: cfg.edgeIpVersion, hasToken: !!cfg.apiToken } });
});

app.post('/api/config', async (req, res) => {
  try {
    const { accountId, apiToken, protocol, edgeIpVersion } = req.body || {};
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

// 隧道：列表 / 创建 / 删除 / 连接 / 断开 / 自启开关
app.get('/api/tunnels', async (req, res) => {
  try {
    const s = await tunnelMgr.fullStatus();
    res.json({ success: true, data: s });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/tunnels', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    if (!/^[a-zA-Z0-9-]{1,64}$/.test(name)) return res.status(400).json({ success: false, error: '名称仅限字母/数字/连字符，最长 64 位' });
    const cfT = await cfd.createTunnel(name);
    const tunnels = store.getTunnels();
    const rec = { id: 't_' + crypto.randomUUID(), cfId: cfT.id, name, autostart: true, createdAt: new Date().toISOString() };
    tunnels.push(rec);
    store.saveTunnels(tunnels);
    res.json({ success: true, data: rec });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.delete('/api/tunnels/:id', async (req, res) => {
  try {
    const t = store.findTunnel(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
    tunnelMgr.stopTunnel(t.id);
    await cfd.deleteTunnel(t.cfId);
    store.saveTunnels(store.getTunnels().filter(x => x.id !== t.id));
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/tunnels/:id/connect', async (req, res) => {
  try {
    const t = store.findTunnel(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
    res.json({ success: true, data: await tunnelMgr.startTunnel(t.id) });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/tunnels/:id/disconnect', (req, res) => {
  const t = store.findTunnel(req.params.id);
  if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
  res.json({ success: true, data: tunnelMgr.stopTunnel(t.id) });
});

app.post('/api/tunnels/:id/autostart', (req, res) => {
  const t = store.findTunnel(req.params.id);
  if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
  t.autostart = !!(req.body && req.body.autostart);
  store.saveTunnels(store.getTunnels());
  res.json({ success: true, data: { autostart: t.autostart } });
});

// 转发规则
app.get('/api/tunnels/:id/rules', async (req, res) => {
  try {
    const t = store.findTunnel(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
    const conf = await cfd.getTunnelConfig(t.cfId);
    res.json({ success: true, data: { ingress: ((conf.config && conf.config.ingress) || []), tunnel: { id: t.id, name: t.name } } });
  } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/tunnels/:id/rules', async (req, res) => {
  try {
    const t = store.findTunnel(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
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
    const t = store.findTunnel(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
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

// 运行日志
app.get('/api/logs', (req, res) => {
  res.json({ success: true, data: tunnelMgr.getLogs(req.query.tunnel || 'all').slice(-500) });
});

// API 凭证
app.get('/api/creds', (req, res) => res.json({ success: true, data: external.listCreds() }));
app.post('/api/creds', (req, res) => {
  const cred = external.createCred((req.body && req.body.name) || '');
  res.json({ success: true, data: cred });
});
app.delete('/api/creds/:id', (req, res) => {
  external.deleteCred(req.params.id);
  res.json({ success: true });
});

// 系统信息（首页展示）
app.get('/api/system', (req, res) => {
  res.json({
    success: true,
    data: {
      version: '1.0.0',
      platform: process.platform,
      node: process.version,
      cloudflaredAvailable: tunnelMgr.cloudflaredAvailable ? undefined : undefined,
      uptimeSec: Math.floor(process.uptime()),
      dataDir: store.DATA_DIR,
      apiPort: API_PORT,
      mcpPort: MCP_PORT,
    },
  });
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
