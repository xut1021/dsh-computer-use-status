import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import electron from 'electron';

// Render the built HUD and its real preload in a hidden, isolated Electron window.
// This fixture starts no desktop input helpers and does not replace the system cursor.
test('Orange and blue HUD themes fit receipts, preserve controls and animate the blue mascot accessibly',{timeout:30000},async()=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(electron,[fileURLToPath(new URL('./fixtures/HudRuntime.cjs',import.meta.url))],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='';child.stdout.on('data',value=>output+=value);child.stderr.on('data',value=>output+=value);
  const timer=setTimeout(()=>child.kill(),25000);
  try {
    const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});
    assert.equal(code,0,output);
    const acceptance=output.match(/HUD_ACCEPTANCE (\{[^\r\n]+\})/);
    assert.ok(acceptance,'HUD fixture must report its acceptance results');
    const results=JSON.parse(acceptance[1]);
    assert.deepEqual(Object.keys(results.themes),['orange','blue']);
    assert.equal(results.defaultOrange,true);
    assert.equal(results.unknownFallbackOrange,true);
    assert.equal(results.liveThemeSameRenderer,true);
    assert.equal(results.liveThemePreservesControlsAndPause,true);
    assert.equal(results.mascotAnimationRemounts,true);
  }finally{clearTimeout(timer);if(child.exitCode===null)child.kill();}
});
