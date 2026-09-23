/**
 * store.js - 简单 JSON 文件持久化层（无原生依赖）
 * 数据目录：DATA_DIR（默认 /data，本地开发为项目下 data/）
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const FILES = {
  config: 'config.json',    // 系统配置：CF 凭据、协议、IP版本、默认域名等
  tunnels: 'tunnels.json',  // 隧道定义：name, cfId, autostart, rules 等
  creds: 'creds.json',      // 外部 API 凭证
  users: 'users.json',      // 面板用户（首个注册者为管理员）
};

const cache = {};
const timers = {};

function fileOf(key) { return path.join(DATA_DIR, FILES[key]); }

function load(key, defaultValue) {
  if (cache[key]) return cache[key];
  const f = fileOf(key);
  try {
    if (fs.existsSync(f)) {
      cache[key] = JSON.parse(fs.readFileSync(f, 'utf8'));
    } else {
      cache[key] = defaultValue;
      save(key);
    }
  } catch (e) {
    console.error(`[store] 读取 ${f} 失败，使用默认值:`, e.message);
    cache[key] = defaultValue;
  }
  return cache[key];
}

function save(key) {
  // 防抖：高频写入合并为 300ms 后一次落盘
  clearTimeout(timers[key]);
  timers[key] = setTimeout(() => {
    const f = fileOf(key);
    const tmp = f + '.tmp';
    try {
      fs.writeFileSync(tmp, JSON.stringify(cache[key], null, 2));
      fs.renameSync(tmp, f);
    } catch (e) {
      console.error(`[store] 写入 ${f} 失败:`, e.message);
    }
  }, 300);
}

// ---------- 默认数据 ----------

const DEFAULT_CONFIG = {
  accountId: '',
  apiToken: '',
  protocol: 'quic',        // quic | http2
  edgeIpVersion: '4',      // 4 | 6 | auto
  adminPassword: process.env.ADMIN_PASSWORD || '',
};

function getConfig() { return load('config', DEFAULT_CONFIG); }
function updateConfig(patch) {
  const cfg = Object.assign(getConfig(), patch);
  save('config');
  return cfg;
}

function getTunnels() { return load('tunnels', []); }
function saveTunnels(list) { cache.tunnels = list; save('tunnels'); }
function findTunnel(id) { return getTunnels().find(t => t.id === id || t.cfId === id); }

function getCreds() { return load('creds', []); }
function saveCreds(list) { cache.creds = list; save('creds'); }

function getUsers() { return load('users', []); }
function saveUsers(list) { cache.users = list; save('users'); }

module.exports = { DATA_DIR, getConfig, updateConfig, getTunnels, saveTunnels, findTunnel, getCreds, saveCreds, getUsers, saveUsers };
