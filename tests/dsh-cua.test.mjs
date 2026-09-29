import test from 'node:test';
import assert from 'node:assert/strict';
import {isDesktopTool,dshCuaActions,resultState,resultPointer,resultDetail} from '../shared.mjs';
import {cardModel} from '../client.mjs';
import {StatusController} from '../controller.mjs';
const tool=n=>'mcp__win32__tool_'+n;
const result=value=>({isError:false,value:{structuredContent:value,content:[{type:'text',text:JSON.stringify(value)}]}});

test('all 19 dsh-cua tools admitted; unrelated win32 tools rejected',()=>{
  assert.equal(dshCuaActions.length,19);
  for(const action of dshCuaActions)assert.ok(isDesktopTool(tool(action)));
  assert.equal(isDesktopTool(tool('unknown')),false);
  assert.equal(isDesktopTool('mcp__other__tool_click_at'),false);
});

test('receipts distinguish refusal, failure, verification, delivery and preview',()=>{
  for(const [value,state] of [
    [{success:false,reason:'user-active'},'yielded'],
    [{success:false,arbiter:{reason:'arbiter-busy'}},'busy'],
    [{success:false,error:'PRIVATE_ERROR'},'error'],
    [{success:true,effect_verified:false},'error'],
    [{success:true,action_sent:true,effect_verified:true},'verified'],
    [{success:true,action_sent:true,effect_verified:null},'unconfirmed'],
    [{success:true,action_sent:true},'sent'],
    [{success:true,dry_run:true,action_sent:false},'preview'],
    [{success:true},'unconfirmed'],
  ]) {
    assert.equal(resultState(tool('click_at'),result(value)),state);
    const card=cardModel({phase:'result',toolName:tool('click_at'),block:{call:{argsRaw:'{"hwnd":456}'},content:[{type:'text',text:JSON.stringify(value)}]}});
    assert.equal(card.state,state);assert.equal(card.target,'窗口 456');
    assert.doesNotMatch(JSON.stringify(card),/PRIVATE_ERROR/);
  }
  assert.equal(resultState(tool('skyshot'),result({success:true})), 'done');
});

test('HWND and element refs retain window names, not text or values',async()=>{
  const frames=[],controller=new StatusController(s=>frames.push(s));
  const agent={id:'test',cancel(){}},run=(id,name,args,value)=>{const exec={agent,callId:id,name:tool(name),arguments:args};controller.begin(exec);controller.result(exec,result(value));return exec;};
  run('1','list_windows',{}, {success:true,windows:[{hwnd:456,title:'适配验收'}]});
  run('2','find_elements',{hwnd:456},{success:true,elements:[{ref:'r1',name:'PRIVATE_NAME',value:'PRIVATE_VALUE'}]});
  const exec=run('3','element_action',{ref:'r1',action:'set_value',text:'PRIVATE_TEXT'},{success:true,effect_verified:true});
  assert.equal(frames.at(-1).target,'适配验收');assert.equal(frames.at(-1).action,'填写输入框');
  assert.equal(frames.at(-1).state,'verified');assert.equal(frames.at(-1).cursorActive,false);
  controller.idle(agent);assert.equal(frames.at(-1).state,'verified');
  assert.doesNotMatch(JSON.stringify(frames),/PRIVATE_/);
});

test('dsh-cua pause blocks dispatch, stop cancels and releases the pending call',async()=>{
  const frames=[],controller=new StatusController(s=>frames.push(s));let cancels=0;
  const abort=new AbortController(),agent={id:'a',cancel(){cancels++;abort.abort();}};
  const exec={agent,callId:'1',name:tool('skyshot'),arguments:{hwnd:456},signal:abort.signal};
  controller.begin(exec);controller.togglePause();let sent=false;
  const pending=controller.gate(exec).then(()=>{sent=true;});
  await new Promise(r=>setTimeout(r,20));assert.equal(sent,false);
  controller.stop();await assert.rejects(pending,/STOPPED/);assert.equal(cancels,1);
  assert.equal(frames.at(-1).state,'stopped');
});

test('refusal remains visible after idle and cannot poison targets',()=>{
  const frames=[],controller=new StatusController(s=>frames.push(s)),agent={id:'a',cancel(){}};
  const exec={agent,callId:'1',name:tool('click_at'),arguments:{hwnd:456}};
  controller.begin(exec);controller.result(exec,result({success:false,reason:'user-active',hwnd:456,title:'PRIVATE_ERROR'}));controller.idle(agent);
  assert.equal(frames.at(-1).state,'yielded');assert.doesNotMatch(JSON.stringify(frames),/PRIVATE_ERROR/);
});

test('dsh-cua backend policy blocks even Wincu-shaped physical coordinates throughout dispatch',async()=>{
  const physical={success:true,action:'click',method:'sendinput',x:-40,y:50};
  assert.deepEqual(resultPointer('mcp__wincu__windows_computer_use_click',result(physical)),{x:-40,y:50,space:'screen-physical',action:'click'});
  const frames=[],controller=new StatusController(s=>frames.push(s)),agent={id:'a',cancel(){}};
  for(const name of dshCuaActions){
    assert.equal(resultPointer(tool(name),result(physical)),undefined);
    const exec={agent,callId:name,name:tool(name),arguments:{hwnd:456}};
    controller.begin(exec);await controller.gate(exec);controller.result(exec,result(physical));
  }
  assert.equal(frames.length,19*3);
  for(const frame of frames){assert.equal(frame.cursorActive,false);assert.equal(frame.pointer,undefined);}
  for(const value of [
    {success:true,action:'click',x:40,y:50,method:'raw_event'},
    {success:true,action:'press',method:'ax_press',element:{point:{x:40,y:50},rect:{left:30,top:40,right:50,bottom:60}}},
    {success:true,...physical,dry_run:true},
    {success:false,reason:'user-active',screen_x:40,screen_y:50},
  ])assert.equal(resultPointer(tool('click_at'),result(value)),undefined);
});

test('effect tri-state copy and press uncertainty agree across card and controller',()=>{
  const frames=[],controller=new StatusController(s=>frames.push(s)),agent={id:'a',cancel(){}};
  for(const [action,value,state,label] of [
    ['set_value',{success:true,effect_verified:true},'verified','状态检查通过'],
    ['set_value',{success:false,effect_verified:false,reason:'state_unchanged'},'error','出现错误'],
    ['press',{success:true,action_sent:true,effect_verified:null,effect_note:'PRIVATE_NOTE'},'unconfirmed','效果未确认'],
    ['press',{success:false,effect_verified:false,reason:'action_failed'},'error','出现错误'],
  ]){
    const name=tool('element_action'),exec={agent,callId:state,name,arguments:{ref:'r1',action}};
    controller.begin(exec);controller.result(exec,result(value));
    const card=cardModel({phase:'result',toolName:name,block:result(value).value});
    assert.equal(card.state,state);assert.equal(card.label,label);assert.equal(frames.at(-1).state,state);
    assert.equal(card.detail,frames.at(-1).detail);assert.doesNotMatch(JSON.stringify(card),/PRIVATE_NOTE/);
  }
  const text=resultDetail(tool('type_text'),result({success:true,effect_verified:true,effect_note:'PRIVATE_TEXT'}));
  assert.equal(text,'检测到内容变化，未逐字核对写入内容');
});

test('refusal timings are receipt-time numeric facts, not mouse or live queue claims',()=>{
  const name=tool('click_at');
  const detail=resultDetail(name,result({success:false,reason:'user-active',last_input_age_ms:1200,waited_ms:3000,error:'PRIVATE_ERROR'}));
  assert.equal(detail,'调用结束时，最近一次用户输入距检查时 1.2 秒；本次门控总耗时 3.0 秒；本次调用已被拒绝，插件不会自动重试');
  assert.equal(resultDetail(name,result({success:false,arbiter:{reason:'user-active',last_input_age_ms:1200,waited_ms:3000}})),detail);
  const busy=resultDetail(name,result({success:false,reason:'arbiter-busy',waited_ms:3000,last_input_age_ms:1200}));
  assert.equal(busy,'本次门控总耗时 3.0 秒；本次调用已被拒绝，插件不会自动重试');
  for(const age of [undefined,null,-1,Infinity,'PRIVATE_VALUE'])
    assert.equal(resultDetail(name,result({success:false,reason:'user-active',last_input_age_ms:age,waited_ms:age})),'本次调用已被拒绝，插件不会自动重试');
  const frames=[],controller=new StatusController(s=>frames.push(s)),agent={id:'a',cancel(){}};
  const exec={agent,callId:'1',name,arguments:{}};
  controller.begin(exec);controller.result(exec,result({success:false,reason:'user-active',last_input_age_ms:1200,waited_ms:3000}));
  controller.idle(agent);assert.equal(frames.at(-1).detail,detail);
});

test('foreground notices distinguish target activation from a general foreground change',()=>{
  const name=tool('element_action');
  assert.equal(resultDetail(name,result({success:true,effect_verified:true,foreground_changed:true,activated_target:true})),'本次操作期间，目标窗口被带到前台');
  assert.equal(resultDetail(name,result({success:true,effect_verified:true,foreground_changed:true,activated_target:false})),'本次操作期间，前台窗口发生变化');
  assert.equal(resultDetail(name,result({success:true,effect_verified:true,foreground_changed:false,activated_target:false})),'');
  assert.equal(resultDetail('mcp__wincu__windows_computer_use_click',result({foreground_changed:true})),'');
});
