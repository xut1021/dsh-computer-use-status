import React from 'react';
import {toolNames, actionLabel, argumentTarget, clean, resultObjects, resultFailed, resultState, resultDetail, isDshCuaTool, receiptLabels} from './shared.mjs';

export const inject = ['slots','configForms'];
const h = React.createElement;
const statusLabels = {preparing:'准备中', running:'执行中', returned:'已返回', error:'出现错误', stopped:'已请求停止',...receiptLabels};
const stopNotice = '已请求停止，后续操作已取消；已发出的动作可能正在收尾。';
const baseButton = {font:'inherit',color:'inherit',cursor:'pointer',border:0,background:'transparent'};
const muted = {color:'var(--dsw-alias-label-secondary,inherit)',opacity:.72};

function callArguments(phase, block) {
  const raw = phase === 'start' ? block?.argsRaw : phase === 'result' ? block?.call?.argsRaw : undefined;
  if (typeof raw !== 'string' || raw.length > 1000000) return {};
  try { const value = JSON.parse(raw); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  catch { return {}; }
}

/** Derive display facts only; typed text, UI trees, raw errors and paths stay in the host trajectory. */
export function cardModel({phase, block, toolName}) {
  const name=toolName || block?.call?.name || block?.name || '';
  const args = callArguments(phase, block);
  let target = phase === 'preparing' ? '正在确定目标窗口' : argumentTarget(args);
  if (phase === 'result' && !resultFailed(block)) {
    for (const value of resultObjects(block)) {
      const title = value.window_title || value.windowTitle || value.window?.title || (isDshCuaTool(name) && value.hwnd>0 ? value.title : undefined);
      if (typeof title === 'string' && title.trim()) { target = clean(title); break; }
    }
  }
  const receiptState=resultState(name,block);
  const state = phase === 'result'
    ? block?.error?.code === 'interrupted' ? 'stopped' : receiptState==='done'?'returned':receiptState
    : phase === 'preparing' ? 'preparing' : 'running';
  const duration = phase === 'result' && Number.isFinite(block?.callTime) && Number.isFinite(block?.time)
    ? Math.max(0, block.time - block.callTime) : null;
  const images = phase === 'result' && Array.isArray(block?.content)
    ? block.content.filter(part => part?.type === 'image' && part.attachment && typeof part.attachment.attachmentId === 'string' && part.attachment.attachmentId).map(part => part.attachment)
    : [];
  const detail=phase==='result' && state!=='stopped' ? resultDetail(name,block) : '';
  return {action:actionLabel(name,args),target,state,label:statusLabels[state],detail,duration,images};
}

function Duration({milliseconds}) {
  if (milliseconds === null) return null;
  return h('span',{style:{...muted,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}},
    milliseconds < 1000 ? '不足 1 秒' : `${(milliseconds / 1000).toFixed(milliseconds < 10000 ? 1 : 0)} 秒`);
}

/** URL ownership stays with the official session loader; never derive a URL from result text. */
export function Screenshot({attachment, loadImage}) {
  const [state,setState] = React.useState({url:'',failed:false});
  React.useEffect(() => {
    let active = true;
    setState({url:'',failed:false});
    if (typeof loadImage !== 'function') { setState({url:'',failed:true}); return; }
    Promise.resolve().then(() => loadImage(attachment)).then(url => {
      if (active) setState(typeof url === 'string' && url ? {url,failed:false} : {url:'',failed:true});
    },() => { if (active) setState({url:'',failed:true}); });
    return () => { active = false; };
  },[attachment.attachmentId,loadImage]);
  return h('figure',{style:{margin:0,minWidth:0}},
    state.url ? h('img',{src:state.url,alt:'本次 Computer Use 返回的截图',loading:'lazy',onError:()=>setState({url:'',failed:true}),
      style:{display:'block',width:'100%',maxWidth:520,maxHeight:280,objectFit:'contain',objectPosition:'left top',borderRadius:8,border:'1px solid var(--dsw-alias-border-l1,#8884)'}})
      : h('div',{role:'status',style:{...muted,padding:'12px 0'}},state.failed ? '截图暂时无法加载，可查看原始记录。' : '正在加载截图…'));
}

export function ComputerUseCard(props) {
  const model = cardModel(props);
  const {expanded,toggle} = props.useDisclosure();
  const detailsId = React.useId();
  const active = model.state === 'preparing' || model.state === 'running';
  const theme = props.theme === 'blue' ? 'blue' : 'orange';
  const accent = theme === 'blue' ? '#52699b' : '#b85c2c';
  const dot = model.state === 'error' ? '#e36c63' : model.state === 'stopped' ? '#929296' : accent;
  return h('section',{'data-dsh-cu-card':'','data-state':model.state,'data-theme':theme,style:{margin:'6px 0',border:'1px solid var(--dsw-alias-border-l1,#8884)',borderLeft:`2px solid ${accent}`,borderRadius:10,background:'var(--dsw-alias-bg-base,Canvas)',color:'var(--dsw-alias-label-primary,CanvasText)',overflow:'hidden',fontSize:13,lineHeight:1.5}},
    h('button',{type:'button',onClick:toggle,'aria-expanded':expanded,'aria-controls':detailsId,style:{...baseButton,width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 12px',textAlign:'left'}},
      h('span',{'aria-hidden':true,style:{display:'grid',placeItems:'center',flex:'0 0 30px',height:30,borderRadius:8,background:`${accent}18`,color:accent}},
        h('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.6},h('rect',{x:3,y:4,width:18,height:13,rx:2}),h('path',{d:'M8 21h8M12 17v4'}))),
      h('span',{style:{flex:1,minWidth:0}},
        h('span',{style:{display:'block',fontWeight:550}},model.action),
        h('span',{title:model.target,style:{...muted,display:'block',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontSize:12}},model.target)),
      h('span',{role:active ? 'status' : undefined,title:model.state === 'stopped' ? stopNotice : model.detail || undefined,style:{display:'inline-flex',alignItems:'center',gap:5,flexShrink:0,fontSize:12}},h('span',{'aria-hidden':true,style:{width:6,height:6,borderRadius:'50%',background:dot}}),model.label),
      h('svg',{'aria-hidden':true,width:14,height:14,viewBox:'0 0 16 16',fill:'none',stroke:'currentColor',style:{...muted,flexShrink:0,transform:expanded?'rotate(180deg)':undefined}},h('path',{d:'m4 6 4 4 4-4',strokeWidth:1.5,strokeLinecap:'round',strokeLinejoin:'round'}))),
    expanded && h('div',{id:detailsId,style:{padding:'0 12px 12px 52px',display:'grid',gap:10}},
      h('div',{style:{display:'flex',alignItems:'center',flexWrap:'wrap',gap:'6px 14px',fontSize:12}},
        h('span',{style:muted},'Computer Use'),h(Duration,{milliseconds:model.duration}),
        props.inspect && h('button',{type:'button',onClick:props.inspect,style:{...baseButton,padding:0,textDecoration:'underline',textUnderlineOffset:3}},'查看原始记录')),
      ...model.images.map((attachment,index) => h(Screenshot,{key:`${attachment.attachmentId}:${index}`,attachment,loadImage:props.loadImage})),
      model.detail && h('p',{style:{...muted,margin:0,fontSize:12}},model.detail),
      model.state === 'error' && h('p',{style:{...muted,margin:0,fontSize:12}},'操作未成功，详细原因见原始记录。'),
      model.state === 'stopped' && h('p',{title:stopNotice,style:{...muted,margin:0,fontSize:12}},'后续操作已取消。')));
}

export function ThemeConfig({view,form}) {
  const current = form?.state.value?.theme === 'blue' ? 'blue' : 'orange';
  const [selected,setSelected] = React.useState(current);
  const [busy,setBusy] = React.useState(false);
  const [notice,setNotice] = React.useState('');
  const labelId = React.useId();
  React.useEffect(()=>setSelected(current),[current]);
  if (view === 'summary') return '橙色简洁版或蓝色角色动画版';
  const writable = form?.state.status === 'ready' && form.state.writable;
  const save = async event => {
    event.preventDefault();
    if (!writable || busy) return;
    setBusy(true);setNotice('');
    try {
      const accepted = await form.mutate([{op:'set',path:['theme'],value:selected}],form.state.revision);
      setNotice(accepted ? '主题已保存。' : '主题未保存，请检查当前设置后重试。');
    } catch {
      setNotice('保存失败，请稍后重试。');
    } finally {setBusy(false);}
  };
  return h('form',{onSubmit:save,style:{display:'grid',gap:12,maxWidth:360}},
    h('label',{htmlFor:labelId},'显示主题'),
    h('select',{id:labelId,value:selected,disabled:!writable || busy,onChange:event=>{setSelected(event.target.value);setNotice('');},style:{font:'inherit',padding:8}},
      h('option',{value:'orange'},'橙色简洁版'),h('option',{value:'blue'},'蓝色角色动画版')),
    h('button',{type:'submit',disabled:!writable || busy,style:{font:'inherit',padding:8}},busy ? '保存中…' : '保存主题'),
    h('p',{role:'status',style:{...muted,margin:0}},form?.state.status === 'loading' ? '正在加载主题设置…' : !writable ? '当前连接无法保存主题设置。' : notice));
}

export function apply(ctx) {
  const form = ctx.configForms.get('dsh-computer-use-status');
  const subscribe = listener => form.subscribe(listener);
  const getSnapshot = () => form.getSnapshot();
  function ThemedComputerUseCard(props) {
    const state = React.useSyncExternalStore(subscribe,getSnapshot,getSnapshot);
    return h(ComputerUseCard,{...props,theme:state.value?.theme});
  }
  ctx.slots.inject('tool.call.toolview', function* () {
    for (const key of toolNames) yield ctx.slots.register({name:'tool.call.toolview',key},ThemedComputerUseCard);
  });
  ctx.slots.inject('plugins.row.config',()=>ctx.slots.register({name:'plugins.row.config',key:'dsh-computer-use-status#dsh-computer-use-status'},ThemeConfig));
}
