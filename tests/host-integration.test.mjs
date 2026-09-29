import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {spawnSync} from 'node:child_process';
import {OverlayBridge} from '../bridge.mjs';
import * as plugin from '../index.mjs';
const repo=process.env.DSH_STATUS_TEST_REPO;
if(!repo)throw Error('Set DSH_STATUS_TEST_REPO to a built DSH source checkout');
const require=createRequire(repo+'/packages/core/tools/package.json');
const load=name=>import(pathToFileURL(require.resolve(name)).href);
const [{Context},{default:SystemPrompt},{default:ToolRuntime},{createScope}]=await Promise.all([
  load('@deepseek-ai/cordis'),load('@deepseek-ai/dsh-system-prompt'),load('@deepseek-ai/dsh-tools'),load('@deepseek-ai/dsh-scope'),
]);
const {updateVolatile}=await import(pathToFileURL(repo+'/vendor/cosmokit/lib/index.js').href);
const timeoutPolicy=await import(pathToFileURL(repo+'/packages/guard/timeout-policy/lib/index.js').href);
const until=async predicate=>{for(let i=0;i<100 && !predicate();i++)await delay(5);assert.ok(predicate());};
const desktopName='mcp__cua_native__click';

test('official theme schema defaults to orange, accepts blue and rejects unknown palettes',()=>{
  const parse=value=>plugin.Config['~standard'].validate(value);
  assert.equal(parse({}).value.theme.get(),'orange');
  assert.equal(parse({theme:'orange'}).value.theme.get(),'orange');
  assert.equal(parse({theme:'blue'}).value.theme.get(),'blue');
  assert.ok(parse({theme:'green'}).issues?.length,'Unsupported theme must fail schema validation');
});

test('official scoped ToolRuntime: lifecycle, pause, timeout, approval, stop and immutable result',async()=>{
  const root=new Context(),frames=[],bridges=[];
  const previousIndicator=process.env.WCU_INDICATOR;
  const original={start:OverlayBridge.prototype.start,write:OverlayBridge.prototype.write,close:OverlayBridge.prototype.close};
  OverlayBridge.prototype.start=async function(){if(!bridges.includes(this))bridges.push(this);};
  OverlayBridge.prototype.write=function(state){frames.push(structuredClone(state));};
  OverlayBridge.prototype.close=async function(){};
  let id=0,dispatches=0;const agents=[];
  const makeAgent=()=>{
    const abort=new AbortController(),agent={id:'agent-'+(++id),abort,cancels:0,cancel(cause,options){this.cancels++;assert.deepEqual(cause,{kind:'user'});assert.deepEqual(options,{keepInbox:true});this.abort.abort();}};
    const scope=createScope(root.isolate('tools').isolate('systemPrompt'),agent);
    agent.ctx=scope.ctx;agent.dispose=()=>scope.dispose();agents.push(agent);return agent;
  };
  const ready=async agent=>{
    await agent.ctx.plugin(SystemPrompt);
    await agent.ctx.plugin(ToolRuntime);
    await agent.ctx.plugin(timeoutPolicy);
    await agent.ctx.inject(['tools'],scope=>{agent.driver=scope;});
    agent.driver.tools.register({name:desktopName,description:'owned fixture',parameters:{type:'object',properties:{}},timeoutMs:30,
      output:{schema:{type:'object'},render:(_args,value)=>[{type:'text',text:JSON.stringify(value)}]},
      execute:async()=>{dispatches++;return {ok:true,receipt:dispatches};},
    });
    agent.driver.tools.register({name:'ordinary_fixture',description:'not desktop',parameters:{type:'object',properties:{}},
      output:{schema:{type:'object'},render:()=>[]},execute:async()=>({ok:true}),
    });
  };
  const run=(agent,callId,name=desktopName)=>agent.driver.tools.execute({agent,callId,name,arguments:{pid:123,window_id:456,text:'PRIVATE_INPUT'},signal:agent.abort.signal});
  const old=makeAgent(),pending=makeAgent(),next=makeAgent();
  try{
    await ready(old);root.provide('agents',{list:()=>[old,pending]});
    assert.equal(root.get('tools'),undefined);
    const outer=await Promise.race([root.plugin(plugin),delay(500).then(()=>{throw Error('ROOT_INIT_STALLED');})]);
    assert.equal(outer.config.theme.get(),'orange');
    const beforeActive=frames.length;
    outer.ctx.emit('loader/volatile-update',[['theme']]);
    assert.equal(frames.length,beforeActive,'An inactive theme update must not open a status window');
    assert.equal(process.env.WCU_INDICATOR,'0');
    const inherited=spawnSync(process.execPath,['-e','process.stdout.write(process.env.WCU_INDICATOR || "")'],{encoding:'utf8',windowsHide:true});
    assert.equal(inherited.status,0);assert.equal(inherited.stdout,'0');
    let result=await run(old,'first');assert.equal(result.isError,false);assert.equal(dispatches,1);assert.equal(frames.at(-1).state,'done');
    assert.equal(bridges.length,1);const bridge=bridges[0];
    assert.equal(frames.at(-1).theme,'orange');
    // Use the same reference commit and own-fiber event as the official Loader:
    // changing a volatile palette keeps the running bridge and tool participants.
    updateVolatile(outer.config.theme,plugin.Config['~standard'].validate({theme:'blue'}).value.theme);
    outer.ctx.emit('loader/volatile-update',[['theme']]);
    assert.equal(frames.at(-1).theme,'blue');assert.equal(frames.at(-1).state,'done');
    assert.equal(bridges.length,1);assert.equal(dispatches,1);
    updateVolatile(outer.config.theme,plugin.Config['~standard'].validate({theme:'orange'}).value.theme);
    outer.ctx.emit('loader/volatile-update',[['theme']]);assert.equal(frames.at(-1).theme,'orange');
    bridge.command('pause');assert.equal(frames.at(-1).state,'paused');
    const paused=run(old,'paused');await until(()=>frames.at(-1).id.endsWith(':paused'));
    await delay(65);assert.equal(dispatches,1); // Waiting must not consume the underlying 30ms tool budget.
    bridge.command('pause');result=await paused;assert.equal(result.isError,false);assert.equal(dispatches,2);
    const observed=frames.length;await run(old,'ordinary','ordinary_fixture');assert.equal(frames.length,observed);
    const deny=old.driver.on('tools/pre-execute',async()=>({kind:'deny',reason:'FIXTURE_DENIAL'}));
    result=await run(old,'denied');assert.equal(result.isError,true);assert.equal(dispatches,2);assert.equal(frames.length,observed);deny();
    await ready(next);await root.parallel('agent/created',{agent:next});await root.parallel('agent/created',{agent:next});
    result=await run(next,'new');assert.equal(result.isError,false);assert.equal(dispatches,3);
    assert.equal(frames.at(-1).agents,2);
    await old.ctx.parallel('agent/status',{agent:old,status:'idle'});assert.equal(frames.at(-1).agents,1);
    bridge.command('pause');const stop=run(next,'stopped');await until(()=>frames.at(-1).id.endsWith(':stopped'));
    bridge.command('stop');result=await stop;assert.equal(result.isError,true);assert.equal(dispatches,3);assert.equal(next.cancels,1);assert.equal(old.cancels,0);assert.equal(frames.at(-1).state,'stopped');
    assert.ok(Object.isFrozen(result));assert.doesNotMatch(JSON.stringify(frames),/PRIVATE_INPUT|FIXTURE_DENIAL/);
    await next.ctx.parallel('agent/status',{agent:next,status:'idle'});assert.equal(frames.at(-1).active,false);assert.equal(frames.at(-1).canStop,false);
    await old.dispose();await root.parallel('agent/disposed',{agent:old});
    await outer.dispose();assert.equal(root.get('tools'),undefined);assert.equal(process.env.WCU_INDICATOR,previousIndicator);
  }finally{
    await root.fiber.dispose();for(const agent of agents)await agent.dispose();Object.assign(OverlayBridge.prototype,original);
  }
});

test('official runtime cancels an in-flight action and waits for cooperative cleanup',async()=>{
  const ctx=new Context(),frames=[];let bridge,agent,scope,driver,bodyStarted=false,cleanupFinished=false;
  const original={start:OverlayBridge.prototype.start,write:OverlayBridge.prototype.write,close:OverlayBridge.prototype.close};
  OverlayBridge.prototype.start=async function(){bridge=this;};OverlayBridge.prototype.write=state=>frames.push(structuredClone(state));OverlayBridge.prototype.close=async()=>{};
  const abort=new AbortController();
  try{
    await ctx.plugin(SystemPrompt);await ctx.plugin(ToolRuntime);
    agent={id:'in-flight',cancel(){abort.abort();}};
    await ctx.plugin(Object.assign(inner=>{scope=createScope(inner,agent);agent.ctx=scope.ctx;},{inject:['tools','systemPrompt']}));
    await agent.ctx.inject(['tools'],owned=>{driver=owned;});ctx.provide('agents',{list:()=>[agent]});
    driver.tools.register({name:desktopName,description:'cooperative fixture',parameters:{type:'object'},output:{schema:{type:'object'},render:()=>[]},execute:async(_args,exec)=>{
      bodyStarted=true;await new Promise(resolve=>exec.signal.addEventListener('abort',resolve,{once:true}));await delay(15);cleanupFinished=true;return{ok:true};
    }});
    const outer=await ctx.plugin(plugin);
    const execution=driver.tools.execute({agent,callId:'active',name:desktopName,arguments:{},signal:abort.signal});
    await until(()=>bodyStarted);bridge.command('pause');assert.equal(frames.at(-1).state,'pausing');
    bridge.command('stop');assert.equal(frames.at(-1).state,'stopping');assert.equal(cleanupFinished,false);
    const result=await execution;assert.equal(cleanupFinished,true);assert.equal(result.isError,true);assert.equal(frames.at(-1).state,'stopped');
    await agent.ctx.parallel('agent/status',{agent,status:'idle'});assert.equal(frames.at(-1).active,false);
    await outer.dispose();
  }finally{await ctx.fiber.dispose();await scope?.dispose();Object.assign(OverlayBridge.prototype,original);}
});
