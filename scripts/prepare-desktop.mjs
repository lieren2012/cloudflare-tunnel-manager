import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const dest='desktop/src-tauri/runtime';
fs.mkdirSync(dest,{recursive:true});
for(const item of ['src','public','package.json']) fs.cpSync(item,path.join(dest,item),{recursive:true});
execFileSync(process.platform==='win32'?'npm.cmd':'npm',['install','--omit=dev','--ignore-scripts','--prefix',dest],{stdio:'inherit',shell:process.platform==='win32'});
