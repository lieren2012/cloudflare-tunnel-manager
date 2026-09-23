/* app.js - 前端逻辑 */

const $ = (s) => document.querySelector(s);
let tunnelsCache = [];
let logsCache = [];
let logTimer = null;
let ME = null;          // 当前登录用户 { username, role }
let cfgCache = {};      // 系统配置缓存（defaultDomain 等）

// ---------- 工具 ----------
async function api(path, opt = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opt,
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  const data = await res.json().catch(() => ({ success: false, error: '响应解析失败' }));
  if (res.status === 401 && !path.startsWith('/auth') && !path.startsWith('/login') && !path.startsWith('/register') && !path.startsWith('/setup')) {
    showLoginView('login');
    throw new Error('登录已过期，请重新登录');
  }
  if (!res.ok || data.success === false) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDur(sec) {
  if (sec == null) return '-';
  if (sec < 60) return sec + ' 秒';
  if (sec < 3600) return Math.floor(sec / 60) + ' 分钟';
  if (sec < 86400) return Math.floor(sec / 3600) + ' 小时 ' + Math.floor(sec % 3600 / 60) + ' 分';
  return Math.floor(sec / 86400) + ' 天 ' + Math.floor(sec % 86400 / 3600) + ' 小时';
}
function cfStatusTag(s) {
  const map = { healthy: ['ok', '健康'], degraded: ['warn', '警告'], inactive: ['off', '非活跃'], down: ['err', '错误'], deleted: ['err', '云端已删除'] };
  const m = map[s] || ['off', s || '未知'];
  return `<span class="tag ${m[0]}">${m[1]}</span>`;
}

// ---------- 认证视图 ----------
function switchAuth(mode) {
  ['setupForm', 'loginForm', 'registerForm'].forEach(id => $('#' + id).classList.add('hidden'));
  const map = { setup: 'setupForm', login: 'loginForm', register: 'registerForm' };
  $('#' + map[mode]).classList.remove('hidden');
}
function showLoginView(mode = 'login') {
  ME = null;
  $('#app').classList.add('hidden');
  $('#loginView').classList.remove('hidden');
  switchAuth(mode);
}
function showApp() {
  $('#loginView').classList.add('hidden');
  $('#app').classList.remove('hidden');
}
function authErr(id, msg) { $('#' + id).textContent = msg; }

async function doSetup() {
  if ($('#suPass').value !== $('#suPass2').value) return authErr('authErr1', '两次密码不一致');
  try {
    await api('/setup', { method: 'POST', body: { username: $('#suUser').value.trim(), password: $('#suPass').value } });
    await afterLogin();
  } catch (e) { authErr('authErr1', e.message); }
}
async function doLogin() {
  try {
    await api('/login', { method: 'POST', body: { username: $('#loginUser').value.trim(), password: $('#loginPwd').value } });
    await afterLogin();
  } catch (e) { authErr('authErr2', e.message); }
}
async function doRegister() {
  try {
    const r = await api('/register', { method: 'POST', body: { username: $('#regUser').value.trim(), password: $('#regPass').value } });
    authErr('authErr3', '');
    alert(r.message || '注册成功，等待管理员审核');
    switchAuth('login');
  } catch (e) { authErr('authErr3', e.message); }
}
async function doLogout() {
  try { await api('/logout', { method: 'POST' }); } catch (_) {}
  showLoginView('login');
}
async function afterLogin() {
  const { data } = await api('/auth/state');
  ME = data.me;
  applyRole();
  showApp();
  boot();
}
function applyRole() {
  const admin = ME && ME.role === 'admin';
  $('#navUsers').classList.toggle('hidden', !admin);
}

// ---------- 导航 ----------
document.querySelectorAll('.sidebar nav a').forEach(a => {
  a.addEventListener('click', () => {
    document.querySelectorAll('.sidebar nav a').forEach(x => x.classList.remove('active'));
    a.classList.add('active');
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    const page = $('#page-' + a.dataset.page);
    page.classList.remove('hidden');
    page.classList.add('active');
    loadPage(a.dataset.page);
  });
});
function loadPage(p) {
  if (p === 'dashboard') refreshDashboard();
  if (p === 'config') loadConfig();
  if (p === 'tunnels') refreshTunnels();
  if (p === 'creds') loadCreds();
  if (p === 'users') loadUsers();
  if (p === 'logs') { loadLogTunnels(); renderLogs(); }
}

// ---------- 首页 ----------
async function refreshDashboard() {
  try {
    const { data } = await api('/tunnels');
    tunnelsCache = data.tunnels || [];
    const online = tunnelsCache.filter(t => t.online);
    $('#statOnline').textContent = online.length;
    $('#statTotal').textContent = tunnelsCache.length;
    $('#statConns').textContent = tunnelsCache.reduce((s, t) => s + (t.connections || 0), 0);
    $('#onlineCount').textContent = `🟢 ${online.length} 条隧道在线`;
    const sys = await api('/system');
    $('#statUptime').textContent = fmtDur(sys.data.uptimeSec);
    $('#aboutData').textContent = sys.data.dataDir;
    $('#dashTunnels').innerHTML = tunnelsCache.length ? tunnelsCache.map(t => `
      <div class="card">
        <b>${esc(t.name)}</b> ${cfStatusTag(t.cfStatus)} ${t.online ? '<span class="tag ok">在线</span>' : '<span class="tag off">离线</span>'}
        <p class="muted small" style="margin-top:8px">
          ${t.local ? '运行 ' + fmtDur(t.local.uptimeSec) + ' · ' : ''}边缘连接 ${t.connections} 条${t.autostart ? ' · 自启' : ''}
        </p>
      </div>`).join('') : '<p class="muted">暂无隧道，前往「Tunnel 列表」创建。</p>';
    $('#dashHint').textContent = data.configured ? '' : '尚未配置 Cloudflare 凭据，请先前往「系统配置」。';
  } catch (e) { $('#dashHint').textContent = '加载失败: ' + e.message; }
}

// ---------- 系统配置 ----------
async function loadZones() {
  try {
    const { data } = await api('/zones');
    const sel = $('#cfgDomain');
    const cur = cfgCache.defaultDomain || '';
    sel.innerHTML = '<option value="">未设置</option>' + data.map(z => `<option value="${esc(z)}" ${z === cur ? 'selected' : ''}>${esc(z)}</option>`).join('');
  } catch (_) { /* 未配置凭据时忽略 */ }
}
async function loadConfig() {
  try {
    const { data } = await api('/config');
    cfgCache = data;
    $('#cfgAccount').value = data.accountId || '';
    $('#cfgProtocol').value = data.protocol || 'quic';
    $('#cfgEdge').value = data.edgeIpVersion || '4';
    $('#cfgToken').placeholder = data.hasToken ? '已保存（留空表示不修改）' : '请输入 API Token';
    await loadZones();
  } catch (_) {}
}
function cfgMsg(text, ok) { const m = $('#cfgMsg'); m.textContent = text; m.className = 'msg ' + (ok ? 'ok' : 'err'); }
async function testConfig() {
  cfgMsg('测试中…', true);
  try {
    await api('/config/test', { method: 'POST', body: { accountId: $('#cfgAccount').value, apiToken: $('#cfgToken').value } });
    cfgMsg('✅ 测试通过：凭据有效', true);
  } catch (e) { cfgMsg('❌ ' + e.message, false); }
}
async function saveConfig() {
  cfgMsg('保存中…', true);
  try {
    await api('/config', { method: 'POST', body: {
      accountId: $('#cfgAccount').value,
      apiToken: $('#cfgToken').value,
      protocol: $('#cfgProtocol').value,
      edgeIpVersion: $('#cfgEdge').value,
      defaultDomain: $('#cfgDomain').value,
    }});
    cfgMsg('✅ 已保存', true);
    loadConfig();
  } catch (e) { cfgMsg('❌ ' + e.message, false); }
}

// ---------- Tunnel 列表 ----------
async function refreshTunnels() {
  try {
    const { data } = await api('/tunnels');
    tunnelsCache = data.tunnels || [];
    $('#tunnelRows').innerHTML = tunnelsCache.length ? tunnelsCache.map((t, i) => `
      <tr>
        <td><b>${esc(t.name)}</b><br><span class="muted small">${esc(t.cfId.slice(0, 12))}…</span></td>
        <td>${cfStatusTag(t.cfStatus)}</td>
        <td>${t.online ? '<span class="tag ok">在线</span>' : '<span class="tag off">离线</span>'}</td>
        <td>${t.local ? fmtDur(t.local.uptimeSec) : '-'}</td>
        <td><button class="mini secondary" onclick="toggleAutostart('${t.cfId}', ${i})">${t.autostart ? '✅ 开启' : '⬜ 关闭'}</button></td>
        <td>
          ${t.online
            ? `<button class="mini secondary" onclick="disconnect('${t.cfId}')">断开</button>`
            : `<button class="mini" onclick="connect('${t.cfId}')">连接</button>`}
          <button class="mini secondary" onclick="showRules('${t.cfId}')">路由</button>
          <button class="mini danger" onclick="delTunnel('${t.cfId}', '${esc(t.name)}')">删除</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="6" class="muted" style="text-align:center;padding:24px">暂无 Tunnel，点击右上角「新建 Tunnel」</td></tr>';
  } catch (e) { $('#tunnelRows').innerHTML = `<tr><td colspan="6" class="err">加载失败: ${esc(e.message)}</td></tr>`; }
}

function showCreate() { $('#modalMsg').textContent = ''; $('#newName').value = ''; $('#modal').classList.remove('hidden'); }
function hideModal() { $('#modal').classList.add('hidden'); }
async function createTunnel() {
  try {
    await api('/tunnels', { method: 'POST', body: { name: $('#newName').value } });
    hideModal();
    refreshTunnels();
  } catch (e) { $('#modalMsg').textContent = e.message; $('#modalMsg').className = 'msg err'; }
}
async function connect(id) { try { await api(`/tunnels/${id}/connect`, { method: 'POST' }); } catch (e) { alert(e.message); } refreshTunnels(); }
async function disconnect(id) { try { await api(`/tunnels/${id}/disconnect`, { method: 'POST' }); } catch (e) { alert(e.message); } refreshTunnels(); }
async function delTunnel(id, name) {
  if (!confirm(`确认删除隧道「${name}」？此操作不可恢复，相关 DNS 记录需手动清理。`)) return;
  try { await api(`/tunnels/${id}`, { method: 'DELETE' }); } catch (e) { alert(e.message); }
  refreshTunnels();
}
async function toggleAutostart(id, i) {
  const t = tunnelsCache[i];
  try { await api(`/tunnels/${id}/autostart`, { method: 'POST', body: { autostart: !t.autostart } }); } catch (e) { alert(e.message); }
  refreshTunnels();
}

// ---------- 转发规则 ----------
const RAND_WORDS = ['blue', 'sun', 'moon', 'lake', 'bird', 'nova', 'fox', 'sky', 'pine', 'cloud', 'mist', 'river'];
function randomPrefix() {
  const w = () => RAND_WORDS[Math.floor(Math.random() * RAND_WORDS.length)];
  return `${w()}-${w()}-${Math.floor(Math.random() * 90 + 10)}`;
}
function randHost() {
  const domain = ($('#cfgDomain').value || cfgCache.defaultDomain || '').trim();
  if (!domain) { $('#ruleMsg').textContent = '请先在「系统配置」中设置默认域名'; $('#ruleMsg').className = 'msg err'; return; }
  $('#ruleHost').value = `${randomPrefix()}.${domain}`;
}
async function showRules(id) {
  try {
    const { data } = await api(`/tunnels/${id}/rules`);
    const rules = (data.ingress || []).filter(r => r.hostname);
    const domain = $('#cfgDomain').value || cfgCache.defaultDomain || '';
    let html = `<div class="modal" id="rulesModal"><div class="modal-card" style="width:640px;max-height:80vh;overflow:auto">
      <h3>域名转发规则 - ${esc(data.tunnel.name)}</h3>
      <table class="tbl" style="margin-top:12px"><thead><tr><th>域名</th><th>服务地址</th><th>操作</th></tr></thead><tbody>
      ${rules.map((r, i) => `<tr><td>${esc(r.hostname)}</td><td>${esc(r.service)}${r.originRequest && r.originRequest.noTLSVerify ? ' <span class="tag warn">跳过TLS验证</span>' : ''}</td>
        <td><button class="mini danger" onclick="delRule('${id}', ${i})">删除</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">暂无规则</td></tr>'}
      </tbody></table>
      <h3 style="margin-top:16px">添加规则</h3>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px">
        <input id="ruleHost" placeholder="对外域名，如 nas${domain ? '.' + esc(domain) : '.example.com'}" style="flex:1;padding:9px 12px;border:1px solid var(--border);border-radius:8px">
        <button class="mini secondary" onclick="randHost()">🎲 随机域名</button>
      </div>
      <input id="ruleSvc" placeholder="内网服务地址，如 http://192.168.1.10:5000" style="margin-top:8px;padding:9px 12px;border:1px solid var(--border);border-radius:8px;width:100%">
      <label class="chk" style="margin-top:8px"><input type="checkbox" id="ruleNoTLS"> 跳过源站 TLS 证书验证（源站为 HTTPS 自签时勾选）</label>
      <p class="muted small">${domain ? `默认域名：${esc(domain)}（在「系统配置」中可修改）。点「随机域名」自动生成子域名，保存后自动创建 DNS CNAME，访问即为 HTTPS` : '提示：在「系统配置」中设置默认域名后，可一键生成随机子域名'}</p>
      <div class="btn-row"><button class="secondary" onclick="document.getElementById('rulesModal').remove()">关闭</button>
      <button onclick="addRule('${id}')">添加规则</button></div>
      <p id="ruleMsg" class="msg"></p></div></div>`;
    const old = document.getElementById('rulesModal');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) { alert(e.message); }
}
async function addRule(id) {
  try {
    await api(`/tunnels/${id}/rules`, { method: 'POST', body: {
      hostname: $('#ruleHost').value.trim(),
      service: $('#ruleSvc').value.trim(),
      noTLSVerify: $('#ruleNoTLS').checked,
    }});
    $('#ruleMsg').textContent = '✅ 已添加（含 DNS CNAME）'; $('#ruleMsg').className = 'msg ok';
    setTimeout(() => { document.getElementById('rulesModal').remove(); showRules(id); }, 800);
  } catch (e) { $('#ruleMsg').textContent = e.message; $('#ruleMsg').className = 'msg err'; }
}
async function delRule(id, idx) {
  if (!confirm('确认删除该转发规则？（会同时尝试清理 DNS 记录）')) return;
  try { await api(`/tunnels/${id}/rules/${idx}`, { method: 'DELETE' }); } catch (e) { alert(e.message); }
  document.getElementById('rulesModal')?.remove();
  showRules(id);
}

// ---------- API 凭证 ----------
async function loadCreds() {
  try {
    const { data } = await api('/creds');
    $('#credRows').innerHTML = data.length ? data.map(c => `
      <tr><td>${esc(c.name)}</td>
      <td><code id="key-${c.id}">${esc(c.key.slice(0, 10))}••••••</code> <button class="mini secondary" onclick="copyKey('${c.id}')">复制</button></td>
      <td class="muted">${esc((c.createdAt || '').slice(0, 19).replace('T', ' '))}</td>
      <td><button class="mini danger" onclick="delCred('${c.id}')">删除</button></td></tr>`).join('')
      : '<tr><td colspan="4" class="muted" style="text-align:center;padding:20px">暂无凭证</td></tr>';
  } catch (e) { alert(e.message); }
}
async function createCred() {
  const name = prompt('凭证名称：', '我的应用');
  if (name === null) return;
  try {
    const { data } = await api('/creds', { method: 'POST', body: { name } });
    prompt('请立即复制 API Key（仅显示一次完整值）：', data.key);
    loadCreds();
  } catch (e) { alert(e.message); }
}
async function delCred(id) {
  if (!confirm('确认删除该凭证？使用它的外部应用将立即失效。')) return;
  await api('/creds/' + id, { method: 'DELETE' });
  loadCreds();
}
function copyKey(id) {
  const full = prompt('输入完整 API Key 以复制（出于安全不回显服务器完整值）：');
  if (full) navigator.clipboard?.writeText(full).catch(() => {});
}

// ---------- 用户管理（管理员） ----------
async function loadUsers() {
  try {
    const { data } = await api('/users');
    $('#userRows').innerHTML = data.map(u => {
      const stMap = { approved: ['ok', '正常'], pending: ['warn', '待审核'], disabled: ['off', '已禁用'] };
      const st = stMap[u.status] || ['off', u.status];
      const my = u.username === (ME && ME.username);
      const ops = [];
      if (u.status === 'pending') ops.push(`<button class="mini" onclick="userAct('${u.id}','approve')">通过审核</button>`);
      if (u.status === 'approved' && !my) ops.push(`<button class="mini secondary" onclick="userAct('${u.id}','disable')">禁用</button>`);
      if (u.status === 'disabled') ops.push(`<button class="mini" onclick="userAct('${u.id}','approve')">启用</button>`);
      ops.push(`<button class="mini secondary" onclick="userResetPw('${u.id}','${esc(u.username)}')">改密</button>`);
      if (!my) ops.push(`<button class="mini danger" onclick="userDel('${u.id}','${esc(u.username)}')">删除</button>`);
      return `<tr>
        <td><b>${esc(u.username)}</b></td>
        <td>${u.role === 'admin' ? '<span class="tag warn">管理员</span>' : '普通用户'}</td>
        <td><span class="tag ${st[0]}">${st[1]}</span></td>
        <td class="muted">${esc((u.createdAt || '').slice(0, 19).replace('T', ' '))}</td>
        <td>${ops.join(' ')}</td></tr>`;
    }).join('');
    try {
      const st = await api('/auth/state');
      $('#regOpen').checked = st.data.regOpen;
    } catch (_) {}
  } catch (e) { $('#userMsg').textContent = e.message; $('#userMsg').className = 'msg err'; }
}
async function userAct(id, action) {
  try { await api(`/users/${id}/${action}`, { method: 'POST' }); } catch (e) { alert(e.message); }
  loadUsers();
}
async function userDel(id, name) {
  if (!confirm(`确认删除用户「${name}」？`)) return;
  try { await api('/users/' + id, { method: 'DELETE' }); } catch (e) { alert(e.message); }
  loadUsers();
}
async function userResetPw(id, name) {
  const pwd = prompt(`为「${name}」设置新密码（至少 6 位）：`);
  if (pwd === null) return;
  try { await api(`/users/${id}/password`, { method: 'POST', body: { password: pwd } }); alert('✅ 已重置'); } catch (e) { alert(e.message); }
}
async function adminAddUser() {
  try {
    await api('/users', { method: 'POST', body: { username: $('#newUUser').value.trim(), password: $('#newUPass').value } });
    $('#newUUser').value = ''; $('#newUPass').value = '';
    $('#userMsg').textContent = '✅ 已添加'; $('#userMsg').className = 'msg ok';
    loadUsers();
  } catch (e) { $('#userMsg').textContent = e.message; $('#userMsg').className = 'msg err'; }
}
async function toggleRegOpen() {
  try { await api('/config/regopen', { method: 'POST', body: { open: $('#regOpen').checked } }); } catch (e) { alert(e.message); }
}

// ---------- 日志 ----------
async function loadLogTunnels() {
  await refreshTunnelsSilent();
  $('#logTunnel').innerHTML = '<option value="all">全部隧道</option>' +
    tunnelsCache.map(t => `<option value="${t.cfId}">${esc(t.name)}</option>`).join('');
}
async function refreshTunnelsSilent() {
  try { const { data } = await api('/tunnels'); tunnelsCache = data.tunnels || []; } catch (_) {}
}
async function renderLogs() {
  try {
    const kw = ($('#logFilter').value || '').toLowerCase();
    const t = $('#logTunnel').value || 'all';
    const { data } = await api(`/logs?tunnel=${encodeURIComponent(t)}`);
    logsCache = data || [];
    const lines = logsCache.filter(l => !kw || l.line.toLowerCase().includes(kw));
    $('#logView').textContent = lines.length
      ? lines.map(l => `[${l.ts.slice(11, 19)}] ${l.line}`).join('\n')
      : '（暂无日志）';
    $('#logView').scrollTop = $('#logView').scrollHeight;
  } catch (e) { $('#logView').textContent = '加载失败: ' + e.message; }
}
function autoLog() {
  clearInterval(logTimer);
  if ($('#logAuto').checked) logTimer = setInterval(renderLogs, 3000);
}

// ---------- 轮询 ----------
setInterval(() => {
  if (!ME) return;
  const active = document.querySelector('.sidebar nav a.active');
  if (active && active.dataset.page === 'dashboard') refreshDashboard();
  if (active && active.dataset.page === 'tunnels') refreshTunnels();
}, 10000);

// ---------- 启动 ----------
async function boot() {
  loadPage('dashboard');
}
(async function init() {
  try {
    const { data } = await api('/auth/state');
    if (!data.loggedIn) {
      showLoginView(data.needsSetup ? 'setup' : 'login');
      return;
    }
    ME = data.me;
    applyRole();
    showApp();
    boot();
  } catch (_) {
    showLoginView('login');
  }
})();
$('#loginPwd').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
$('#regPass').addEventListener('keydown', e => { if (e.key === 'Enter') doRegister(); });
$('#suPass2').addEventListener('keydown', e => { if (e.key === 'Enter') doSetup(); });
