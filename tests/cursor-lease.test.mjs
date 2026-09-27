import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,readdir,rm,mkdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

// Every enable in this suite uses a fake native backend and an isolated test mutex.
// The actual watchdog and process-death protocol still execute in real Windows processes.
const executable=fileURLToPath(new URL('../assets/CursorLease.exe',import.meta.url));
const source=fileURLToPath(new URL('../assets/CursorLease.cs',import.meta.url));
const compiler=path.join(process.env.WINDIR||'C:/Windows','Microsoft.NET/Framework64/v4.0.30319/csc.exe');
const build=spawnSync(compiler,['/nologo','/target:exe','/platform:x64','/reference:System.Drawing.dll',`/out:${executable}`,source],{encoding:'utf8',windowsHide:true});
assert.equal(build.status,0,build.stdout+build.stderr);
const root=await mkdtemp(path.join(os.tmpdir(),'dsh-cursor-lease-test-'));
after(async()=>{
  const checked=path.resolve(root),parent=path.resolve(os.tmpdir());
  assert.equal(path.dirname(checked),parent);assert.ok(path.basename(checked).startsWith('dsh-cursor-lease-test-'));
  await rm(checked,{recursive:true,force:true});
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){for(let i=0;i<80;i++){if(await predicate())return;await sleep(50);}throw new Error('condition timed out');}
async function journal(directory){
  const rows=[];
  for(const file of await readdir(directory)){if(!file.endsWith('.log'))continue;const pid=Number(file.slice(0,-4));for(const event of (await readFile(path.join(directory,file),'utf8')).trim().split(/\r?\n/))rows.push({pid,event});}
  return rows;
}
async function directory(name){const value=path.join(root,name);await mkdir(value);return value;}
function start(folder,extra=[]){
  const child=spawn(executable,['--test-double',folder,...extra],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='',errors='',exit;
  child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{errors+=data;});
  const closed=new Promise(resolve=>child.on('close',(code,signal)=>{exit={code,signal};resolve(exit);}));
  return {child,closed,get output(){return output;},get errors(){return errors;},get exit(){return exit;},async line(value,count=1){await until(()=>output.split(/\r?\n/).filter(line=>line===value).length>=count);},send(value){child.stdin.write(value+'\n');},async close(){child.stdin.end();await closed;}};
}

test('native copies and generated cursor construction succeed without changing system cursors',()=>{
  const run=spawnSync(executable,['--self-test'],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/no system cursors changed/);
});

test('render-only exports a PNG without opening a lease',async()=>{
  const png=path.join(root,'arrow.png');const run=spawnSync(executable,['--render-preview',png],{encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);
  const image=await readFile(png);assert.deepEqual([...image.subarray(0,8)],[137,80,78,71,13,10,26,10]);
});

test('read-only cursor fingerprint covers all 14 cursor images and hotspots reproducibly',()=>{
  const first=spawnSync(executable,['--fingerprint'],{encoding:'utf8',windowsHide:true});
  const second=spawnSync(executable,['--fingerprint'],{encoding:'utf8',windowsHide:true});
  assert.equal(first.status,0,first.stderr);assert.equal(second.status,0,second.stderr);
  const a=JSON.parse(first.stdout),b=JSON.parse(second.stdout);assert.equal(a.count,14);assert.equal(a.cursors.length,14);assert.match(a.sha256,/^[a-f0-9]{64}$/);assert.deepEqual(a,b);
});

test('enable is idempotent, disable restores original images, next enable captures afresh',async()=>{
  const dir=await directory('idempotent');const lease=start(dir);await lease.line('ready');
  lease.send('enable');await lease.line('enabled');lease.send('enable');await lease.line('enabled',2);
  let rows=await journal(dir);assert.equal(rows.filter(r=>r.event==='snapshot'&&r.pid===lease.child.pid).length,1);assert.equal(rows.filter(r=>r.event==='apply').length,1);assert.ok(rows.some(r=>r.event==='watchdog-armed'));
  lease.send('disable');await lease.line('disabled');lease.send('disable');await lease.line('disabled',2);
  lease.send('enable');await lease.line('enabled',3);await lease.close();assert.equal(lease.exit.code,0,lease.errors);
  rows=await journal(dir);assert.equal(rows.filter(r=>r.event==='snapshot'&&r.pid===lease.child.pid).length,2);assert.equal(rows.filter(r=>r.event==='restore-original').length,2);assert.equal(rows.filter(r=>r.event==='reload-configured').length,0);
});

test('stdin EOF restores an active lease before watchdog shutdown',async()=>{
  const dir=await directory('eof');const lease=start(dir);await lease.line('ready');lease.send('enable');await lease.line('enabled');await lease.close();
  assert.equal(lease.exit.code,0,lease.errors);const rows=await journal(dir);assert.equal(rows.filter(r=>r.event==='restore-original').length,1);assert.ok(rows.some(r=>r.event==='watchdog-disarmed'));assert.ok(rows.some(r=>r.event==='watchdog-exit'));
});

test('killing active helper triggers independent watchdog restoration of its own original-image copies',async()=>{
  const dir=await directory('killed-helper');const lease=start(dir);await lease.line('ready');lease.send('enable');await lease.line('enabled');lease.child.kill();
  await until(async()=>(await journal(dir)).some(r=>r.event==='restore-original'&&r.pid!==lease.child.pid));await lease.closed;
  const rows=await journal(dir);assert.equal(rows.filter(r=>r.event==='restore-original').length,1);assert.equal(rows.filter(r=>r.event==='reload-configured').length,0);assert.ok(rows.some(r=>r.event==='watchdog-exit'));
});

test('killing watchdog makes surviving helper restore precise originals and exit',async()=>{
  const dir=await directory('killed-watchdog');const lease=start(dir);await lease.line('ready');lease.send('enable');await lease.line('enabled');
  const guardian=(await journal(dir)).find(r=>r.event==='watchdog-ready');assert.ok(guardian);process.kill(guardian.pid);
  await lease.closed;assert.equal(lease.exit.code,2);assert.match(lease.errors,/cursor-watchdog-exit/);const rows=await journal(dir);assert.equal(rows.filter(r=>r.event==='restore-original').length,1);
});

test('second instance cannot become ready or mutate while first watchdog owns mutex',async()=>{
  const dir=await directory('mutex');const first=start(dir);await first.line('ready');first.send('enable');await first.line('enabled');
  const second=start(dir);await second.closed;assert.equal(second.exit.code,2);assert.ok(!second.output.includes('ready'));assert.ok((await journal(dir)).some(r=>r.event==='watchdog-busy'||r.event==='lease-busy'));
  await first.close();const third=start(dir);await third.line('ready');await third.close();assert.equal(third.exit.code,0);
});

test('partial apply failure restores originals without claiming enabled',async()=>{
  const dir=await directory('partial-failure');const lease=start(dir,['--test-fail-apply']);await lease.line('ready');lease.send('enable');await lease.closed;
  assert.equal(lease.exit.code,2);assert.ok(!lease.output.includes('enabled'));const rows=await journal(dir);assert.equal(rows.filter(r=>r.event==='restore-original').length,1);assert.ok(rows.some(r=>r.event==='watchdog-disarmed'));
});

test('idle EOF performs no system cursor restoration or replacement',async()=>{
  const dir=await directory('idle');const lease=start(dir);await lease.line('ready');await lease.close();assert.equal(lease.exit.code,0);
  const rows=await journal(dir);assert.ok(rows.every(r=>!['snapshot','apply','restore-original','reload-configured'].includes(r.event)));
});
