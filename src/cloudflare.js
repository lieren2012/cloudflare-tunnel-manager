/**
 * cloudflare.js - Cloudflare API v4 封装
 * 使用 remote-managed tunnel（config_src=cloudflare），ingress 规则托管在 CF 云端，
 * cloudflared 用 token 模式运行，天然支持多进程多隧道并行。
 */
const store = require('./store');

const BASE = 'https://api.cloudflare.com/client/v4';

async function cf(method, urlPath, body, query) {
  const cfg = store.getConfig();
  if (!cfg.apiToken) throw new Error('未配置 Cloudflare API Token，请先在「系统配置」中填写');
  let url = BASE + urlPath;
  if (query) {
    const qs = new URLSearchParams(query).toString();
    if (qs) url += '?' + qs;
  }
  const headers = {
    'Authorization': `Bearer ${cfg.apiToken}`,
    'Content-Type': 'application/json',
  };
  const opt = { method, headers };
  if (body !== undefined) opt.body = JSON.stringify(body);
  const res = await fetch(url, opt);
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    const errs = (data.errors || []).map(e => `${e.code}: ${e.message}`).join('; ');
    throw new Error(`Cloudflare API 错误: ${errs || `HTTP ${res.status}`}`);
  }
  return data.result;
}

// ---------- 凭据验证 ----------

async function testCredentials(accountId, apiToken) {
  const headers = { 'Authorization': `Bearer ${apiToken}`, 'Content-Type': 'application/json' };
  const v = await fetch(`${BASE}/user/tokens/verify`, { headers });
  const vd = await v.json().catch(() => ({}));
  if (!vd.success || (vd.result && vd.result.status !== 'active')) {
    throw new Error('API Token 无效或已过期');
  }
  // 验证能否访问指定账号的 Tunnel 列表
  const r = await fetch(`${BASE}/accounts/${accountId}/cfd_tunnel?is_deleted=false&per_page=1`, { headers });
  const rd = await r.json().catch(() => ({}));
  if (!rd.success) {
    const errs = (rd.errors || []).map(e => e.message).join('; ');
    throw new Error(`无法访问账号 ${accountId}：${errs || '权限不足'}（需要 Cloudflare Tunnel 读取/编辑 权限）`);
  }
  return true;
}

// ---------- Tunnel CRUD ----------

const listTunnels = () => cf('GET', `/accounts/${store.getConfig().accountId}/cfd_tunnel`, undefined, { is_deleted: 'false', per_page: '100' });

const createTunnel = (name) => cf('POST', `/accounts/${store.getConfig().accountId}/cfd_tunnel`, { name, config_src: 'cloudflare' });

const deleteTunnel = (tunnelId) => cf('DELETE', `/accounts/${store.getConfig().accountId}/cfd_tunnel/${tunnelId}`);

const getTunnelToken = (tunnelId) => cf('GET', `/accounts/${store.getConfig().accountId}/cfd_tunnel/${tunnelId}/token`);

// ---------- Ingress 配置（云端托管） ----------

function getTunnelConfig(tunnelId) {
  return cf('GET', `/accounts/${store.getConfig().accountId}/cfd_tunnel/${tunnelId}/configurations`);
}

// ingress: [{ hostname, service, noTLSVerify, originServerName, path? , ...}] + catchAllService
async function putTunnelConfig(tunnelId, ingress, catchAllService) {
  const rules = ingress.map(r => {
    const out = { hostname: r.hostname, service: r.service };
    if (r.path) out.path = r.path;
    const req = {};
    if (r.noTLSVerify) req.noTLSVerify = true;
    if (r.originServerName) req.originServerName = r.originServerName;
    if (r.httpHostHeader) req.httpHostHeader = r.httpHostHeader;
    if (Object.keys(req).length) out.originRequest = req;
    return out;
  });
  // catch-all 必须是最后一条
  rules.push({ service: catchAllService || 'http_status:404' });
  return cf('PUT', `/accounts/${store.getConfig().accountId}/cfd_tunnel/${tunnelId}/configurations`, { config: { ingress: rules } });
}

// ---------- DNS ----------

async function listZones() {
  return cf('GET', '/zones', undefined, { per_page: '50' });
}

async function findZoneForHost(hostname) {
  const zones = await listZones();
  let best = null;
  for (const z of zones) {
    if (hostname === z.name || hostname.endsWith('.' + z.name)) {
      if (!best || z.name.length > best.name.length) best = z;
    }
  }
  if (!best) throw new Error(`域名 ${hostname} 未托管到当前 Cloudflare 账号`);
  return best;
}

async function ensureCname(hostname, tunnelId) {
  const zone = await findZoneForHost(hostname);
  // 已存在同名记录则跳过
  const existing = await cf('GET', `/zones/${zone.id}/dns_records`, undefined, { type: 'CNAME', name: hostname });
  const target = `${tunnelId}.cfargotunnel.com`;
  if (existing && existing.length) {
    const rec = existing[0];
    if (rec.content === target) return { skipped: true, zone: zone.name };
    await cf('PUT', `/zones/${zone.id}/dns_records/${rec.id}`, { type: 'CNAME', name: hostname, content: target, proxied: true });
    return { updated: true, zone: zone.name };
  }
  await cf('POST', `/zones/${zone.id}/dns_records`, { type: 'CNAME', name: hostname, content: target, proxied: true });
  return { created: true, zone: zone.name };
}

async function removeCname(hostname, tunnelId) {
  const zone = await findZoneForHost(hostname);
  const existing = await cf('GET', `/zones/${zone.id}/dns_records`, undefined, { type: 'CNAME', name: hostname });
  const target = `${tunnelId}.cfargotunnel.com`;
  for (const rec of existing || []) {
    if (rec.content === target) {
      await cf('DELETE', `/zones/${zone.id}/dns_records/${rec.id}`);
      return { deleted: true };
    }
  }
  return { notFound: true };
}

module.exports = {
  testCredentials, listTunnels, createTunnel, deleteTunnel, getTunnelToken,
  getTunnelConfig, putTunnelConfig,
  listZones, ensureCname, removeCname,
};
