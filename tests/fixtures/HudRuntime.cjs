const {app,BrowserWindow,ipcMain}=require('electron');
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs/promises');
const root=path.resolve(__dirname,'../..');
const captureDirectory=process.argv[2];
let win;
let theme;
const commands=[];
const base={active:true,state:'running',paused:false,action:'输入文字',target:'专用测试窗口',canPause:true,canStop:true,agents:1};
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.setPath('userData',path.join(app.getPath('temp'),'dsh-cu-hud-test'));
const measure=async()=>{
  let timer;
  try {return await Promise.race([win.webContents.executeJavaScript(`(async () => {
  const heading=document.querySelector('.status-heading');
  const capsule=document.querySelector('.status-capsule');
  const pause=document.querySelector('.status-pause');
  const stop=document.querySelector('.status-stop');
  const mascot=document.querySelector('.status-mascot');
  const images=Array.from(mascot?.querySelectorAll('image')??[]);
  const decoded=await Promise.all(images.map(async element=>{
    const href=element.href.baseVal;
    if(!href)return false;
    const image=new Image();image.src=new URL(href,document.baseURI).href;
    let timer;
    try {
      await Promise.race([image.decode(),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('Mascot raster decode timed out')),1500);})]);
      return image.naturalWidth>0&&image.naturalHeight>0;
    }finally{clearTimeout(timer);}
  }));
  const rect=element=>{const {left,top,right,bottom}=element.getBoundingClientRect();return {left,top,right,bottom};};
  return heading && {theme:document.documentElement.dataset.theme,heading:heading.textContent,width:heading.clientWidth,scroll:heading.scrollWidth,
    title:capsule.title,pauseLabel:pause.getAttribute('aria-label'),pauseDisabled:pause.disabled,stopDisabled:stop.disabled,
    headingRight:heading.getBoundingClientRect().right,controlsLeft:pause.getBoundingClientRect().left,
    stopRight:stop.getBoundingClientRect().right,viewport:innerWidth,viewportHeight:innerHeight,
    mascotLoaded:images.length>0&&decoded.every(Boolean),mascotImageCount:images.length,mascot:mascot&&rect(mascot),
    headingBounds:rect(heading),controlsBounds:rect(document.querySelector('.status-controls')),
    capsuleBounds:rect(capsule),capsuleColor:getComputedStyle(capsule).backgroundColor,
    mascotDecorative:mascot?.getAttribute('aria-hidden')==='true',mascotPointerEvents:mascot&&getComputedStyle(mascot).pointerEvents,
    appearing:capsule.getAnimations().some(animation=>animation.playState==='running')};
})()`),new Promise((_resolve,reject)=>{timer=setTimeout(()=>reject(Error('HUD renderer measurement timed out')),2500);})]);}
  finally{clearTimeout(timer);}
};
async function show(patch,heading){
  win.webContents.send('status',{...base,...patch});
  for(let n=0;n<100;n++){
    const view=await measure();
    if(view?.heading===heading&&view.theme===theme&&(theme==='orange'||view.mascotLoaded)&&!view.appearing){
      assert.equal(view.theme,theme,'HUD must render the selected theme');
      assert.ok(view.scroll<=view.width,`${heading} clipped: ${view.scroll}>${view.width}`);
      assert.ok(view.headingRight<=view.controlsLeft,'Heading overlaps controls');
      assert.ok(view.stopRight<=view.viewport,'Stop button overflows');
      assert.ok(view.title.startsWith(heading),'Tooltip must preserve the full status');
      assert.equal(view.viewport,400,'Both themes must fit the native HUD width');
      assert.equal(view.capsuleBounds.bottom-view.capsuleBounds.top,40,'Status capsule must keep its compact height');
      assert.equal(view.viewportHeight-view.capsuleBounds.bottom,14,'Status capsule must fit the bottom window margin');
      if(theme==='blue'){
        assert.equal(view.viewportHeight,164,'Blue theme must have room for its mascot');
        assert.equal(view.mascotDecorative,true,'Mascot must remain decorative');
        assert.equal(view.mascotPointerEvents,'none','Mascot must not receive pointer events');
        assert.ok(view.mascot.left>=0&&view.mascot.top>=0&&view.mascot.right<=view.viewport&&view.mascot.bottom<=view.viewportHeight,'Mascot overflows the native window');
        const overlaps=bounds=>view.mascot.left<bounds.right&&view.mascot.right>bounds.left&&view.mascot.top<bounds.bottom&&view.mascot.bottom>bounds.top;
        assert.equal(overlaps(view.headingBounds),false,'Mascot overlaps status text');
        assert.equal(overlaps(view.controlsBounds),false,'Mascot overlaps controls');
      }else{
        assert.equal(view.mascot,null,'Orange theme must not mount the mascot');
        assert.equal(view.viewportHeight,68,'Orange theme must keep the compact native window');
        assert.equal(view.capsuleBounds.top,14,'Orange theme must not reserve space above the capsule');
      }
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
  await fs.writeFile(path.join(captureDirectory,'hud-'+theme+'-'+name+'.png'),(await win.webContents.capturePage()).toPNG(),{flag:'wx'});
}
async function verifyMascotMotion(){
  const motion=await win.webContents.executeJavaScript(`(() => {
    const body=document.querySelector('.mascot-body');
    const bodyBefore=body&&getComputedStyle(body).transform;
    const sample=(selector,property)=>{
      const element=document.querySelector(selector);
      if(!element)return {missing:true};
      const animations=element.getAnimations();
      if(animations.length!==1)return {animationCount:animations.length};
      const animation=animations[0],timing=animation.effect.getTiming(),duration=timing.duration;
      if(typeof duration!=='number'||duration<=0)return {duration};
      const currentTime=animation.currentTime,playState=animation.playState;
      const offsets=[0,...animation.effect.getKeyframes().map(frame=>frame.computedOffset),1];
      const points=[...new Set(offsets)].sort((a,b)=>a-b);
      const times=[...points,...points.slice(1).map((point,index)=>(point+points[index])/2)]
        .filter(point=>point<1);
      try {
        animation.pause();
        return {animationCount:animations.length,duration,values:times.map(point=>{
          animation.currentTime=timing.delay+duration*point;
          return getComputedStyle(element)[property];
        })};
      }finally{
        animation.currentTime=currentTime;
        if(playState==='running')animation.play();
      }
    };
    const tail=sample('.mascot-tail','transform');
    const fringe=sample('.mascot-fringe','transform');
    const blink=sample('.mascot-blink','opacity');
    return {tail,fringe,blink,bodyStatic:Boolean(body)&&body.getAnimations().length===0&&getComputedStyle(body).transform===bodyBefore};
  })()`);
  for(const [name,value] of Object.entries({tail:motion.tail,fringe:motion.fringe})){
    assert.equal(value.animationCount,1,`${name} must have a live CSS animation`);
    assert.ok(new Set(value.values).size>1,`${name} must change its rendered transform across an animation cycle`);
  }
  assert.equal(motion.blink.animationCount,1,'Eyes must have a live blink animation');
  assert.ok(motion.blink.values.some(value=>Number(value)<=.05),'Blink must include an open-eye phase');
  assert.ok(motion.blink.values.some(value=>Number(value)>=.95),'Blink must include a closed-eye phase');
  assert.equal(motion.bodyStatic,true,'Body must stay still while tail and fringe move');
}
async function verifyReducedMotion(){
  win.webContents.debugger.attach('1.3');
  try {
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
    const reduced=await win.webContents.executeJavaScript(`(() => {
      const parts=['.mascot-tail','.mascot-fringe','.mascot-blink'].map(selector=>{
        const element=document.querySelector(selector);
        return {selector,animations:element.getAnimations().length,transform:getComputedStyle(element).transform,opacity:getComputedStyle(element).opacity};
      });
      return {matches:matchMedia('(prefers-reduced-motion: reduce)').matches,parts};
    })()`);
    assert.equal(reduced.matches,true,'Reduced-motion emulation must take effect');
    for(const part of reduced.parts){
      assert.equal(part.animations,0,`${part.selector} must be still with reduced motion`);
      if(part.selector!=='.mascot-blink')assert.equal(part.transform,'none',`${part.selector} must use its neutral pose`);
      else assert.equal(Number(part.opacity),0,'Reduced motion must leave eyes open');
    }
  }finally{
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
    win.webContents.debugger.detach();
  }
  await verifyMascotMotion();
}
async function loadTheme(queryTheme,offscreen=true){
  theme=queryTheme==='blue'?'blue':'orange';
  commands.length=0;
  const ready=new Promise(resolve=>ipcMain.once('ready',resolve));
  const previousWindow=win;
  win=new BrowserWindow({width:400,height:theme==='blue'?164:68,show:false,focusable:false,skipTaskbar:true,frame:false,transparent:true,webPreferences:{preload:path.join(root,'ui/preload.cjs'),sandbox:true,contextIsolation:true,nodeIntegration:false,offscreen,backgroundThrottling:false}});
  if(previousWindow)previousWindow.destroy();
  await win.loadFile(path.join(root,'ui/index.html'),queryTheme===undefined?{}:{query:{theme:queryTheme}});
  await ready;
  return show({},'DSH 正在操作电脑');
}
async function verifyTheme(queryTheme){
  const initial=await loadTheme(queryTheme);
  if(theme==='blue'){
    await verifyMascotMotion();
    await verifyReducedMotion();
  }
  await capture('running');
  const receipts={yielded:'已让行，本次未执行',busy:'其他任务占用，本次未执行',verified:'状态检查通过',unconfirmed:'效果未确认',sent:'已发送，效果未确认',preview:'仅检查，未执行'};
  for(const [state,label] of Object.entries(receipts))await show({state},'DSH '+label);
  await show({state:'busy',detail:'本次门控总耗时 1.2 秒；本次调用已被拒绝，插件不会自动重试'},'DSH '+receipts.busy);
  await capture('busy');
  const receipt='检测到内容变化，未逐字核对写入内容';
  const verified=await show({state:'verified',detail:receipt},'DSH 状态检查通过');
  assert.ok(verified.title.includes(receipt));
  const pausing=await show({state:'pausing',paused:true,detail:receipt},'DSH 正在暂停');
  assert.equal(pausing.pauseLabel,'取消暂停');assert.equal(pausing.pauseDisabled,false);assert.ok(!pausing.title.includes(receipt));
  await capture('pausing');
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
  return {capsuleColor:initial.capsuleColor,receiptLabels:6,clipped:0,pauseResume:true,disabledControls:true,staleReceiptHidden:true,
    ...(theme==='blue'?{mascotLoaded:true,mascotWithinWindow:true,mascotClearsTextAndControls:true,tailSways:true,fringeSways:true,eyesBlink:true,bodyStatic:true,reducedMotionStill:true,reducedMotionEyesOpen:true}:{mascotAbsent:true,compactWindow:true})};
}
async function verifyLiveTheme(){
  // Live resizing uses the production compositor; offscreen Electron can stall
  // raster decode after a hidden window changes height.
  await loadTheme('orange',false);
  win.showInactive();
  const rendererId=win.webContents.id;
  await win.webContents.executeJavaScript(`window.liveThemeCapsule=document.querySelector('.status-capsule');window.liveThemeStop=document.querySelector('.status-stop');void 0;`);
  const paused={state:'paused',paused:true};
  await show({...paused,theme:'orange'},'DSH 已暂停操作');
  for(const next of ['blue','orange','blue','orange']){
    theme=next;
    win.setBounds({height:theme==='blue'?164:68});
    const view=await show({...paused,theme},'DSH 已暂停操作');
    assert.equal(win.webContents.id,rendererId,'Live theme switch must keep the same renderer');
    assert.equal(await win.webContents.executeJavaScript(`window.liveThemeCapsule===document.querySelector('.status-capsule')&&window.liveThemeStop===document.querySelector('.status-stop')`),true,'Live theme switch must preserve the capsule and controls');
    assert.equal(view.pauseLabel,'继续操作','Live theme switch must preserve the paused state');
    assert.equal(view.pauseDisabled,false);assert.equal(view.stopDisabled,false);
    if(theme==='blue')await verifyMascotMotion();
  }
  await click('.status-pause');assert.deepEqual(commands,['pause']);
  await show({theme:'orange'},'DSH 正在操作电脑');
  await click('.status-stop');assert.deepEqual(commands,['pause','stop']);
  win.hide();
}
app.whenReady().then(async()=>{
  ipcMain.on('command',(_event,value)=>commands.push(value));
  const orange=await verifyTheme('orange');
  const blue=await verifyTheme('blue');
  assert.notEqual(orange.capsuleColor,blue.capsuleColor,'Orange and blue must render different palettes');
  for(const queryTheme of [undefined,'unknown']){
    const fallback=await loadTheme(queryTheme);
    assert.equal(fallback.capsuleColor,orange.capsuleColor,'Default and unknown themes must use the orange palette');
  }
  await verifyLiveTheme();
  console.log('HUD_ACCEPTANCE',JSON.stringify({themes:{orange,blue},differentPalettes:true,defaultOrange:true,unknownFallbackOrange:true,liveThemeSameRenderer:true,liveThemePreservesControlsAndPause:true,mascotAnimationRemounts:true}));
  app.quit();
}).catch(error=>{console.error(error);app.exit(1);});
