import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {OverlayBridge} from '../bridge.mjs';
import * as plugin from '../index.mjs';
import {resultObjects,dshCuaActions} from '../shared.mjs';
const repo=process.env.DSH_STATUS_TEST_REPO,python=process.env.DSH_CUA_PYTHON,target=process.env.DSH_CUA_TEST_TARGET;

test('DSH 0.1.7 host + real dsh-cua MCP + owned Windows controls', {skip:!repo||!python||!target,timeout:60000},async()=>{
  const require=createRequire(repo+'/packages/core/tools/package.json'),load=name=>import(pathToFileURL(require.resolve(name)).href);
  const [{Context},{default:SystemPrompt},{default:ToolRuntime},{createScope}]=await Promise.all([load('@deepseek-ai/cordis'),load('@deepseek-ai/dsh-system-prompt'),load('@deepseek-ai/dsh-tools'),load('@deepseek-ai/dsh-scope')]);
  const mcp=await import(pathToFileURL(repo+'/packages/mcp/mcp-client/lib/index.js').href);
  const child=spawn(target,[],{stdio:['ignore','pipe','pipe']});
  const hwnd=Number(String((await once(child.stdout,'data'))[0]).trim());assert.ok(hwnd>0);
  const ctx=new Context(),frames=[],abort=new AbortController();let scope,driver,bridge;
  const agent={id:'cua-acceptance',cancel(){abort.abort();}};
  const original={start:OverlayBridge.prototype.start,write:OverlayBridge.prototype.write,close:OverlayBridge.prototype.close};
  OverlayBridge.prototype.start=async function(){bridge=this;};
  OverlayBridge.prototype.write=function(state){frames.push(structuredClone(state));};
  OverlayBridge.prototype.close=async function(){};
  try {
    await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);
    await ctx.plugin(Object.assign(inner=>{scope=createScope(inner,agent);agent.ctx=scope.ctx;},{inject:['tools','systemPrompt']}));
    await agent.ctx.inject(['tools'],owned=>{driver=owned;});ctx.provide('agents',{list:()=>[agent]});
    await agent.ctx.plugin(mcp,{serverName:'win32',transport:'stdio',command:python,args:['-m','dsh_cua'],env:{PYTHONUTF8:'1'},cwd:process.cwd(),toolCallTimeoutMs:15000,failOnStartupError:true});
    await ctx.plugin(plugin);
    const names=driver.tools.schemas(agent).map(t=>t.name).filter(n=>n.startsWith('mcp__win32__'));
    assert.deepEqual(names.sort(),dshCuaActions.map(n=>'mcp__win32__tool_'+n).sort());
    let n=0;const call=async(name,args)=>{const res=await driver.tools.execute({agent,callId:'live-'+(++n),name:'mcp__win32__tool_'+name,arguments:args,signal:abort.signal});assert.equal(res.isError,false);return resultObjects(res).find(v=>'success' in v);};
    const windows=await call('list_windows',{filter_title:'DSH CUA Adaptation Test'});assert.ok(windows.windows.some(w=>w.hwnd===hwnd),JSON.stringify({hwnd,windows}));
    const found=await call('find_elements',{hwnd,role:'edit',name_contains:'AcceptanceInput'});
    const refs=found.elements;assert.equal(refs.length,1);
    const value=await call('element_action',{ref:refs[0].ref,action:'set_value',text:'acceptance'});assert.equal(value.effect_verified,true);
    assert.equal(frames.at(-1).state,'verified');assert.equal(frames.at(-1).target,'DSH CUA Adaptation Test');assert.equal(frames.at(-1).cursorActive,false);
    const read=await call('skyshot',{hwnd,include_values:true,disable_diff:true});assert.match(JSON.stringify(read),/acceptance/);
    const status=await call('coexistence_status',{});assert.ok(status.success);
    bridge.command('pause');const before=frames.length;const pending=call('skyshot',{hwnd});await new Promise(r=>setTimeout(r,100));
    assert.ok(frames.length>before);assert.equal(frames.at(-1).state,'paused');bridge.command('pause');await pending;
    bridge.command('pause');const stopped=driver.tools.execute({agent,callId:'stopped',name:'mcp__win32__tool_skyshot',arguments:{hwnd},signal:abort.signal});await new Promise(r=>setTimeout(r,50));bridge.command('stop');assert.equal((await stopped).isError,true);
    console.log('LIVE_ACCEPTANCE',JSON.stringify({tools:names.length,filled:true,readBack:true,pauseResume:true,stopBeforeDispatch:true,backend: 'dsh-cua 0.4.0'}));
  } finally {await ctx.fiber.dispose();await scope?.dispose();Object.assign(OverlayBridge.prototype,original);child.kill();}
});
