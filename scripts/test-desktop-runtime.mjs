import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=path.resolve('desktop/src-tauri/runtime');
const node=path.join(root,process.platform==='win32'?'node.exe':'node');
execFileSync(path.join(root,process.platform==='win32'?'cloudflared.exe':'cloudflared'),['--version']);
const data=fs.mkdtempSync(path.join(os.tmpdir(),'cfm-test-'));
let child;const port=19890;const url=`http://127.0.0.1:${port}`;
async function start(){
 child=spawn(node,[path.join(root,'src/server.js')],{cwd:root,env:{...process.env,DATA_DIR:data,WEB_PORT:String(port),API_PORT:'19892',MCP_PORT:'19893',CFM_BIND_HOST:'127.0.0.1',CLOUDFLARED_PATH:path.join(root,process.platform==='win32'?'cloudflared.exe':'cloudflared')},stdio:'ignore'});
 for(let i=0;i<60;i++){if(child.exitCode!==null)throw Error('service exited');try{const r=await fetch(url+'/api/auth/state');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('service not ready');
}
async function request(route,body,cookie){const r=await fetch(url+'/api'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {r,j:await r.json()};}
async function stop(){if(child&&child.exitCode===null){child.kill();await new Promise(r=>child.once('exit',r));}}
try{
 await start(); assert.equal((await request('/auth/state')).j.data.needsSetup,true);
 const password=crypto.randomBytes(18).toString('hex');
 const setup=await request('/setup',{username:'desktop_test',password});assert.equal(setup.j.success,true);const cookie=setup.r.headers.get('set-cookie').split(';')[0];
 assert.equal((await request('/auth/state',null,cookie)).j.data.loggedIn,true);
 const index=await fetch(url);assert.match(await index.text(),/setupForm/);
 await new Promise(r=>setTimeout(r,600));await stop();await start();
 assert.equal((await request('/auth/state')).j.data.needsSetup,false);
 assert.equal((await request('/login',{username:'desktop_test',password})).j.success,true);
 console.log('PASS: bundled Node/cloudflared, startup, setup, session, page, restart and login');
}finally{await stop();fs.rmSync(data,{recursive:true,force:true});}
