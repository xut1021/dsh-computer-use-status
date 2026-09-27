const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('dshStatus',{
  subscribe(callback){const onState=(_e,s)=>callback(s);ipcRenderer.on('status',onState);ipcRenderer.send('ready');return()=>ipcRenderer.removeListener('status',onState);},
  subscribeCursor(callback){const onCursor=(_e,s)=>callback(s);ipcRenderer.on('cursor',onCursor);return()=>ipcRenderer.removeListener('cursor',onCursor);},
  command(command){if(['pause','stop'].includes(command))ipcRenderer.send('command',command);},
  resize(mode){if(['bar','expanded','collapsed'].includes(mode))ipcRenderer.send('size',mode);}
});
