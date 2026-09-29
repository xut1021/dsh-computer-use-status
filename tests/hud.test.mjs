import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';

// Render the built HUD and its real preload in a hidden, isolated Electron window.
// This fixture starts no desktop input helpers and does not replace the system cursor.
test('HUD fits receipt labels and its pause/stop controls match the displayed state',{timeout:30000},async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(electron,[fileURLToPath(new URL('./fixtures/HudRuntime.cjs',import.meta.url))],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>output+=value);
  const timer=setTimeout(()=>child.kill(),25000);
  try {
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    assert.equal(code,0,output);
    assert.match(output,/HUD_ACCEPTANCE/);
  }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
});
