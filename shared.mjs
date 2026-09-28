export const cuaActions = ['list_windows','get_window_state','verify_state','bring_to_front','click','double_click','right_click','drag','type_text','press_key','hotkey','set_value','scroll','start_session','end_session'];
export const winActions = ['health','snapshot','accessibility_tree','list_windows','find','element_info','click','double_click','move','drag','scroll','type_text','keypress','focus','invoke','set_value','activate_window','wait','ocr','wait_for','close_window','move_window'];
export const dshCuaActions = ['list_windows','find_window','capture_window','send_keys','click_at','element_action','type_text','get_window_rect','element_at_point','read_element','skyshot','element_action_at','find_elements','coexistence_status','clipboard_read','clipboard_write','open_application','list_displays','cursor_position'];
const dshCuaTools = new Set(dshCuaActions.map(n=>'mcp__win32__tool_'+n));
export const isDshCuaTool = name => dshCuaTools.has(name);
export const toolNames = [...cuaActions.map(n=>'mcp__cua_native__'+n), ...winActions.map(n=>'mcp__wincu__windows_computer_use_'+n), ...dshCuaTools, 'workflow_save','workflow_replay'];
const desktopTools = new Set(toolNames);
export const isDesktopTool = name => desktopTools.has(name);
const labels = {list_windows:'查找目标窗口',get_window_state:'观察窗口',verify_state:'核对操作结果',bring_to_front:'切换到目标窗口',click:'点击',double_click:'双击',right_click:'打开右键菜单',drag:'拖动',type_text:'输入文字',press_key:'按键',key_press:'按键',hotkey:'使用快捷键',set_value:'填写输入框',scroll:'滚动',start_session:'连接桌面工具',end_session:'结束桌面连接',find:'查找控件',element_info:'读取控件状态',invoke:'点击控件',screenshot:'截取窗口',focus_window:'切换到目标窗口',close_window:'关闭窗口',minimize_window:'最小化窗口',maximize_window:'最大化窗口',restore_window:'恢复窗口',get_clipboard:'读取剪贴板',set_clipboard:'写入剪贴板',launch:'打开应用',workflow_save:'验证并保存流程',workflow_replay:'回放已保存流程'};
Object.assign(labels,{health:'检查桌面连接',snapshot:'观察窗口',accessibility_tree:'读取窗口控件',move:'移动指针',keypress:'按键',focus:'聚焦控件',activate_window:'激活窗口',wait:'等待界面响应',ocr:'识别窗口文字',wait_for:'等待目标出现',move_window:'移动窗口'});
Object.assign(labels,{find_window:'查找目标窗口',capture_window:'截取窗口',send_keys:'使用快捷键',click_at:'点击',element_action:'操作控件',get_window_rect:'读取窗口位置',element_at_point:'定位控件',read_element:'读取控件状态',skyshot:'读取窗口控件',element_action_at:'操作控件',find_elements:'查找控件',coexistence_status:'检查人机协作状态',clipboard_read:'读取剪贴板',clipboard_write:'写入剪贴板',open_application:'打开应用',list_displays:'读取显示器',cursor_position:'读取指针位置'});
export function actionLabel(name,args={}) {
  const action=name.replace(/^mcp__cua_native__|^mcp__wincu__windows_computer_use_|^mcp__win32__tool_/, '');
  if(isDshCuaTool(name) && ['element_action','element_action_at'].includes(action))return ({press:'点击控件',set_value:'填写输入框',select:'选择控件',toggle:'切换控件',expand:'展开控件',collapse:'收起控件',scroll_into_view:'滚动到控件',focus:'聚焦控件'})[args?.action] || labels[action];
  return labels[action] || '操作桌面';
}
export function clean(value) {return typeof value === 'string' ? value.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').slice(0,140) : '';}
export function argumentTarget(args={}) {
  if(!args || typeof args!=='object')return '正在识别目标窗口';
  const title=args.target?.window?.title || args.steps?.[0]?.target?.window?.title || args.windowTitle || args.title;
  if (typeof title==='string') return clean(title);
  const pid=args.target?.pid??args.pid??args.processId,win=args.target?.window_id??args.window_id??args.nativeWindowHandle??(args.hwnd>0?args.hwnd:undefined);
  if (Number.isInteger(pid)) return `进程 ${pid}${Number.isInteger(win)?' · 窗口 '+win:''}`;
  if (Number.isInteger(win)) return `窗口 ${win}`;
  return '正在识别目标窗口';
}
export function resultObjects(result) {
  const value=result?.value ?? result;
  const out=[];
  if(value?.structuredContent)out.push(value.structuredContent);
  if(value && typeof value==='object')out.push(value);
  const content=value?.content??result?.content;
  for(const part of Array.isArray(content)?content:[])if(part?.type==='text' && typeof part.text==='string' && part.text.length<1000000){try{const v=JSON.parse(part.text);if(v && typeof v==='object')out.push(v);}catch{}}
  return out;
}
export function resultFailed(result) {return result?.isError===true || resultObjects(result).some(v=>v.isError===true || v.success===false || v.ok===false || v.effect_verified===false || v.completed===false || v.status==='unsatisfied' || v.satisfied===false);}
export const receiptLabels = {yielded:'正在让你操作',busy:'等待其他任务',verified:'效果已确认',unconfirmed:'效果未确认',sent:'已发送，效果未确认',preview:'仅检查，未执行'};
export function resultState(name,result) {
  if(!isDshCuaTool(name))return resultFailed(result)?'error':'done';
  const objects=resultObjects(result);
  const reason=objects.map(v=>v.reason ?? v.arbiter?.reason).find(v=>v==='user-active'||v==='arbiter-busy');
  if(reason)return reason==='user-active'?'yielded':'busy';
  if(resultFailed(result))return 'error';
  if(objects.some(v=>v.dry_run===true))return 'preview';
  if(objects.some(v=>v.effect_verified===true))return 'verified';
  if(objects.some(v=>v.effect_verified===null))return 'unconfirmed';
  if(objects.some(v=>v.action_sent===true))return 'sent';
  // These mutators can omit an effect receipt; transport success proves no outcome.
  if(['element_action','element_action_at','type_text','click_at','send_keys','clipboard_write','open_application'].some(n=>name==='mcp__win32__tool_'+n))return 'unconfirmed';
  return 'done';
}

/** Wincu reports physical desktop points. Cua coordinates are not assumed to share that space. */
export function resultPointer(name,result) {
  if(!name.startsWith('mcp__wincu__windows_computer_use_') || resultFailed(result))return;
  for(const value of resultObjects(result)){
    if(!['click','double_click','move','scroll'].includes(value.action) || value.homed)continue;
    if(['click','double_click'].includes(value.action) && value.method!=='sendinput')continue;
    if(Number.isFinite(value.x) && Number.isFinite(value.y))return {x:value.x,y:value.y,space:'screen-physical',action:value.action};
  }
}
