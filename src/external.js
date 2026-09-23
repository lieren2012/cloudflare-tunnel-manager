/**
 * external.js - 外部 RESTful API（端口 19092，X-API-Key 鉴权）
 * 供第三方应用 / AI 智能体集成 Tunnel 管理能力。
 */
const express = require('express');
const crypto = require('crypto');
const store = require('./store');
const tunnelMgr = require('./tunnels');
const cfd = require('./cloudflare');

function checkKey(req) {
  const key = req.get('X-API-Key') || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) return false;
  const creds = store.getCreds();
  return creds.some(c => c.key === key);
}

function buildRouter() {
  const router = express.Router();
  router.use((req, res, next) => {
    if (!checkKey(req)) return res.status(401).json({ success: false, error: '无效的 API Key' });
    next();
  });

  // 隧道列表（含健康状态）
  router.get('/tunnels', async (req, res) => {
    try { res.json({ success: true, data: (await tunnelMgr.fullStatus()).tunnels }); }
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/tunnels', async (req, res) => {
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

  router.delete('/tunnels/:id', async (req, res) => {
    try {
      const t = store.findTunnel(req.params.id);
      if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
      tunnelMgr.stopTunnel(t.id);
      await cfd.deleteTunnel(t.cfId);
      store.saveTunnels(store.getTunnels().filter(x => x.id !== t.id));
      res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/tunnels/:id/connect', async (req, res) => {
    try {
      const t = store.findTunnel(req.params.id);
      if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
      res.json({ success: true, data: await tunnelMgr.startTunnel(t.id) });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/tunnels/:id/disconnect', (req, res) => {
    const t = store.findTunnel(req.params.id);
    if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
    res.json({ success: true, data: tunnelMgr.stopTunnel(t.id) });
  });

  // 转发规则
  router.get('/tunnels/:id/rules', async (req, res) => {
    try {
      const t = store.findTunnel(req.params.id);
      if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
      const conf = await cfd.getTunnelConfig(t.cfId);
      res.json({ success: true, data: (conf.config && conf.config.ingress) || [] });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  router.post('/tunnels/:id/rules', async (req, res) => {
    try {
      const t = store.findTunnel(req.params.id);
      if (!t) return res.status(404).json({ success: false, error: '隧道不存在' });
      const { hostname, service, noTLSVerify } = req.body || {};
      if (!hostname || !service) return res.status(400).json({ success: false, error: 'hostname 与 service 必填' });
      const dns = await cfd.ensureCname(hostname, t.cfId);
      const conf = await cfd.getTunnelConfig(t.cfId);
      const ingress = ((conf.config && conf.config.ingress) || []).filter(r => r.service !== 'http_status:404' || r.hostname);
      // 过滤掉 catch-all（无 hostname 的兜底条目）
      const rules = ((conf.config && conf.config.ingress) || []).filter(r => r.hostname);
      rules.push({ hostname, service, ...(noTLSVerify ? { noTLSVerify: true } : {}) });
      await cfd.putTunnelConfig(t.cfId, rules, 'http_status:404');
      res.json({ success: true, data: { dns, rules } });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
  });

  return router;
}

function createExternalApi() {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', buildRouter());
  app.get('/', (req, res) => res.json({
    name: 'CF Tunnel Manager External API',
    version: '1.0.0',
    auth: 'X-API-Key header',
    endpoints: [
      'GET  /api/v1/tunnels',
      'POST /api/v1/tunnels {name}',
      'DELETE /api/v1/tunnels/:id',
      'POST /api/v1/tunnels/:id/connect',
      'POST /api/v1/tunnels/:id/disconnect',
      'GET  /api/v1/tunnels/:id/rules',
      'POST /api/v1/tunnels/:id/rules {hostname, service, noTLSVerify}',
    ],
  }));
  return app;
}

// ---------- API 凭证管理（Web 面板调用） ----------

function listCreds() {
  return store.getCreds().map(c => ({ id: c.id, name: c.name, key: c.key, createdAt: c.createdAt }));
}

function createCred(name) {
  const creds = store.getCreds();
  const cred = { id: 'k_' + crypto.randomUUID(), name: name || '未命名凭证', key: 'cfm_' + crypto.randomBytes(24).toString('hex'), createdAt: new Date().toISOString() };
  creds.push(cred);
  store.saveCreds(creds);
  return cred;
}

function deleteCred(id) {
  store.saveCreds(store.getCreds().filter(c => c.id !== id));
}

module.exports = { createExternalApi, listCreds, createCred, deleteCred };
