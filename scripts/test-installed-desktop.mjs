import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
const exe=path.resolve(process.argv[2]);
const data=fs.mkdtempSync(path.join(os.tmpdir(),'cfm-installed-'));
let child,base;
async function start(){
 fs.rmSync(path.join(data,'service.log'),{force:true});
 child=spawn(exe,[],{env:{...process.env,CFM_DESKTOP_DATA:data},stdio:'ignore'});
 for(let i=0;i<300;i++){
  if(child.exitCode!==null)throw Error('Packaged app exited: '+child.exitCode+' '+(fs.existsSync(path.join(data,'service.log'))?fs.readFileSync(path.join(data,'service.log'),'utf8'):''));
  if(fs.existsSync(path.join(data,'service.log'))){const log=fs.readFileSync(path.join(data,'service.log'),'utf8');const match=log.match(/\[web\].*:(\d+)/);if(match){base=`http://127.0.0.1:${match[1]}`;try{if((await fetch(base+'/api/auth/state')).ok)return;}catch{}}}
  await new Promise(r=>setTimeout(r,100));
 }throw Error('Packaged app never started service');
}
async function stop(){if(child&&child.exitCode===null){execFileSync('taskkill',['/pid',String(child.pid),'/T','/F'],{stdio:'ignore'});await new Promise(r=>setTimeout(r,500));}}
async function req(route,body,cookie){const r=await fetch(base+'/api'+route,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body?JSON.stringify(body):undefined});return {j:await r.json(),r};}
try{
 await start();assert.equal((await req('/auth/state')).j.data.needsSetup,true);
 const password=crypto.randomBytes(18).toString('hex');const a=await req('/setup',{username:'installed_test',password});assert.equal(a.j.success,true);
 const cookie=a.r.headers.get('set-cookie').split(';')[0];assert.equal((await req('/auth/state',null,cookie)).j.data.loggedIn,true);
 assert.match(await (await fetch(base)).text(),/setupForm/);
 await new Promise(r=>setTimeout(r,600));await stop();await start();
 assert.equal((await req('/auth/state')).j.data.needsSetup,false);assert.equal((await req('/login',{username:'installed_test',password})).j.success,true);
 console.log('PASS: extracted MSI application starts bundled server, setup, session and account persistence');
}finally{await stop();fs.rmSync(data,{recursive:true,force:true});}
