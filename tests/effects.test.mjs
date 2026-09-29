import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import electron from 'electron';

// Exercise the built Effects surface and real sandboxed preload. The fixture sends
// deterministic positions and starts no native helpers or system cursor lease.
test('effects follow cursor replies with one request in flight and restart cleanly',{timeout:30000},async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(electron,[fileURLToPath(new URL('./fixtures/EffectsRuntime.cjs',import.meta.url))],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>output+=value);
  const timer=setTimeout(()=>child.kill(),25000);
  try {
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    assert.equal(code,0,output);
    assert.match(output,/EFFECTS_ACCEPTANCE/);
  }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
});

test('a completed click retains its pulse when the next action starts before the next frame',()=>{
  const root=fileURLToPath(new URL('../ui',import.meta.url));
  const messages=[];
  const nodeRequire=createRequire(import.meta.url);
  // Run the real publication/sampling code with inert window and app boundaries.
  const host={app:{commandLine:{appendSwitch(){}},getPath(){return root;},setPath(){},whenReady(){return {then(){}};},on(){}},screen:{getCursorScreenPoint(){return {x:25,y:30};}}};
  const context={require:name=>name==='electron'?host:nodeRequire(name),__dirname:root,process:{argv:['electron','test','--dsh-preview']},clearTimeout,setTimeout,module:{exports:{}},messages};
  vm.runInNewContext(readFileSync(new URL('../ui/main.cjs',import.meta.url),'utf8')+`
    const fakeWindow={webContents:{id:1,send(channel,value){messages.push({channel,value});}},isDestroyed(){return false;},isVisible(){return true;},hide(){}};
    pill=fakeWindow;loaded.add(1);
    const item={win:fakeWindow,bounds:{x:0,y:0,width:100,height:100}};effects.set('test',item);
    module.exports={publishState(value){state=value;publish();},request(){sendCursor(item);}};
  `,context);
  const overlay=context.module.exports;
  const base={active:true,canStop:true,paused:false,cursorActive:true};
  overlay.publishState({...base,state:'running',id:'initial'});
  overlay.request();
  overlay.publishState({...base,state:'done',id:'clicked',pointer:{action:'click'}});
  overlay.publishState({...base,state:'running',id:'next'});
  overlay.request();
  const samples=messages.filter(item=>item.channel==='cursor').map(item=>item.value);
  assert.equal(samples[0].pulse,0);
  assert.ok(samples[1].pulse>0,'Click receipt must survive the next running status');
});

test('native live theme updates resize only height and preserve the published pause and control state',()=>{
  const root=fileURLToPath(new URL('../ui',import.meta.url));
  const messages=[],boundsCalls=[],bounds={x:35,y:36,width:400,height:68};
  const nodeRequire=createRequire(import.meta.url);
  const host={app:{commandLine:{appendSwitch(){}},getPath(){return root;},setPath(){},whenReady(){return {then(){}};},on(){}}};
  const context={require:name=>name==='electron'?host:nodeRequire(name),__dirname:root,process:{argv:['electron','test','--dsh-preview']},clearTimeout,setTimeout,module:{exports:{}},messages,boundsCalls,bounds};
  vm.runInNewContext(readFileSync(new URL('../ui/main.cjs',import.meta.url),'utf8')+`
    pill={webContents:{id:1,send(channel,value){messages.push({channel,value});}},isDestroyed(){return false;},isVisible(){return true;},setBounds(patch){boundsCalls.push(patch);Object.assign(bounds,patch);}};
    loaded.add(1);
    module.exports={publishState(value){state=value;publish();},readState(){return state;}};
  `,context);
  const overlay=context.module.exports;
  const base={active:true,state:'paused',paused:true,canStop:true,canPause:false,cursorActive:true};
  for(const theme of ['orange','orange','blue','blue','orange','unknown']){
    const status={...base,theme};
    overlay.publishState(status);
    assert.equal(overlay.readState(),status,'Theme update must preserve the active status snapshot');
    assert.equal(messages.at(-1).value,status,'Renderer must receive unchanged pause/control state');
    assert.deepEqual({x:bounds.x,y:bounds.y,width:bounds.width},{x:35,y:36,width:400},'Theme changes must preserve native window position and width');
  }
  assert.deepEqual(boundsCalls.map(value=>({...value})),[{height:164},{height:68}],'Only a changed valid theme should resize the native window');
  assert.equal(bounds.height,68);
});
