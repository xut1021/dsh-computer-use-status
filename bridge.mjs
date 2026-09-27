import electronPath from 'electron';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:net';
import {randomUUID} from 'node:crypto';
export class OverlayBridge {
  constructor(command,onFailure){this.command=command;this.onFailure=onFailure;this.child=null;this.latest=null;this.closing=false;}
  start(){
    if(this.ready)return this.ready;
    this.closing=false;
    this.ready=new Promise((resolve,reject)=>{
      let settled=false,failedOnce=false,buffer='',runtimeReady=false,child;
      const pipeName='\\\\.\\pipe\\dsh-cu-status-'+randomUUID();
      const env={SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,PATH:process.env.PATH,TEMP:process.env.TEMP,TMP:process.env.TMP,USERPROFILE:process.env.USERPROFILE,LOCALAPPDATA:process.env.LOCALAPPDATA,APPDATA:process.env.APPDATA};
      const failed=()=>{if(failedOnce)return;failedOnce=true;clearTimeout(timer);this.ready=null;this.child=null;this.channel?.destroy();this.channel=null;if(server.listening)server.close();if(child?.exitCode===null)child.kill();if(!settled)reject(Error('COMPUTER_USE_STATUS_UNAVAILABLE'));if(!this.closing)this.onFailure();};
      const timer=setTimeout(failed,15000);
      const ready=()=>{if(settled||!runtimeReady||!this.channel)return;settled=true;clearTimeout(timer);resolve();if(this.latest)this.write(this.latest);};
      const server=this.server=createServer(channel=>{
        if(this.channel){channel.destroy();return;}
        this.channel=channel;server.close();channel.on('error',failed);channel.once('close',()=>{if(!this.closing)failed();});ready();
      });
      server.once('error',failed);
      server.listen(pipeName,()=>{
      child=this.child=spawn(electronPath,[fileURLToPath(new URL('./ui/main.cjs',import.meta.url)),'--dsh-status-pipe',pipeName],{windowsHide:true,stdio:['ignore','pipe','pipe'],shell:false,env});
      child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
        buffer+=chunk;if(buffer.length>65536){failed();child.kill();return;}let end;
        while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);let event;try{event=JSON.parse(line);}catch{continue;}
          if(event.event==='ready'){runtimeReady=true;ready();}
          else if(['pause','stop'].includes(event.event))this.command(event.event);
          else if(event.event==='failed'){failed();child.kill();}
        }
      });
      child.stderr.resume();
      child.once('error',failed);child.once('exit',failed);
      });
    });
    return this.ready;
  }
  write(state){this.latest=state;if(this.channel?.writable)this.channel.write(JSON.stringify(state)+'\n');}
  async close(){this.closing=true;const child=this.child;this.channel?.end();if(this.server?.listening)this.server.close();if(child){await Promise.race([new Promise(resolve=>child.once('exit',resolve)),new Promise(resolve=>setTimeout(resolve,1500))]);if(child.exitCode===null)child.kill();}this.channel?.destroy();this.channel=null;this.child=null;this.ready=null;}
}
