import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);
const reactRequire = require;
const browserRequire = require;
const esbuild = require('esbuild');
const {Window} = await import('happy-dom');
const window = new Window();
globalThis.window = window;
globalThis.document = window.document;
globalThis.HTMLElement = window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
// Bundled React act uses the browser MessageChannel path; release those test-owned ports at teardown.
const channels = new Set();
const NativeMessageChannel = globalThis.MessageChannel;
globalThis.MessageChannel = class extends NativeMessageChannel {
  constructor() { super(); channels.add(this); }
};
const temp = await fs.mkdtemp(path.join(os.tmpdir(),'dsh-cu-card-test-'));
const client = fileURLToPath(new URL('../client.mjs',import.meta.url));
const bundle = path.join(temp,'client.cjs');
await esbuild.build({stdin:{contents:`export * from ${JSON.stringify(client)}; export {default as React} from 'react'; export {createRoot} from 'react-dom/client'; export {act} from 'react';`,resolveDir:path.dirname(client)},outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent',alias:{react:path.dirname(reactRequire.resolve('react/package.json')),'react-dom':path.dirname(browserRequire.resolve('react-dom/package.json'))}});
const {React,createRoot,act,cardModel,ComputerUseCard,apply} = require(bundle);
after(async()=>{await window.happyDOM.close();for(const channel of channels){channel.port1.close();channel.port2.close();}globalThis.MessageChannel=NativeMessageChannel;await fs.rm(temp,{recursive:true,force:true});});

const toolName = 'mcp__cua_native__get_window_state';
const attachment = Object.freeze({attachmentId:'test-image',mediaType:'image/png',bytes:123,width:160,height:90});
const call = {name:toolName,argsRaw:JSON.stringify({pid:123,window_id:456,text:'SECRET_TYPED_VALUE'})};
const result = (patch={}) => Object.freeze({kind:'tool-result',callId:'call-1',call,callTime:1000,time:3500,isError:false,content:[],subCalls:[],...patch});
function useDisclosure() {
  const [expanded,setExpanded] = React.useState(false);
  return {expanded,setExpanded,toggle:()=>setExpanded(value=>!value)};
}
async function mount(props) {
  const container = document.createElement('div');document.body.append(container);
  const root = createRoot(container);
  const defaults = {toolName,phase:'result',block:result(),useDisclosure,callId:'call-1'};
  await act(async()=>root.render(React.createElement(ComputerUseCard,{...defaults,...props})));
  return {container,async render(next){await act(async()=>root.render(React.createElement(ComputerUseCard,{...defaults,...next})));},async click(label){const button=[...container.querySelectorAll('button')].find(el=>el.textContent.includes(label));assert.ok(button,`button ${label}`);await act(async()=>button.click());},async dispose(){await act(async()=>root.unmount());container.remove();}};
}

test('card stages use the official call shape and never report completion as verified success',()=>{
  assert.equal(cardModel({phase:'preparing',block:{name:toolName},toolName}).state,'preparing');
  assert.equal(cardModel({phase:'start',block:{name:toolName,argsRaw:call.argsRaw},toolName}).target,'进程 123 · 窗口 456');
  const model = cardModel({phase:'result',block:result(),toolName});
  assert.equal(model.label,'已返回');assert.equal(model.duration,2500);
  assert.equal(cardModel({phase:'result',block:result({call:null,callTime:null}),toolName}).duration,null);
});

test('result target metadata is parsed from actual tool-result content, not backend value or arbitrary text',()=>{
  const model = cardModel({phase:'result',toolName,block:result({content:[{type:'text',text:JSON.stringify({window_title:'测试窗口',elements:[{value:'SECRET_VALUE'}]})}]})});
  assert.equal(model.target,'测试窗口');assert.ok(!JSON.stringify(model).includes('SECRET_VALUE'));
  assert.equal(cardModel({phase:'result',toolName,block:result({call:null,content:[{type:'text',text:'secret file:///C:/screenshot.png'}]})}).images.length,0);
});

test('structured tool errors and host interruptions have distinct states',()=>{
  assert.equal(cardModel({phase:'result',toolName,block:result({isError:true,error:{code:'interrupted'}})}).state,'stopped');
  assert.equal(cardModel({phase:'result',toolName,block:result({isError:true,error:{code:'interrupted'}})}).label,'已请求停止');
  assert.equal(cardModel({phase:'result',toolName,block:result({content:[{type:'text',text:'{"ok":false}' }]})}).state,'error');
  assert.equal(cardModel({phase:'result',toolName,block:result({isError:true})}).state,'error');
});

test('interrupted Cua card describes requested cancellation without claiming physical input stopped',async()=>{
  const card=await mount({toolName:'mcp__cua_native__drag',block:result({isError:true,error:{code:'interrupted'}})});
  try {
    assert.match(card.container.textContent,/已请求停止/);
    assert.doesNotMatch(card.container.textContent,/本次操作已中止|已停止/);
    assert.ok([...card.container.querySelectorAll('[title]')].some(el=>el.title==='已请求停止，后续操作已取消；已发出的动作可能正在收尾。'));
    await card.click('拖动');
    const detail=card.container.querySelector('p');
    assert.equal(detail.textContent,'后续操作已取消。');
    assert.match(detail.title,/已发出的动作可能正在收尾/);
  } finally {await card.dispose();}
});

test('only durable image attachments are eligible for thumbnails',()=>{
  const model = cardModel({phase:'result',toolName,block:result({content:[{type:'image',attachment},{type:'image',data:'RAW_BASE64',mimeType:'image/png'},{type:'text',text:'{"screenshot_path":"file:///private"}'},{type:'image',attachment:{uri:'file:///private'}}]})});
  assert.deepEqual(model.images,[attachment]);
});

test('dsh-cua card renders bounded receipt details without raw notes or input',async()=>{
  const name='mcp__win32__tool_type_text';
  const block=result({call:{name,argsRaw:'{"hwnd":456,"text":"SECRET_TYPED_VALUE"}'},content:[{type:'text',text:JSON.stringify({success:true,effect_verified:true,foreground_changed:true,activated_target:true,effect_note:'SECRET_NOTE'})}]});
  const card=await mount({toolName:name,block});
  try {
    assert.match(card.container.textContent,/状态检查通过/);
    assert.doesNotMatch(card.container.textContent,/效果已确认|写入成功/);
    await card.click('输入文字');
    assert.match(card.container.textContent,/检测到内容变化，未逐字核对写入内容/);
    assert.match(card.container.textContent,/目标窗口被带到前台/);
    assert.doesNotMatch(card.container.innerHTML,/SECRET_/);
  } finally {await card.dispose();}
});

test('real React card renders a concise collapsed row and inspect preserves host access to original records',async()=>{
  let inspected=0;
  const card=await mount({inspect:()=>inspected++});
  try {
    assert.match(card.container.textContent,/观察窗口.*进程 123 · 窗口 456.*已返回/);
    assert.equal(card.container.querySelector('button').getAttribute('aria-expanded'),'false');
    assert.ok(!card.container.textContent.includes('SECRET_TYPED_VALUE'));
    await card.click('观察窗口');assert.match(card.container.textContent,/2.5 秒/);
    await card.click('查看原始记录');assert.equal(inspected,1);
    await card.click('观察窗口');assert.equal(card.container.querySelector('button').getAttribute('aria-expanded'),'false');
  } finally {await card.dispose();}
});

test('failed dsh-cua cards keep failure guidance alongside foreground facts and ignore returned titles',async()=>{
  const name='mcp__win32__tool_element_action';
  const block=result({call:{name,argsRaw:'{"hwnd":456,"action":"press"}'},content:[{type:'text',text:JSON.stringify({success:false,reason:'action_failed',hwnd:456,title:'PRIVATE_ERROR',activated_target:true,error:'PRIVATE_BODY'})}]});
  let inspected=0;
  const card=await mount({toolName:name,block,inspect:()=>inspected++});
  try {
    assert.match(card.container.textContent,/窗口 456/);
    await card.click('点击控件');
    assert.match(card.container.textContent,/目标窗口被带到前台/);
    assert.match(card.container.textContent,/操作未成功，详细原因见原始记录/);
    assert.doesNotMatch(card.container.innerHTML,/PRIVATE_/);
    await card.click('查看原始记录');assert.equal(inspected,1);
    await card.render({toolName:name,block:result({call:{name,argsRaw:'{"hwnd":456}'},content:[{type:'text',text:JSON.stringify({success:false,reason:'user-active',hwnd:456,title:'PRIVATE_REFUSAL'})}]})});
    assert.match(card.container.textContent,/已让行，本次未执行/);
    assert.match(card.container.textContent,/窗口 456/);
    assert.doesNotMatch(card.container.innerHTML,/PRIVATE_/);
  } finally {await card.dispose();}
});

test('screenshot loads lazily through the exact authorized attachment loader only after expansion',async()=>{
  const loads=[];
  const block=result({content:[{type:'image',attachment},{type:'text',text:'{"screenshot_path":"file:///secret"}'}]});
  const card=await mount({block,loadImage:async ref=>{loads.push(ref);return 'blob:session-authorized-image';}});
  try {
    assert.equal(loads.length,0);await card.click('观察窗口');
    assert.deepEqual(loads,[attachment]);assert.equal(card.container.querySelector('img').getAttribute('src'),'blob:session-authorized-image');
    assert.ok(!card.container.innerHTML.includes('file:///secret'));
  } finally {await card.dispose();}
});

test('failed image loads keep inspect available and never expose an error body',async()=>{
  const card=await mount({block:result({content:[{type:'image',attachment}]}),loadImage:()=>Promise.reject(new Error('SECRET_LOADER_ERROR')),inspect:()=>{}});
  try {await card.click('观察窗口');assert.match(card.container.textContent,/截图暂时无法加载/);assert.ok(!card.container.textContent.includes('SECRET_LOADER_ERROR'));assert.match(card.container.textContent,/查看原始记录/);}
  finally {await card.dispose();}
});

test('late screenshot resolution from a collapsed or replaced card cannot attach the old image',async()=>{
  let resolve;
  const loader=()=>new Promise(done=>{resolve=done;});
  const card=await mount({block:result({content:[{type:'image',attachment}]}),loadImage:loader});
  try {
    await card.click('观察窗口');await card.click('观察窗口');
    await act(async()=>resolve('blob:late-image'));assert.equal(card.container.querySelector('img'),null);
  } finally {await card.dispose();}
});

test('error cards suppress typed values and raw errors while preserving the original result object',async()=>{
  const block=result({isError:true,error:{name:'Failure',code:'FAILED',reason:'SECRET_REASON'},content:[{type:'text',text:'SECRET_RAW_ERROR'}]});
  const before=JSON.stringify(block);
  const card=await mount({block,inspect:()=>{}});
  try {await card.click('观察窗口');assert.match(card.container.textContent,/出现错误/);assert.ok(!card.container.textContent.includes('SECRET_'));assert.equal(JSON.stringify(block),before);}
  finally {await card.dispose();}
});

test('registers exact tool keys in the existing slot without declaring duplicate children',()=>{
  const registrations=[];
  const ctx={slots:{inject(name,fn){assert.equal(name,'tool.call.toolview');[...fn()];},register(spec,component){registrations.push(spec);assert.equal(component,ComputerUseCard);return spec;}}};
  apply(ctx);
  assert.ok(registrations.length>=39);assert.equal(new Set(registrations.map(r=>r.key)).size,registrations.length);
  assert.ok(registrations.some(r=>r.key==='mcp__wincu__windows_computer_use_snapshot'));
  assert.ok(registrations.every(r=>r.name==='tool.call.toolview' && !r.children));
});
