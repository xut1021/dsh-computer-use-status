import {StatusController} from './controller.mjs';
import {OverlayBridge} from './bridge.mjs';
import {isDesktopTool} from './shared.mjs';
import z from '@deepseek-ai/schemastery';
export const name='dsh-computer-use-status';
export const inject=['agents'];
export const Config=z.object({theme:z.union(['orange','blue']).default('orange').volatile()});
export async function apply(ctx,config){
  // Newly spawned Wincu MCP workers inherit this and skip their older independent banner.
  const previousIndicator=process.env.WCU_INDICATOR;
  process.env.WCU_INDICATOR='0';
  ctx.effect(()=>()=>{
    if(process.env.WCU_INDICATOR!=='0')return;
    if(previousIndicator===undefined)delete process.env.WCU_INDICATOR;
    else process.env.WCU_INDICATOR=previousIndicator;
  },'computer-use-status: legacy indicator environment');
  const fibers=new Map();let closing=false;
  const monitor=new StatusController(state=>bridge.write({...state,theme:config.theme.get()}));
  const bridge=new OverlayBridge(command=>command==='pause'?monitor.togglePause():monitor.stop(),()=>{if(!closing){monitor.stop();ctx.logger.warn('Computer Use status window disconnected; active desktop tasks stopped.');}});
  ctx.on('loader/volatile-update',()=>{if(monitor.agents.size)monitor.emit();});
  const install=agent=>{
    if(fibers.has(agent))return fibers.get(agent);
    const fiber=agent.ctx.inject(['tools'],scope=>{
      scope.on('tools/execute',async(exec,next)=>{
        if(!isDesktopTool(exec.name))return next();
        monitor.begin(exec);
        await bridge.start();
        await monitor.gate(exec);
        return next();
      },{prepend:true});
      scope.on('tools/result',(exec,result)=>{if(isDesktopTool(exec.name))monitor.result(exec,result);});
      scope.on('agent/status',({agent,status})=>{if(status==='idle')monitor.idle(agent);});
    });
    fibers.set(agent,fiber);return fiber;
  };
  ctx.on('agent/created',async({agent})=>{await install(agent);});
  ctx.on('agent/disposed',async({agent})=>{monitor.idle(agent);const fiber=fibers.get(agent);fibers.delete(agent);await fiber?.dispose();});
  ctx.effect(()=>async()=>{closing=true;monitor.dispose();await Promise.all([...fibers.values()].map(f=>f.dispose()));fibers.clear();await bridge.close();});
  // Existing idle agents can have pending tool services; never make root startup wait for them.
  const initial=[];
  for(const agent of ctx.agents.list()){
    const fiber=install(agent);
    if(fiber.ctx.get('tools'))initial.push(fiber);
  }
  await Promise.all(initial);
}
