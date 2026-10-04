#!/usr/bin/env node
import fs from 'node:fs';

const raw = process.argv[2] || '';
if (!/^\d+\.\d+\.\d+$/.test(raw)) {
  console.error('用法：node scripts/set-version.mjs 1.8.1');
  process.exit(1);
}
const files = ['package.json','Dockerfile','desktop/src-tauri/tauri.conf.json','desktop/src-tauri/Cargo.toml','desktop/README.md','README.md','install.sh'];
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/v?\d+\.\d+\.\d+/g, value => value.startsWith('v') ? `v${raw}` : raw);
  fs.writeFileSync(file, after);
}
console.log(`版本已统一更新为 v${raw}，请检查 git diff 后提交并创建同名标签。`);
