import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {mkdtemp,cp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=await mkdtemp(path.join(root,'.bridge-test-'));
await cp(path.join(root,'bridge.mjs'),path.join(fixture,'bridge.mjs'));
await cp(path.join(root,'ui'),path.join(fixture,'ui'),{recursive:true});
await cp(path.join(root,'assets'),path.join(fixture,'assets'),{recursive:true});
await mkdir(path.join(fixture,'cursor-test'));
const main=path.join(fixture,'ui/main.cjs');
const original=await readFile(main,'utf8');
const isolated=original.replace("spawn(path.join(__dirname,'../assets/CursorLease.exe'),[]", "spawn(path.join(__dirname,'../assets/CursorLease.exe'),['--test-double',path.join(__dirname,'../cursor-test')]");
assert.notEqual(isolated,original);
await writeFile(main,isolated);
const {OverlayBridge}=await import(pathToFileURL(path.join(fixture,'bridge.mjs')).href);
after(async()=>{assert.equal(path.dirname(fixture),root.replace(/[\\/]$/,''));await rm(fixture,{recursive:true,force:true,maxRetries:20,retryDelay:100});});

// Real Electron/pipe handshake; isolated cursor test double, no desktop input.
test('Windows runtime stays connected and exits normally when its named pipe closes',async()=>{
  let failures=0;
  const bridge=new OverlayBridge(()=>{},()=>failures++);
  try{
    await bridge.start();
    const child=bridge.child;
    assert.ok(bridge.channel?.writable);
    await delay(150);
    assert.equal(child.exitCode,null);
    await bridge.close();
    assert.equal(child.exitCode,0);
    assert.equal(failures,0);
  }finally{await bridge.close();}
});

test('unexpected control-pipe loss reports one failure and closes the real runtime',async()=>{
  let failures=0;
  const bridge=new OverlayBridge(()=>{},()=>failures++);
  try{
    await bridge.start();
    const child=bridge.child;
    bridge.channel.destroy();
    for(let n=0;n<100&&child.exitCode===null&&child.signalCode===null;n++)await delay(20);
    assert.ok(child.exitCode!==null||child.signalCode!==null);
    assert.equal(failures,1);
  }finally{await bridge.close();}
});
