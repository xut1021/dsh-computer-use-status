const {contextBridge,ipcRenderer}=require('electron');
let latestStatus;
ipcRenderer.on('status',(_event,status)=>{latestStatus=status;});
contextBridge.exposeInMainWorld('dshStatus',{
  subscribe(callback){const onState=(_e,s)=>callback(s);ipcRenderer.on('status',onState);ipcRenderer.send('ready');return()=>ipcRenderer.removeListener('status',onState);},
  subscribeCursor(callback){
    let running=false,waiting=false,frame=0;
    const schedule=()=>{
      if(!running||waiting||frame)return;
      frame=requestAnimationFrame(()=>{frame=0;if(running){waiting=true;ipcRenderer.send('cursor-request');}});
    };
    const onStatus=(_event,status)=>{
      running=Boolean(status?.active&&status.canStop!==false&&!['stopped','idle'].includes(status.state)&&(!status.paused||status.state==='pausing')&&status.cursorActive!==false);
      if(running)schedule();
      else {cancelAnimationFrame(frame);frame=0;callback({x:0,y:0,visible:false});}
    };
    const onCursor=(_event,point)=>{waiting=false;if(running){callback(point);schedule();}};
    ipcRenderer.on('cursor',onCursor);ipcRenderer.on('status',onStatus);
    onStatus(null,latestStatus);
    return()=>{running=false;cancelAnimationFrame(frame);ipcRenderer.removeListener('cursor',onCursor);ipcRenderer.removeListener('status',onStatus);};
  },
  command(command){if(['pause','stop'].includes(command))ipcRenderer.send('command',command);},
  resize(mode){if(['bar','expanded','collapsed'].includes(mode))ipcRenderer.send('size',mode);}
});
