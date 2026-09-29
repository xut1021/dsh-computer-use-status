import {actionLabel,argumentTarget,clean,isDesktopTool,isDshCuaTool,resultObjects,resultFailed,resultPointer,resultState,resultDetail} from './shared.mjs';
const key=exec=>`${exec.agent.id}:${exec.callId}`;
const object=value=>value && typeof value==='object' && !Array.isArray(value)?value:{};
const windowKeys=value=>{
  const keys=[];
  if(Number.isInteger(value.pid) && Number.isInteger(value.window_id))keys.push(`cua:${value.pid}:${value.window_id}`);
  if(Number.isInteger(value.nativeWindowHandle) && value.nativeWindowHandle>0)keys.push(`hwnd:${value.nativeWindowHandle}`);
  if(Number.isInteger(value.hwnd) && value.hwnd>0)keys.push(`hwnd:${value.hwnd}`);
  if(typeof value.ref==='string')keys.push(`ref:${value.ref}`);
  if(typeof value.id==='string')keys.push(`element:${value.id}`);
  return keys;
};

export class StatusController {
  constructor(publish) {this.publish=publish;this.agents=new Map();this.calls=new Map();this.targets=new Map();this.waiters=new Map();this.paused=false;this.stopped=new Set();this.last=null;this.disposed=false;}
  targetCache(agentId){let cache=this.targets.get(agentId);if(!cache){cache=new Map();this.targets.set(agentId,cache);}return cache;}
  target(exec){
    const args=object(exec.arguments),cache=this.targetCache(exec.agent.id),target=object(args.target);
    const keys=windowKeys({...args,...target});
    if(typeof args.elementId==='string')keys.unshift(`element:${args.elementId}`);
    return keys.map(id=>cache.get(id)).find(Boolean)||argumentTarget(args);
  }
  begin(exec) {
    if(this.disposed)throw Error('COMPUTER_USE_STATUS_CLOSED');
    if(!exec.agent || !isDesktopTool(exec.name))throw Error('COMPUTER_USE_STATUS_INVALID_CALL');
    this.agents.set(exec.agent.id,exec.agent);
    const item={id:key(exec),agentId:exec.agent.id,lastTool:exec.name,action:actionLabel(exec.name,exec.arguments),target:this.target(exec),state:'waiting',cursorActive:!isDshCuaTool(exec.name),started:Date.now()};
    this.calls.set(key(exec),item);this.last=item;
    if(this.stopped.size && !this.stopped.has(exec.agent.id)){
      this.stopped.add(exec.agent.id);
      try{exec.agent.cancel({kind:'user'},{keepInbox:true});}catch{/* The stop latch still blocks dispatch if cancellation fails. */}
    }
    this.emit();
  }
  async gate(exec) {
    while(this.paused && !exec.signal?.aborted && !this.stopped.size && !this.disposed && this.agents.has(exec.agent.id))await new Promise(resolve=>{
      const done=()=>{this.waiters.delete(done);exec.signal?.removeEventListener('abort',done);resolve();};
      this.waiters.set(done,exec.agent.id);exec.signal?.addEventListener('abort',done,{once:true});
    });
    if(this.disposed||exec.signal?.aborted||this.stopped.size||!this.agents.has(exec.agent.id))throw Error('COMPUTER_USE_STOPPED');
    const item=this.calls.get(key(exec));if(!item)throw Error('COMPUTER_USE_STOPPED');
    item.state='running';this.last=item;this.emit();
  }
  observeTargets(exec,objects){
    const cache=this.targetCache(exec.agent.id);
    const remember=(value,title)=>{
      const safe=clean(title);if(!safe)return;
      for(const id of windowKeys(object(value)))cache.set(id,safe);
    };
    const explicit=this.target(exec),hasTarget=explicit!=='正在识别目标窗口' && !/^(进程|窗口) \d/.test(explicit);
    let observed;
    for(const obj of objects){
      if(isDshCuaTool(exec.name) && typeof obj.title==='string' && obj.hwnd>0){remember(obj,obj.title);observed=clean(obj.title);}
      if(isDshCuaTool(exec.name) && hasTarget){
        remember(obj,explicit);
        for(const element of [obj.element,...(Array.isArray(obj.elements)?obj.elements:[])])remember(element,explicit);
      }
      if(typeof obj.window_title==='string'){remember(obj,obj.window_title);observed=clean(obj.window_title);}
      for(const win of Array.isArray(obj.windows)?obj.windows:[])remember(win,win?.title??win?.name);
      if(obj.activeWindow?.name){remember(obj.activeWindow,obj.activeWindow.name);observed=clean(obj.activeWindow.name);}
      const tree=object(obj.tree);
      if(tree.controlType==='Window' && typeof tree.name==='string'){
        observed=clean(tree.name);remember(tree,observed);
        const pending=[tree];let count=0;
        while(pending.length && count++<3000){const node=pending.pop();remember(node,observed);if(Array.isArray(node.children))pending.push(...node.children);}
      }
      const results=Array.isArray(obj.results)?obj.results:obj.element?[obj.element]:[];
      for(const element of results){
        if(element?.controlType==='Window' && element?.name)remember(element,element.name);
        else if(hasTarget)remember(element,explicit);
      }
    }
    // Only title/identity is retained; values, queries, accessibility text and images stay in the original tool record.
    while(cache.size>3000)cache.delete(cache.keys().next().value);
    return observed;
  }
  result(exec,result) {
    const item=this.calls.get(key(exec));
    if(!item)return;
    if(!resultFailed(result)){
      const title=this.observeTargets(exec,resultObjects(result));
      if(title)item.target=title;
      const pointer=resultPointer(exec.name,result);if(pointer)item.pointer=pointer;
    }
    item.state=exec.signal?.aborted||this.stopped.has(exec.agent.id)?'stopped':resultState(exec.name,result);
    item.detail=item.state==='stopped'?'':resultDetail(exec.name,result);
    this.calls.delete(key(exec));this.last=item;this.emit();
  }
  togglePause(){if(!this.agents.size || this.stopped.size)return;this.paused=!this.paused;if(!this.paused)this.release();this.emit();}
  stop(){
    this.paused=false;
    for(const [id,agent] of this.agents){
      if(this.stopped.has(id))continue;
      this.stopped.add(id);
      try{agent.cancel({kind:'user'},{keepInbox:true});}catch{/* Keep every other participant cancellable even if one agent has already retired. */}
    }
    if(this.last)this.last={...this.last,state:'stopped',detail:''};
    this.release();this.emit();
  }
  release(agentId){for(const [wake,id] of [...this.waiters])if(agentId===undefined || id===agentId)wake();}
  idle(agent){
    this.agents.delete(agent.id);this.stopped.delete(agent.id);this.targets.delete(agent.id);
    for(const [id,call] of this.calls)if(call.agentId===agent.id)this.calls.delete(id);
    this.release(agent.id);
    if(this.last?.agentId===agent.id && ['waiting','running'].includes(this.last.state))this.last={...this.last,state:'idle'};
    if(!this.agents.size){this.paused=false;this.release();}this.emit();
  }
  emit(){
    const running=[...this.calls.values()].at(-1),item=running??this.last;
    if(!item)return;
    // These flags describe host promises; MCP cancellation does not prove physical input has already stopped.
    const active=this.agents.size>0,executing=[...this.calls.values()].some(call=>call.state==='running' && call.lastTool.startsWith('mcp__'));
    const state=this.stopped.size?(executing?'stopping':'stopped'):this.paused?(executing?'pausing':'paused'):item.state;
    this.publish({...item,state,active,executing,count:this.calls.size,agents:this.agents.size,paused:this.paused,canPause:active&&!this.stopped.size,canStop:active&&!this.stopped.size});
  }
  dispose(){this.stop();this.disposed=true;this.release();this.agents.clear();this.calls.clear();this.targets.clear();this.stopped.clear();this.emit();}
}
