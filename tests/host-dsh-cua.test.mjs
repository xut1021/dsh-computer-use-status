import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {OverlayBridge} from '../bridge.mjs';
import * as plugin from '../index.mjs';
import {resultObjects,dshCuaActions} from '../shared.mjs';
const repo=process.env.DSH_STATUS_TEST_REPO,python=process.env.DSH_CUA_PYTHON,target=process.env.DSH_CUA_TEST_TARGET;
const missing=['DSH_STATUS_TEST_REPO','DSH_CUA_PYTHON','DSH_CUA_TEST_TARGET'].filter(name=>!process.env[name]);
if(missing.length)throw Error('Set '+missing.join(', ')+' before running the live dsh-cua host test');
const until=async predicate=>{for(let i=0;i<100 && !predicate();i++)await delay(5);assert.ok(predicate());};
const controlValue=(shot,name)=>{
  assert.equal(typeof shot.text,'string');
  const pattern=new RegExp('^\\d+\\s+edit '+name+'(?: Value: (.*?))?(?: \\([^)]*\\))?$');
  const matches=shot.text.split(/\r?\n/).map(line=>line.match(pattern)).filter(Boolean);
  assert.equal(matches.length,1,'Expected exactly one owned '+name+' control');return matches[0][1]??'';
};

test('DSH 0.1.7 host + real dsh-cua MCP + owned Windows controls', {timeout:60000},async()=>{
  const require=createRequire(repo+'/packages/core/tools/package.json'),load=name=>import(pathToFileURL(require.resolve(name)).href);
  const [{Context},{default:SystemPrompt},{default:ToolRuntime},{createScope}]=await Promise.all([load('@deepseek-ai/cordis'),load('@deepseek-ai/dsh-system-prompt'),load('@deepseek-ai/dsh-tools'),load('@deepseek-ai/dsh-scope')]);
  const mcp=await import(pathToFileURL(repo+'/packages/mcp/mcp-client/lib/index.js').href);
  const child=spawn(target,[],{stdio:['ignore','pipe','pipe']});
  const hwnd=Number(String((await once(child.stdout,'data'))[0]).trim());assert.ok(hwnd>0);
  const ctx=new Context(),frames=[],abort=new AbortController();let scope,driver,bridge,dispatches=0;
  const agent={id:'cua-acceptance',cancel(){abort.abort();}};
  const original={start:OverlayBridge.prototype.start,write:OverlayBridge.prototype.write,close:OverlayBridge.prototype.close};
  OverlayBridge.prototype.start=async function(){bridge=this;};
  OverlayBridge.prototype.write=function(state){frames.push(structuredClone(state));};
  OverlayBridge.prototype.close=async function(){};
  try {
    await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);
    await ctx.plugin(Object.assign(inner=>{scope=createScope(inner,agent);agent.ctx=scope.ctx;},{inject:['tools','systemPrompt']}));
    await agent.ctx.inject(['tools'],owned=>{driver=owned;});ctx.provide('agents',{list:()=>[agent]});
    // Count registered tool body calls, forwarding unchanged to the real MCP executor.
    const register=driver.tools.register;
    driver.tools.register=function(definition){
      if(!definition.name.startsWith('mcp__win32__'))return register.call(this,definition);
      return register.call(this,{...definition,execute:async function(...args){dispatches++;return definition.execute.apply(this,args);}});
    };
    try{await agent.ctx.plugin(mcp,{serverName:'win32',transport:'stdio',command:python,args:['-m','dsh_cua'],env:{PYTHONUTF8:'1'},cwd:process.cwd(),toolCallTimeoutMs:15000,failOnStartupError:true});}
    finally{driver.tools.register=register;}
    await ctx.plugin(plugin);
    const names=driver.tools.schemas(agent).map(t=>t.name).filter(n=>n.startsWith('mcp__win32__'));
    assert.deepEqual(names.sort(),dshCuaActions.map(n=>'mcp__win32__tool_'+n).sort());
    let n=0;const call=async(name,args,success=true)=>{const res=await driver.tools.execute({agent,callId:'live-'+(++n),name:'mcp__win32__tool_'+name,arguments:args,signal:abort.signal});assert.equal(res.isError,false);const receipt=resultObjects(res).find(v=>v && typeof v==='object' && 'success' in v);assert.ok(receipt,'Missing backend receipt for '+name);assert.equal(receipt.success,success,'Backend success for '+name);return receipt;};
    const windows=await call('list_windows',{filter_title:'DSH CUA Adaptation Test'});assert.ok(windows.windows.some(w=>w.hwnd===hwnd),JSON.stringify({hwnd,windows}));
    const found=await call('find_elements',{hwnd,role:'edit',name_contains:'AcceptanceInput'});
    const refs=found.elements;assert.equal(refs.length,1);
    const value=await call('element_action',{ref:refs[0].ref,action:'set_value',text:'acceptance'});assert.equal(value.effect_verified,true);
    assert.equal(frames.at(-1).state,'verified');assert.equal(frames.at(-1).target,'DSH CUA Adaptation Test');assert.equal(frames.at(-1).cursorActive,false);
    const read=await call('skyshot',{hwnd,include_values:true,disable_diff:true});assert.equal(controlValue(read,'AcceptanceInput'),'acceptance');assert.equal(controlValue(read,'Outcome'),'Ready');
    const buttons=await call('find_elements',{hwnd,role:'button',name_contains:'Verify'});assert.equal(buttons.elements.length,1);assert.equal(buttons.elements[0].name,'Verify');
    const press=await call('element_action',{ref:buttons.elements[0].ref,action:'press'});assert.equal(press.action_sent,true);assert.equal(press.effect_verified,null);assert.equal(frames.at(-1).state,'unconfirmed');
    const pressed=await call('skyshot',{hwnd,include_values:true,disable_diff:true});assert.equal(controlValue(pressed,'Outcome'),'Verified acceptance');
    const unchanged=await call('element_action',{ref:refs[0].ref,action:'set_value',text:'acceptance'},false);assert.equal(unchanged.action_sent,true);assert.equal(unchanged.effect_verified,false);assert.equal(unchanged.reason,'state_unchanged');assert.equal(frames.at(-1).state,'error');
    const unchangedRead=await call('skyshot',{hwnd,include_values:true,disable_diff:true});assert.equal(controlValue(unchangedRead,'AcceptanceInput'),'acceptance');
    const status=await call('coexistence_status',{});assert.ok(status.success);assert.equal(dispatches,n);
    bridge.command('pause');const before=dispatches;const pending=call('skyshot',{hwnd});await until(()=>frames.at(-1).id.endsWith(':live-'+n));await delay(100);
    assert.equal(frames.at(-1).state,'paused');assert.equal(dispatches,before);bridge.command('pause');await pending;assert.equal(dispatches,before+1);
    bridge.command('pause');const beforeStop=dispatches;const stopped=driver.tools.execute({agent,callId:'stopped',name:'mcp__win32__tool_skyshot',arguments:{hwnd},signal:abort.signal});await until(()=>frames.at(-1).id.endsWith(':stopped'));await delay(50);assert.equal(dispatches,beforeStop);bridge.command('stop');const stoppedResult=await stopped;assert.equal(stoppedResult.isError,true);assert.equal(stoppedResult.error.message,'COMPUTER_USE_STOPPED');assert.equal(dispatches,beforeStop);assert.equal(frames.at(-1).state,'stopped');
    console.log('LIVE_ACCEPTANCE',JSON.stringify({tools:names.length,filled:true,readBack:true,pressUnconfirmed:true,pressReadBack:true,sameValueNoEffect:true,pauseResume:true,stopBeforeDispatch:true,dispatches,backend: 'dsh-cua 0.4.0'}));
  } finally {await ctx.fiber.dispose();await scope?.dispose();Object.assign(OverlayBridge.prototype,original);child.kill();}
});
