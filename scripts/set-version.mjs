#!/usr/bin/env node
import fs from 'node:fs';

const raw = process.argv[2] || '';
if (!/^\d+\.\d+\.\d+$/.test(raw)) {
  console.error('用法：node scripts/set-version.mjs 1.8.1');
  process.exit(1);
}
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
packageJson.version = raw;
fs.writeFileSync('package.json', `${JSON.stringify(packageJson, null, 2)}\n`);
const replace = (file, pattern, replacement) => {
  const before = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, before.replace(pattern, replacement));
};
replace('Dockerfile', /(org\.opencontainers\.image\.version=")\d+\.\d+\.\d+(")/, `$1${raw}$2`);
replace('desktop/src-tauri/tauri.conf.json', /(\"version\": \")\d+\.\d+\.\d+(\")/, `$1${raw}$2`);
replace('desktop/src-tauri/Cargo.toml', /^version = "\d+\.\d+\.\d+"$/m, `version = "${raw}"`);
replace('README.md', /(当前版本：\*\*v)\d+\.\d+\.\d+(\*\*)/, `$1${raw}$2`);
replace('install.sh', /(CF Tunnel Manager v)\d+\.\d+\.\d+/, `$1${raw}`);
console.log(`版本已统一更新为 v${raw}，请检查 git diff 后提交并创建同名标签。`);
