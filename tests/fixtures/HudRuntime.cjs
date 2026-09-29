const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const root=path.resolve(__dirname,'../..');
const captureDirectory=process.argv[2];
let win;
const commands=[];
const base={active:true,state:'running',paused:false,action:'输入文字',target:'专用测试窗口',canPause:true,canStop:true,agents:1};
app.commandLine.appendSwitch('disable-background-networking');
app.setPath('userData',path.join(app.getPath('temp'),'dsh-cu-hud-test'));
const measure=()=>win.webContents.executeJavaScript(`(() => {
  const heading=document.querySelector('.status-heading');
  const capsule=document.querySelector('.status-capsule');
  const pause=document.querySelector('.status-pause');
  const stop=document.querySelector('.status-stop');
  return heading && {heading:heading.textContent,width:heading.clientWidth,scroll:heading.scrollWidth,
    title:capsule.title,pauseLabel:pause.getAttribute('aria-label'),pauseDisabled:pause.disabled,stopDisabled:stop.disabled,
    headingRight:heading.getBoundingClientRect().right,controlsLeft:pause.getBoundingClientRect().left,
    stopRight:stop.getBoundingClientRect().right,viewport:innerWidth};
})()`);
async function show(patch,heading){
  win.webContents.send('status',{...base,...patch});
  for(let n=0;n<100;n++){
    const view=await measure();
    if(view?.heading===heading){
      assert.ok(view.scroll<=view.width,`${heading} clipped: ${view.scroll}>${view.width}`);
      assert.ok(view.headingRight<=view.controlsLeft,'Heading overlaps controls');
      assert.ok(view.stopRight<=view.viewport,'Stop button overflows');
      assert.ok(view.title.startsWith(heading),'Tooltip must preserve the full status');
      return view;
    }
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw Error('HUD did not render '+heading);
}
async function click(selector){
  await win.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await new Promise(resolve=>setTimeout(resolve,30));
}
async function capture(name){
  if(!captureDirectory)return;
  await fs.mkdir(captureDirectory,{recursive:true});
  await new Promise(resolve=>setTimeout(resolve,250));
  await fs.writeFile(path.join(captureDirectory,name+'.png'),(await win.webContents.capturePage()).toPNG());
}
app.whenReady().then(async()=>{
  const ready=new Promise(resolve=>ipcMain.once('ready',resolve));
  ipcMain.on('command',(_event,value)=>commands.push(value));
  win=new BrowserWindow({width:400,height:68,show:false,frame:false,transparent:true,webPreferences:{preload:path.join(root,'ui/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true}});
  await win.loadFile(path.join(root,'ui/index.html'));
  await ready;
  const receipts={yielded:'已让行，本次未执行',busy:'其他任务占用，本次未执行',verified:'状态检查通过',unconfirmed:'效果未确认',sent:'已发送，效果未确认',preview:'仅检查，未执行'};
  for(const [state,label] of Object.entries(receipts))await show({state},'DSH '+label);
  await show({state:'busy',detail:'本次门控总耗时 1.2 秒；本次调用已被拒绝，插件不会自动重试'},'DSH '+receipts.busy);
  await capture('hud-busy');
  const receipt='检测到内容变化，未逐字核对写入内容';
  const verified=await show({state:'verified',detail:receipt},'DSH 状态检查通过');
  assert.ok(verified.title.includes(receipt));
  const pausing=await show({state:'pausing',paused:true,detail:receipt},'DSH 正在暂停');
  assert.equal(pausing.pauseLabel,'取消暂停');assert.equal(pausing.pauseDisabled,false);assert.ok(!pausing.title.includes(receipt));
  await capture('hud-pausing');
  await click('.status-pause');assert.deepEqual(commands,['pause']);
  const paused=await show({state:'paused',paused:true,detail:receipt},'DSH 已暂停操作');
  assert.equal(paused.pauseLabel,'继续操作');assert.ok(!paused.title.includes(receipt));
  await click('.status-pause');assert.deepEqual(commands,['pause','pause']);
  await show({},'DSH 正在操作电脑');
  await click('.status-stop');assert.deepEqual(commands,['pause','pause','stop']);
  for(const [state,heading] of [['stopping','DSH 正在请求停止'],['stopped','DSH 已请求停止']]){
    const stopped=await show({state,canPause:false,canStop:false,detail:receipt},heading);
    assert.equal(stopped.pauseDisabled,true);assert.equal(stopped.stopDisabled,true);assert.ok(!stopped.title.includes(receipt));
    await click('.status-stop');await click('.status-pause');assert.equal(commands.length,3);
  }
  console.log('HUD_ACCEPTANCE',JSON.stringify({receiptLabels:6,clipped:0,pauseResume:true,disabledControls:true,staleReceiptHidden:true}));
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
