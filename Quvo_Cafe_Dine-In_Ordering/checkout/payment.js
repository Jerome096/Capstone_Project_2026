(function(){
 'use strict';
 const $=id=>document.getElementById(id),model={choice:'counter',methods:{},method:'',receipt:null,receiptCents:null,reference:'',loading:false,receiptBusy:false,qrLoaded:false,request:0,generation:0,visit:''};
 const pending=()=>dineOrders.pending?.payload,choice=()=>pending()?.payment_choice||model.choice;
 const cents=()=>Math.round(Number(dineMoneyTotal())*100);
 const qrUrl=(method,version,download=false)=>'api/orders.php?table='+encodeURIComponent(guestTableCode)+'&view=payment-qr&method='+encodeURIComponent(method)+'&version='+encodeURIComponent(version)+(download?'&download=1':'');
 function clearReceipt(keepReference=false){model.receipt=null;model.receiptCents=null;$('dinePaymentReceipt').value='';if(!keepReference){model.reference='';$('dinePaymentReference').value='';}}
 function reset(){model.generation++;model.request++;Object.assign(model,{choice:'counter',methods:{},method:'',receipt:null,receiptCents:null,reference:'',loading:false,receiptBusy:false,qrLoaded:false,visit:''});clearReceipt();render();}
 function ready(){return !!pending()||choice()==='counter'||(!model.loading&&!model.receiptBusy&&model.qrLoaded&&model.methods[model.method]?.available&&!!model.receipt&&model.receiptCents===cents());}
 function render(){
  if(!$('dinePaymentPanel'))return;
  const p=pending(),qr=choice()==='qr',locked=dineCartLocked(),blocked=!state.sessionApproved||!!window.QuvoOrdering&&window.QuvoOrdering.isClosed(),total=cents();
  if(!p&&model.receipt&&model.receiptCents!==total)clearReceipt();
  document.querySelectorAll('[name=dinePaymentChoice]').forEach(input=>{input.checked=input.value===choice();input.disabled=locked||model.receiptBusy;});
  $('dineQrCheckout').hidden=!qr;$('dineCashierNote').hidden=true;
  $('paymentNote').textContent=qr?'Upload your receipt before submitting. The cashier verifies your payment before preparation begins.':'Submit your order, then pay at the cashier. Preparation starts after payment is confirmed.';
  $('dineQrAmount').textContent=formatCurrency(total/100);$('dinePaymentRefresh').disabled=locked||model.loading||model.receiptBusy;
  const entry=model.methods[model.method],method=p?.payment_method||model.method;
  $('dinePaymentMethods').innerHTML=p?'<p class="small-copy">Submitted payment method: '+escapeCustomerHtml(model.methods[method]?.label||method||'QR payment')+'</p>':Object.entries(model.methods).map(([code,m])=>'<label><input type="radio" name="dineQrMethod" value="'+escapeCustomerHtml(code)+'" '+(code===model.method?'checked ':'')+(locked||model.loading||model.receiptBusy?'disabled ':'')+'/><span>'+escapeCustomerHtml(m.label||code)+'</span></label>').join('');
  const image=$('dinePaymentQr'),show=qr&&!p&&!blocked&&total>0&&entry?.available&&!model.loading;
  if(show){const src=qrUrl(model.method,entry.version);if(image.getAttribute('src')!==src){model.qrLoaded=false;image.src=src;}else if(image.complete&&image.naturalWidth>0)model.qrLoaded=true;image.alt=(entry.label||model.method)+' payment QR';}
  else{image.removeAttribute('src');model.qrLoaded=false;}
  image.hidden=!show;$('dinePaymentQrPlaceholder').hidden=!!show;$('dineQrInstructions').hidden=!show;
  $('dinePaymentQrPlaceholder').textContent=p?'Receipt submitted. Use Retry order to recover this submission; do not pay again.':total<=0?'Add items to your cart to see the amount and QR.':blocked?'Ordering is closed or your table session needs approval.':model.loading?'Loading payment methods...':'Choose an available payment method.';
  const download=$('dinePaymentQrDownload');download.hidden=!show||!model.qrLoaded;if(show)download.href=qrUrl(model.method,entry.version,true);else download.removeAttribute('href');
  const reference=$('dinePaymentReference'),value=p?(p.payment_reference||''):model.reference;if(reference.value!==value)reference.value=value;reference.disabled=locked||blocked||model.loading||model.receiptBusy||!entry?.available||total<=0;
  const receipt=p?.receipt_image||model.receipt,preview=$('dineReceiptPreview');preview.hidden=!receipt;if(receipt)preview.src=receipt;else preview.removeAttribute('src');
  $('dinePaymentReceipt').disabled=locked||blocked||model.loading||model.receiptBusy||!entry?.available||total<=0;
  $('dineReceiptRemove').hidden=!receipt;$('dineReceiptRemove').disabled=locked||model.receiptBusy;
  $('dineReceiptButtonText').textContent=receipt?'Replace receipt image':'Choose receipt image';
  $('dineReceiptStatus').textContent=p?'This receipt belongs to the locked submission.':model.receiptBusy?'Checking receipt image...':receipt?'Receipt attached. Submit for cashier review.':'Upload your receipt to place the QR payment order.';
 }
 async function refresh(){
  if(!state.sessionApproved||pending()||model.loading)return;
  const request=++model.request,generation=model.generation,visit=dineOrders.sessionId+'|'+guestTableCode,old=model.methods[model.method]?.version;model.loading=true;$('dinePaymentStatus').textContent='Loading payment methods...';renderCart();
  try{const result=await dineOrderApi(null,'&view=payments');if(request!==model.request||generation!==model.generation||visit!==dineOrders.sessionId+'|'+guestTableCode)return;
   model.methods=result.methods||{};model.visit=visit;
   if(!model.methods[model.method]?.available)model.method=Object.keys(model.methods)[0]||'';
   if(old&&old!==model.methods[model.method]?.version){clearReceipt();showToast('The QR options changed. Ask the cashier to check any payment already sent before paying again.');}
   model.qrLoaded=false;$('dinePaymentStatus').textContent=Object.keys(model.methods).length?'Choose a method, scan its QR and attach your receipt.':'No QR payment methods are available. You can pay at the counter.';
  }catch(error){if(request===model.request&&generation===model.generation){model.methods={};model.method='';$('dinePaymentStatus').textContent=error.message+' You can choose Pay at counter.';}}
  finally{if(request===model.request&&generation===model.generation){model.loading=false;renderCart();}}
 }
 async function upload(event){
  if(dineCartLocked()||model.receiptBusy)return;const file=event.target.files?.[0];clearReceipt(true);if(!file)return renderCart();
  const generation=model.generation,method=model.method,amount=cents();model.receiptBusy=true;renderCart();
  try{const converted=await quvoUploadImage(file);const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Could not read the receipt image.'));reader.readAsDataURL(converted);});if(generation===model.generation&&method===model.method&&amount===cents()&&choice()==='qr'){model.receipt=data;model.receiptCents=amount;}}
  catch(error){showToast(error.message);}finally{if(generation===model.generation){model.receiptBusy=false;renderCart();}}
 }
 function payload(){if(choice()==='counter')return {payment_choice:'counter'};if(!ready())throw Error('Choose a payment QR and upload your receipt first.');return {payment_choice:'qr',payment_method:model.method,payment_qr_version:model.methods[model.method].version,receipt_image:model.receipt,payment_reference:model.reference.trim()};}
 function bind(){
  $('dinePaymentReference').addEventListener('input',event=>{if(!dineCartLocked())model.reference=event.target.value;});
  document.querySelectorAll('[name=dinePaymentChoice]').forEach(input=>input.addEventListener('change',()=>{if(dineCartLocked())return;model.choice=input.value;clearReceipt();renderCart();if(model.choice==='qr')refresh();}));
  $('dinePaymentMethods').addEventListener('change',event=>{if(event.target.name!=='dineQrMethod'||dineCartLocked())return;model.method=event.target.value;clearReceipt();model.qrLoaded=false;renderCart();});
  $('dinePaymentRefresh').addEventListener('click',refresh);$('dinePaymentReceipt').addEventListener('change',upload);$('dineReceiptRemove').addEventListener('click',()=>{if(!dineCartLocked()){clearReceipt();renderCart();}});
  $('dinePaymentQr').addEventListener('load',()=>{model.qrLoaded=true;renderCart();});$('dinePaymentQr').addEventListener('error',()=>{model.qrLoaded=false;$('dinePaymentStatus').textContent='The QR image could not load. Refresh methods to retry, or pay at the counter.';renderCart();});
 }
 window.QuvoDinePayment={ready,render,refresh,reset,payload,bind};
})();
