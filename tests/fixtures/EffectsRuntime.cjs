const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const windows=new Map();
const base={active:true,state:'running',paused:false,canStop:true,canPause:true,action:'测试光效',target:'独立测试窗口',cursorActive:true};
const stationary={x:140,y:110,pulse:0,visible:true};
app.commandLine.appendSwitch('disable-background-networking');
app.setPath('userData',path.join(app.getPath('temp'),'dsh-cu-effects-test-'+process.pid));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message){
  for(let n=0;n<100;n++){if(await check())return;await sleep(20);}
  throw Error(message);
}
async function frames(item,count=5){
  await item.win.webContents.executeJavaScript(`new Promise(resolve=>{let remaining=${count};function frame(){if(--remaining===0)resolve();else requestAnimationFrame(frame);}requestAnimationFrame(frame);})`);
}
function status(item,patch={}){item.win.webContents.send('status',{...base,...patch});}
function reply(item,point=stationary){
  assert.equal(item.pending,1,'A reply must satisfy exactly one pending request');
  item.pending=0;item.win.webContents.send('cursor',point);
}
const measure=item=>item.win.webContents.executeJavaScript(`(() => {
  const surface=document.querySelector('.effects-surface'),cursor=document.querySelector('.cursor-position');
  const edge=document.querySelector('.edge-glow'),aura=document.querySelector('.cursor-aura');
  return {theme:document.documentElement.dataset.theme,edgeShadow:edge&&getComputedStyle(edge).boxShadow,auraBackground:aura&&getComputedStyle(aura).backgroundImage,
    surface:surface?.className,visible:cursor?.dataset.visible,transform:cursor?.style.transform,
    opacity:cursor&&getComputedStyle(cursor).opacity,click:Boolean(document.querySelector('.cursor-click'))};
})()`);
async function expectPosition(item,point=stationary){
  await until(async()=>{const value=await measure(item);return value.visible==='true'&&value.transform===`translate3d(${point.x}px, ${point.y}px, 0px)`;},'Cursor did not show the latest reply');
}
async function waitRequest(item){await until(()=>item.pending===1,'Active renderer never requested a cursor sample');}
async function create(surface){
  const item={win:null,pending:0,requests:0,maxPending:0,ready:false};
  item.win=new BrowserWindow({width:640,height:420,show:false,frame:false,transparent:true,webPreferences:{preload:path.join(root,'ui/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen:true,backgroundThrottling:false}});
  windows.set(item.win.webContents.id,item);
  await item.win.loadFile(path.join(root,'ui/index.html'),{query:{surface}});
  await until(()=>item.ready,'Renderer did not subscribe to status');
  return item;
}
async function expectInactive(item,patch){
  status(item,patch);
  await until(async()=>(await measure(item)).visible==='false','Inactive cursor was not hidden locally');
  // An already dispatched reply may arrive after the status update. It must not
  // revive the aura or start another sampling loop.
  if(item.pending)reply(item);
  const before=item.requests;
  await frames(item);
  const value=await measure(item);
  assert.equal(value.visible,'false','Late cursor reply revived an inactive aura');
  assert.equal(item.requests,before,'Inactive renderer kept requesting samples');
}
async function resume(item,patch={}){
  status(item,patch);await waitRequest(item);reply(item);await expectPosition(item);
  await waitRequest(item);
  await frames(item);
  assert.equal(item.pending,1,'Unanswered stationary sample must remain bounded');
}
app.whenReady().then(async()=>{
  ipcMain.on('ready',event=>{const item=windows.get(event.sender.id);if(item)item.ready=true;});
  ipcMain.on('cursor-request',event=>{
    const item=windows.get(event.sender.id);if(!item)return;
    item.requests++;item.pending++;item.maxPending=Math.max(item.maxPending,item.pending);
  });
  const effects=await create('effects');
  await frames(effects);assert.equal(effects.requests,0,'No status must mean no cursor requests');
  status(effects);await waitRequest(effects);
  await frames(effects,8);
  assert.equal(effects.requests,1,'Renderer sent more requests while the first reply was held');
  assert.equal(effects.maxPending,1,'Cursor pipeline exceeded one outstanding request');
  reply(effects);await expectPosition(effects);await waitRequest(effects);
  // Same-position replies must keep sampling alive; no movement is required to
  // display a stationary pointer on first activation or after resume.
  const beforeStationary=effects.requests;
  reply(effects);await waitRequest(effects);
  assert.ok(effects.requests>beforeStationary,'Stationary response deadlocked sampling');
  const latest={x:501,y:302,pulse:0,visible:true};
  reply(effects,{x:1,y:2,pulse:0,visible:true});
  for(const point of [{x:21,y:22,pulse:0,visible:true},{x:91,y:82,pulse:0,visible:true},latest])effects.win.webContents.send('cursor',point);
  await expectPosition(effects,latest);await waitRequest(effects);
  assert.equal(effects.maxPending,1,'A cursor burst created parallel requests');
  const orangePalette=await measure(effects);
  await effects.win.webContents.executeJavaScript(`window.liveThemeCursor=document.querySelector('.cursor-position');void 0;`);
  status(effects,{theme:'blue'});
  await until(async()=>{
    const value=await measure(effects);
    return value.theme==='blue'&&value.edgeShadow!==orangePalette.edgeShadow&&value.auraBackground!==orangePalette.auraBackground;
  },'Live blue theme did not update both edge and cursor palettes');
  await expectPosition(effects,latest);
  status(effects,{theme:'orange'});
  await until(async()=>{
    const value=await measure(effects);
    return value.theme==='orange'&&value.edgeShadow===orangePalette.edgeShadow&&value.auraBackground===orangePalette.auraBackground;
  },'Live orange theme did not restore both edge and cursor palettes');
  await expectPosition(effects,latest);
  assert.equal(await effects.win.webContents.executeJavaScript(`window.liveThemeCursor===document.querySelector('.cursor-position')`),true,'Live theme switch must preserve the cursor element');
  assert.equal(effects.maxPending,1,'Live theme switch created parallel cursor requests');
  await expectInactive(effects,{state:'paused',paused:true});await resume(effects);
  await expectInactive(effects,{cursorActive:false});await resume(effects);
  await expectInactive(effects,{state:'stopped',active:false,canStop:false});await resume(effects);
  await expectInactive(effects,{state:'idle'});await resume(effects);
  await expectInactive(effects,{canStop:false});await resume(effects);
  status(effects,{state:'pausing',paused:true});reply(effects);await expectPosition(effects);await waitRequest(effects);
  const pausing=await measure(effects);assert.ok(!pausing.surface.includes('is-paused'),'Pausing must continue to display the current action');
  await expectInactive(effects,{active:false});
  const probe=await create('pill');
  await probe.win.webContents.executeJavaScript(`window.cursorProbe=[];window.stopCursorProbe=window.dshStatus.subscribeCursor(point=>{window.cursorProbe.push(point);});void 0;`);
  status(probe);await waitRequest(probe);reply(probe);await waitRequest(probe);
  await probe.win.webContents.executeJavaScript('window.stopCursorProbe()');
  if(probe.pending)reply(probe);
  const beforeCleanup=probe.requests;await frames(probe);
  assert.equal(probe.requests,beforeCleanup,'Final cursor unsubscribe did not stop sampling');
  await probe.win.webContents.executeJavaScript(`window.cursorProbe=[];window.stopCursorProbe=window.dshStatus.subscribeCursor(point=>{window.cursorProbe.push(point);});void 0;`);
  // No new status is sent: the active status retained by the real preload must
  // restart sampling for the newly attached cursor subscriber.
  await waitRequest(probe);reply(probe);
  await until(async()=>probe.win.webContents.executeJavaScript('window.cursorProbe.some(point=>point.visible===true&&point.x===140&&point.y===110)'),'Resubscribe lost the active status snapshot');
  await probe.win.webContents.executeJavaScript('window.stopCursorProbe()');
  if(probe.pending)reply(probe);await frames(probe);
  assert.equal(probe.maxPending,1,'Resubscription exceeded one outstanding request');
  console.log('EFFECTS_ACCEPTANCE',JSON.stringify({builtEffects:true,realPreload:true,oneRequestInFlight:true,latestBurst:true,liveEdgeAndCursorPalettes:true,liveThemePreservesCursor:true,stationaryInitialAndResume:true,pauseStopAndCursorInactiveHide:true,lateReplyIgnored:true,pausingContinues:true,unsubscribeStops:true,resubscribeReplaysStatus:true}));
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
