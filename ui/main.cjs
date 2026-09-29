const {app,BrowserWindow,ipcMain,screen}=require('electron');
const path=require('node:path'),readline=require('node:readline'),{spawn}=require('node:child_process');
const preview=process.argv.includes('--dsh-preview');
const effects=new Map(),loaded=new Set();
let pill,state=null,hideTimer,cursorTimer,keyboard,cursorLease,keyboardReady=false,cursorReady=false,announced=false,quitting=false,lastPulse=0,lastCall=null;
app.commandLine.appendSwitch('disable-background-networking');
app.setPath('userData',path.join(app.getPath('temp'),'dsh-cu-orange-overlay'));
function emit(event,extra={}){if(!process.stdout.destroyed)process.stdout.write(JSON.stringify({event,...extra})+'\n');}
function enabled(){return Boolean(state?.active&&state?.canStop!==false&&state?.state!=='stopped');}
function paused(){return Boolean(state?.paused&&state?.state!=='pausing');}
function send(win,channel,value){if(win&&!win.isDestroyed()&&loaded.has(win.webContents.id))win.webContents.send(channel,value);}
function keyboardEnable(){
  if(keyboard?.stdin.writable)keyboard.stdin.write(enabled()?'enable\n':'disable\n');
  if(cursorLease?.stdin.writable)cursorLease.stdin.write(enabled()&&!paused()&&state?.cursorActive!==false?'enable\n':'disable\n');
}
function command(value){
  if(!enabled())return;
  emit(value);
  if(preview){state={...state,paused:value==='pause'?!state.paused:false,state:value==='stop'?'stopped':state.paused?'running':'paused',active:value!=='stop',canStop:value!=='stop',canPause:value!=='stop'};publish();}
}
function updateCursor(){
  if(!enabled())return;
  const point=screen.getCursorScreenPoint();
  const click=['click','double_click'].includes(state.pointer?.action);
  if(click&&state.id!==lastCall&&state.state==='done'){lastPulse=Date.now();lastCall=state.id;}
  for(const item of effects.values()){
    const {win,bounds}=item;if(!loaded.has(win.webContents.id))continue;
    const next={x:point.x-bounds.x,y:point.y-bounds.y,pulse:lastPulse,visible:state?.cursorActive!==false&&!paused()&&point.x>=bounds.x&&point.x<bounds.x+bounds.width&&point.y>=bounds.y&&point.y<bounds.y+bounds.height};
    const previous=item.cursor;
    if(previous&&previous.x===next.x&&previous.y===next.y&&previous.pulse===next.pulse&&previous.visible===next.visible)continue;
    item.cursor=next;send(win,'cursor',next);
  }
}
function publish(){
  if(!state||!pill)return;
  clearTimeout(hideTimer);
  keyboardEnable();
  const show=state.active&&!['stopped','idle'].includes(state.state);
  for(const item of effects.values()){
    const {win}=item;
    send(win,'status',state);
    if(show&&loaded.has(win.webContents.id)){if(!win.isVisible())win.showInactive();}else {item.cursor=null;win.hide();}
  }
  send(pill,'status',state);
  if(loaded.has(pill.webContents.id)&&!pill.isVisible())pill.showInactive();
  clearInterval(cursorTimer);
  if(show){updateCursor();cursorTimer=setInterval(updateCursor,16);}else hideTimer=setTimeout(()=>pill?.hide(),1800);
}
function checkReady(){
  if(announced||!keyboardReady||!cursorReady||!pill||!loaded.has(pill.webContents.id)||[...effects.values()].some(e=>!loaded.has(e.win.webContents.id)))return;
  announced=true;emit('ready');publish();
  if(preview){state={id:'preview',action:'观察目标窗口',target:'效果预览 · 尚未连接实际操作',state:'running',active:true,paused:false,canPause:true,canStop:true,agents:1,demo:true,started:Date.now()};publish();setTimeout(()=>app.quit(),45000);}
}
function create(bounds,surface){
  const win=new BrowserWindow({title:surface==='effects'?'DSH 桌面操作光效':'DSH 桌面操作',...bounds,frame:false,transparent:true,backgroundColor:'#00000000',alwaysOnTop:true,show:false,focusable:false,resizable:false,minimizable:false,maximizable:false,skipTaskbar:true,hasShadow:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,backgroundThrottling:false}});
  const wcId=win.webContents.id;
  win.setAlwaysOnTop(true,'screen-saver');
  win.setContentProtection(true);
  if(surface==='effects')win.setIgnoreMouseEvents(true);
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,callback)=>callback(false));
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',event=>event.preventDefault());
  win.webContents.on('render-process-gone',()=>{emit('failed');app.quit();});
  win.webContents.on('did-fail-load',()=>{emit('failed');app.quit();});
  win.on('closed',()=>{loaded.delete(wcId);});
  win.loadFile(path.join(__dirname,'index.html'),{query:{surface}});
  return win;
}
function layout(){
  const displays=screen.getAllDisplays();
  for(const [id,value] of effects)if(!displays.some(d=>d.id===id)){effects.delete(id);value.win.destroy();}
  for(const display of displays){let item=effects.get(display.id);if(item){item.bounds=display.bounds;item.win.setBounds(display.bounds);}else effects.set(display.id,{win:create(display.bounds,'effects'),bounds:display.bounds});}
  const area=screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  const bounds={x:Math.round(area.x+(area.width-Math.min(400,area.width))/2),y:area.y+36,width:Math.min(400,area.width),height:68};
  if(pill)pill.setBounds(bounds);else pill=create(bounds,'pill');
}
const pipeIndex=process.argv.indexOf('--dsh-status-pipe');
const pipeName=pipeIndex<0?null:process.argv[pipeIndex+1];
if(!preview&&(!pipeName||!pipeName.startsWith('\\\\.\\pipe\\dsh-cu-status-')))throw Error('STATUS_PIPE_REQUIRED');
const control=preview?null:require('node:net').connect(pipeName);
if(control){
control.on('error',()=>app.quit());
const input=readline.createInterface({input:control});
input.on('line',line=>{if(line.length>16384)return;try{const value=JSON.parse(line);if(!value||typeof value!=='object'||typeof value.state!=='string')return;state=value;publish();}catch{}});
input.on('close',()=>{if(!preview)app.quit();});
}
app.whenReady().then(()=>{
  ipcMain.on('ready',event=>{if(event.sender===pill?.webContents||[...effects.values()].some(e=>event.sender===e.win.webContents)){loaded.add(event.sender.id);publish();checkReady();}});
  ipcMain.on('command',(event,value)=>{if(event.sender===pill?.webContents&&['pause','stop'].includes(value))command(value);});
  ipcMain.on('size',()=>{});
  layout();
  for(const name of ['display-added','display-removed','display-metrics-changed'])screen.on(name,layout);
  keyboard=spawn(path.join(__dirname,'../assets/EscapeGuard.exe'),[],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  keyboard.stdin.on('error',()=>{});
  readline.createInterface({input:keyboard.stdout}).on('line',line=>{if(line==='ready'){keyboardReady=true;keyboardEnable();checkReady();}else if(line==='stop')command('stop');});
  keyboard.on('error',()=>{emit('failed');app.quit();});
  keyboard.on('exit',()=>{if(!quitting){emit('failed');app.quit();}});
  cursorLease=spawn(path.join(__dirname,'../assets/CursorLease.exe'),[],{windowsHide:true,stdio:['pipe','pipe','ignore']});
  cursorLease.stdin.on('error',()=>{});
  readline.createInterface({input:cursorLease.stdout}).on('line',line=>{if(line==='ready'){cursorReady=true;keyboardEnable();checkReady();}else if(line==='failure'){emit('failed');app.quit();}});
  cursorLease.on('error',()=>{emit('failed');app.quit();});
  cursorLease.on('exit',()=>{if(!quitting){emit('failed');app.quit();}});
});
app.on('before-quit',()=>{quitting=true;clearTimeout(hideTimer);clearInterval(cursorTimer);control?.destroy();keyboard?.stdin.end();cursorLease?.stdin.end();});
app.on('window-all-closed',()=>{if(!quitting)app.quit();});
