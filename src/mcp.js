/**
 * mcp.js - MCP 服务（端口 19093，Streamable HTTP，JSON-RPC 2.0）
 * 鉴权：X-API-Key（与外部 API 凭证共用）
 */
const store = require('./store');
const tunnelMgr = require('./tunnels');
const cfd = require('./cloudflare');

const PROTOCOL_VERSION = '2024-11-05';

function checkKey(req) {
  const key = req.get('X-API-Key') || (req.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key) return false;
  return store.getCreds().some(c => c.key === key);
}

const TOOLS = [
  { name: 'list_tunnels', description: '列出所有 Cloudflare 隧道及其在线/健康状态', inputSchema: { type: 'object', properties: {} } },
  { name: 'create_tunnel', description: '创建一条新隧道', inputSchema: { type: 'object', properties: { name: { type: 'string', description: '隧道名称，字母/数字/连字符' } }, required: ['name'] } },
  { name: 'delete_tunnel', description: '删除隧道（不可恢复）', inputSchema: { type: 'object', properties: { id: { type: 'string', description: '隧道 ID 或 CF ID' } }, required: ['id'] } },
  { name: 'connect_tunnel', description: '连接（上线）指定隧道，支持多隧道同时在线', inputSchema: { type: 'object', properties: { id: { type: 'string', description: '隧道 ID 或 CF ID' } }, required: ['id'] } },
  { name: 'disconnect_tunnel', description: '断开指定隧道', inputSchema: { type: 'object', properties: { id: { type: 'string', description: '隧道 ID 或 CF ID' } }, required: ['id'] } },
  { name: 'list_rules', description: '查看指定隧道的域名转发规则', inputSchema: { type: 'object', properties: { id: { type: 'string', description: '隧道 ID 或 CF ID' } }, required: ['id'] } },
  { name: 'add_rule', description: '为隧道添加域名转发规则（自动创建 DNS CNAME）', inputSchema: { type: 'object', properties: { id: { type: 'string', description: '隧道 ID 或 CF ID' }, hostname: { type: 'string', description: '对外域名，如 app.example.com' }, service: { type: 'string', description: '内网服务地址，如 http://192.168.1.10:5000' } }, required: ['id', 'hostname', 'service'] } },
];

async function callTool(name, args) {
  args = args || {};
  const resolveT = (id) => {
    const t = store.findTunnel(id);
    if (!t) throw new Error('隧道不存在: ' + id);
    return t;
  };
  switch (name) {
    case 'list_tunnels': {
      const s = await tunnelMgr.fullStatus();
      return s.tunnels.map(t => `${t.name} | CF状态:${t.cfStatus} | 本地在线:${t.online ? '是' : '否'}${t.local ? ' 运行时长:' + Math.floor(t.local.uptimeSec / 60) + '分钟' : ''}${t.autostart ? ' | 自启' : ''}`);
    }
    case 'create_tunnel': {
      const cfT = await cfd.createTunnel(String(args.name).trim());
      const tunnels = store.getTunnels();
      const rec = { id: 't_' + require('crypto').randomUUID(), cfId: cfT.id, name: String(args.name).trim(), autostart: true, createdAt: new Date().toISOString() };
      tunnels.push(rec);
      store.saveTunnels(tunnels);
      return `已创建隧道「${rec.name}」(${rec.cfId})`;
    }
    case 'delete_tunnel': {
      const t = resolveT(args.id);
      tunnelMgr.stopTunnel(t.id);
      await cfd.deleteTunnel(t.cfId);
      store.saveTunnels(store.getTunnels().filter(x => x.id !== t.id));
      return `已删除隧道「${t.name}」`;
    }
    case 'connect_tunnel': {
      const t = resolveT(args.id);
      await tunnelMgr.startTunnel(t.id);
      return `隧道「${t.name}」正在连接...（多条隧道可同时在线）`;
    }
    case 'disconnect_tunnel': {
      const t = resolveT(args.id);
      tunnelMgr.stopTunnel(t.id);
      return `隧道「${t.name}」已断开`;
    }
    case 'list_rules': {
      const t = resolveT(args.id);
      const conf = await cfd.getTunnelConfig(t.cfId);
      return JSON.stringify((conf.config && conf.config.ingress) || [], null, 2);
    }
    case 'add_rule': {
      const t = resolveT(args.id);
      await cfd.ensureCname(args.hostname, t.cfId);
      const conf = await cfd.getTunnelConfig(t.cfId);
      const rules = ((conf.config && conf.config.ingress) || []).filter(r => r.hostname);
      rules.push({ hostname: args.hostname, service: args.service });
      await cfd.putTunnelConfig(t.cfId, rules, 'http_status:404');
      return `已为「${t.name}」添加规则: ${args.hostname} -> ${args.service}`;
    }
    default:
      throw new Error('未知工具: ' + name);
  }
}

function jsonRpc(res, id, result) {
  res.json({ jsonrpc: '2.0', id, result });
}
function jsonErr(res, id, code, message) {
  res.json({ jsonrpc: '2.0', id, error: { code, message } });
}

function createMcpServer() {
  const app = require('express')();
  app.use(require('express').json());

  app.post('/mcp', async (req, res) => {
    if (!checkKey(req)) return res.status(401).json({ error: '无效的 API Key' });
    const { id, method, params } = req.body || {};
    try {
      if (method === 'initialize') {
        return jsonRpc(res, id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: 'cf-tunnel-manager', version: '1.0.0' },
        });
      }
      if (method === 'tools/list') {
        return jsonRpc(res, id, { tools: TOOLS });
      }
      if (method === 'tools/call') {
        const { name, arguments: args } = params || {};
        const text = await callTool(name, args);
        return jsonRpc(res, id, { content: [{ type: 'text', text: String(text) }] });
      }
      if (method === 'ping') return jsonRpc(res, id, {});
      if (method === 'notifications/initialized') return res.status(204).end();
      return jsonErr(res, id, -32601, 'Method not found: ' + method);
    } catch (e) {
      return jsonErr(res, id, -32000, e.message);
    }
  });

  app.get('/mcp', (req, res) => res.json({ server: 'cf-tunnel-manager', transport: 'streamable-http', endpoint: '/mcp' }));
  return app;
}

module.exports = { createMcpServer };
