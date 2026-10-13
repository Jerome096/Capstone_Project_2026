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
  if(thermalPrintFrame)thermalPrintFrame.remove();
  const frame=document.createElement('iframe');frame.title=title;
  frame.style.cssText='position:fixed;left:-10000px;top:0;width:58mm;height:1px;border:0';
  thermalPrintFrame=frame;
  const cleanup=()=>{frame.remove();if(thermalPrintFrame===frame)thermalPrintFrame=null;onCleanup();};
  frame.onload=()=>{
    frame.contentWindow.addEventListener('afterprint',cleanup,{once:true});
    try{frame.contentWindow.focus();frame.contentWindow.print();}
    catch(error){cleanup();showToast('Could not open printing. Check your print service and try again.');}
  };
  frame.srcdoc=html;document.body.append(frame);return frame;
}
