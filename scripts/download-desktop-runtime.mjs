import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dir='desktop/src-tauri/runtime';
fs.mkdirSync(dir,{recursive:true});
fs.copyFileSync(process.execPath,path.join(dir,process.platform==='win32'?'node.exe':'node'));
const arch=process.arch==='arm64'?'arm64':'amd64';
const asset=`cloudflared-${process.platform==='win32'?'windows':process.platform==='darwin'?'darwin':'linux'}-${arch}${process.platform==='win32'?'.exe':process.platform==='darwin'?'.tgz':''}`;
// 固定发行版，避免共享 runner 的匿名 API 限额，也保证每次构建一致。
const response=await fetch(`https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/${asset}`);if(!response.ok)throw Error(`download ${response.status}`);
const target=path.join(dir,process.platform==='win32'?'cloudflared.exe':'cloudflared');
if(process.platform==='darwin') {fs.writeFileSync(path.join(dir,asset),Buffer.from(await response.arrayBuffer()));execFileSync('tar',['-xzf',path.join(dir,asset),'-C',dir]);fs.unlinkSync(path.join(dir,asset));}
else fs.writeFileSync(target,Buffer.from(await response.arrayBuffer()));
if(process.platform!=='win32'){fs.chmodSync(target,0o755);fs.chmodSync(path.join(dir,'node'),0o755);}
execFileSync(target,['--version'],{stdio:'inherit'});
