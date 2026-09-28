import test from 'node:test';
import assert from 'node:assert/strict';
import {isDesktopTool,dshCuaActions,resultState,resultPointer} from '../shared.mjs';
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

test('client coordinates, UIA and dry-run receipts never create a physical click halo',()=>{
  for(const method of ['raw_event','ax_press'])for(const dry_run of [false,true])
    assert.equal(resultPointer(tool('click_at'),result({success:true,x:40,y:50,method,dry_run})),undefined);
});
