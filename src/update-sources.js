const REGISTRY_HOSTS = new Set(['docker.1ms.run', 'docker.io', 'registry-1.docker.io', 'docker.m.daocloud.io', 'hub.docker.com']);

function normalizeRemote(value) {
  const remote = String(value || '').trim();
  const embedded = [...remote.matchAll(/https?:\/\/github\.com\/[^\s?#]+/g)].pop();
  if (embedded) return embedded[0];
  const ssh = remote.match(/^git@github\.com:(.+)$/);
  return ssh ? `https://github.com/${ssh[1]}` : remote;
}

function normalizeMirror(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  let url;
  try { url = new URL(raw); } catch { throw new Error('Git 加速前缀必须是完整的 HTTP/HTTPS 地址'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Git 加速前缀仅支持无账号、无查询参数的 HTTP/HTTPS 地址');
  }
  if (REGISTRY_HOSTS.has(url.hostname)) throw new Error('这是 Docker 镜像源，不能作为 Git 更新源，请使用 GitHub 加速前缀');
  if (/https?:\/\//.test(url.pathname)) throw new Error('请只填写加速站前缀，不要填写完整仓库地址');
  return raw.replace(/\/+$/, '') + '/';
}

function fetchUrlOf(remote, mirror) {
  const origin = normalizeRemote(remote);
  const prefix = normalizeMirror(mirror);
  // GitHub 反代仅适用于 GitHub 地址，不改变其他自定义 Git 远端。
  return prefix && origin.startsWith('https://github.com/') ? prefix + origin : origin;
}

function candidatesOf(cfg, builtins) {
  const result = [];
  function add(value) {
    let url;
    try { url = normalizeMirror(value); } catch { return; }
    if (!result.some(item => item.url === url)) result.push({name: url || '直连 GitHub', url});
  }
  add(cfg.gitMirror);
  add(''); // 自定义源失败后，必须仍能尝试直连。
  add(cfg.lastGoodMirror);
  builtins.forEach(item => add(item.url));
  return result;
}
module.exports = {normalizeRemote, normalizeMirror, fetchUrlOf, candidatesOf};
