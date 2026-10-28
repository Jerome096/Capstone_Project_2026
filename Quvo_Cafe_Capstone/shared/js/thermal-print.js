// MP211: 58 mm paper, with a conservative 48 mm area for printable content.
function buildThermalPrintDocument(title,markup) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>'+escapeHtml(title)+'</title><style>'+
    '@page{size:58mm 200mm;margin:0}*{box-sizing:border-box}html{margin:0;padding:0}body{width:58mm;max-width:58mm;margin:0;padding:3mm 5mm;color:#000;background:#fff;font:11px/1.35 Arial,sans-serif}'+
    '.prep-ticket,.thermal-receipt{width:48mm;max-width:100%;padding:0;overflow-wrap:anywhere}.prep-ticket{break-after:page;page-break-after:always}.prep-ticket:last-child{break-after:auto;page-break-after:auto}'+
    'header{text-align:center;border-bottom:1px dashed #000;padding-bottom:6px;margin-bottom:6px}h3{margin:0;font-size:15px}h4{margin:4px 0;font-size:13px}.prep-ticket-number{font-size:15px}'+
    '.prep-ticket-meta,.thermal-row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin:4px 0}.prep-ticket-meta>span,.thermal-row>span{flex:0 0 38%;min-width:0}.prep-ticket-meta b,.thermal-row b{flex:1;min-width:0;text-align:right;overflow-wrap:anywhere}'+
    '.prep-ticket-items,.thermal-items{border-top:1px dashed #000;margin-top:8px;padding-top:4px}.prep-ticket-item,.thermal-item{padding:6px 0;break-inside:avoid;page-break-inside:avoid}.prep-ticket-item strong{font-size:13px}.prep-ticket-item p,.thermal-item p{margin:3px 0 0;font-size:10px;overflow-wrap:anywhere}'+
    '.thermal-item-line{display:flex;gap:6px;justify-content:space-between}.thermal-item-line span{flex:1;min-width:0}.thermal-item-line b{flex-shrink:0;white-space:nowrap}.thermal-totals{border-top:1px dashed #000;padding-top:5px}.thermal-grand-total{font-size:13px}'+
    'footer{margin-top:8px;border-top:1px dashed #000;padding-top:6px;text-align:center;font-size:10px}'+
    '</style></head><body>'+markup+'</body></html>';
}
let thermalPrintFrame=null;
function printThermalDocument(html,title,onCleanup=()=>{}) {
  // Keep the ticket copy hidden on screen and visible only to the print engine.
  // On mobile, retain it past early afterprint events until the next user action.
  if(thermalPrintCleanup)thermalPrintCleanup();
  const parsed=new DOMParser().parseFromString(html,'text/html');
  const root=document.createElement('div');root.id='quvoThermalPrintRoot';
  root.style.display='none';
  root.innerHTML=parsed.body.innerHTML;
  root.style.width='48mm';root.style.font='11px/1.35 Arial,sans-serif';
  const slips=Array.from(root.querySelectorAll('.prep-ticket'));
  slips.forEach((slip,index)=>{
    slip.style.setProperty('break-after',index===slips.length-1?'auto':'page','important');
    slip.style.setProperty('page-break-after',index===slips.length-1?'auto':'always','important');
  });
  const style=document.createElement('style');style.id='quvoThermalPrintStyle';
  // Scope the ticket rules so workspace preview styles cannot change printouts.
  let css=Array.from(parsed.querySelectorAll('style'),node=>node.textContent).join('\n');
  css=css.replace(/([^{}]+)\{/g,(rule,selectors)=>{
    if(selectors.trim().startsWith('@'))return rule;
    return selectors.split(',').map(selector=>{
      const value=selector.trim();
      return /^(html|body)$/.test(value)?value:'#quvoThermalPrintRoot '+value;
    }).join(',')+'{';
  });
  style.textContent='@media print{'+css+
    'html,body{display:block!important;position:static!important;width:58mm!important;max-width:58mm!important;height:auto!important;min-height:0!important;overflow:visible!important;transform:none!important;background:#fff!important}'+
    'body>*:not(#quvoThermalPrintRoot),dialog,dialog::backdrop{display:none!important}'+
    'body::before,body::after{display:none!important;content:none!important}'+
    '#quvoThermalPrintRoot{display:block!important;position:static!important;margin:0!important;padding:0!important;width:48mm!important;max-width:48mm!important;font:11px/1.35 Arial,sans-serif!important;color:#000!important;background:#fff!important;text-align:left!important}'+
    '#quvoThermalPrintRoot .prep-ticket,#quvoThermalPrintRoot .thermal-receipt{border:0!important;margin:0!important;box-shadow:none!important;background:#fff!important;color:#000!important;font:inherit!important}'+
    '#quvoThermalPrintRoot p{color:#000!important}}';
  const oldTitle=document.title;
  const mobile=typeof navigator!=='undefined'&&(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1));
  document.body.append(root);document.head.append(style);document.title=title;thermalPrintFrame=root;
  let cleaned=false;
  const cleanup=()=>{
    if(cleaned)return;cleaned=true;window.removeEventListener('afterprint',afterPrint);
    for(const type of ['pointerdown','keydown','click'])window.removeEventListener(type,cleanup,true);
    root.remove();style.remove();document.title=oldTitle;
    if(thermalPrintFrame===root)thermalPrintFrame=null;
    if(thermalPrintCleanup===cleanup)thermalPrintCleanup=null;
    onCleanup();
  };
  const afterPrint=()=>{document.title=oldTitle;if(!mobile)cleanup();};
  thermalPrintCleanup=cleanup;
  window.addEventListener('afterprint',afterPrint);
  if(mobile)for(const type of ['pointerdown','keydown','click'])window.addEventListener(type,cleanup,true);
  // Parse the stylesheet synchronously without displaying a ticket-only screen.
  void style.sheet.cssRules.length;
  try{window.print();}
  catch(error){cleanup();showToast('Could not open printing. Check your print service and try again.');return null;}
  return root;
}
let thermalPrintCleanup=null;
