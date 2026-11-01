let paymentQrSaving=false;
const qrAdminNotice=document.getElementById('paymentQrAdminNotice');
const qrMethodCards=document.getElementById('paymentMethodCards');
let adminPaymentMethods={};
function qrAdminMessage(message,state='success') {qrAdminNotice.textContent=message;qrAdminNotice.dataset.state=state;}
async function adminPaymentQrRequest(form=null) {
  const response=await fetch('../api/payment-qr/index.php',{
    method:form?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),
    headers:form?{'X-CSRF-Token':window.QUVO_CSRF||''}:{},...(form?{body:form}:{})
  });
  const data=await response.json();if(!response.ok||!data.ok)throw new Error(data.error||'Could not update payment methods.');return data;
}
function showAdminPaymentQr(methods) {
  adminPaymentMethods=methods;qrMethodCards.replaceChildren();
  for(const [code,entry] of Object.entries(methods)) {
    const form=document.getElementById('paymentMethodCardTemplate').content.firstElementChild.cloneNode(true);
    form.dataset.method=code;form.dataset.available=String(Boolean(entry.available));
    form.querySelector('h2').textContent=entry.label||code;
    form.querySelector('.qr-state').textContent=entry.available?'QR saved':'No QR image';
    form.elements.online_enabled.checked=entry.onlineEnabled!==false;
    form.querySelector('.qr-channel-status').textContent=entry.onlineEnabled===false?'In-store only. Hidden from online ordering.':entry.available?'Available online and in-store.':'Available in-store. Online checkout needs a QR image.';
    form.querySelector('.qr-empty').hidden=Boolean(entry.available);
    form.querySelector('[data-action="remove_qr"]').hidden=!entry.available;
    const image=form.querySelector('.qr-preview');image.hidden=!entry.available;image.alt=(entry.label||code)+' payment QR';
    if(entry.available)image.src='../api/payment-qr/index.php?image='+encodeURIComponent(code)+'&version='+encodeURIComponent(entry.version);
    form.elements.image.setAttribute('aria-label','Choose '+(entry.label||code)+' QR image');
    qrMethodCards.append(form);
  }
  if(!Object.keys(methods).length) {const empty=document.createElement('p');empty.className='qr-method-empty';empty.textContent='No digital payment methods. Add a method to get started.';qrMethodCards.append(empty);}
}
function qrSetBusy(value) {
  paymentQrSaving=value;
  document.querySelectorAll('.payment-qr-admin button,.payment-qr-admin input').forEach(el=>el.disabled=value);
}
async function changeAdminPayment(payload,message) {
  if(paymentQrSaving)return false;qrSetBusy(true);qrAdminMessage('Saving changes…','saving');
  try {const result=await adminPaymentQrRequest(payload);showAdminPaymentQr(result.methods);qrAdminMessage(message);return true;}
  catch(error) {qrAdminMessage(error.message,'error');return false;}
  finally {qrSetBusy(false);}
}
qrMethodCards.addEventListener('change',event=>{
  const form=event.target.closest('form[data-method]');if(!form)return;
  if(event.target.name==='online_enabled'){form.querySelector('.qr-channel-status').textContent='Availability changed. Click Save availability to apply.';return;}
  form.querySelector('.qr-file-name').textContent=form.elements.image.files[0]?.name||'No image selected';
  form.querySelector('[data-action="clear_file"]').hidden=!form.elements.image.files.length;
});
qrMethodCards.addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-method]');if(!form)return;event.preventDefault();if(paymentQrSaving)return;
  const file=form.elements.image.files[0];
  let converted;
  qrSetBusy(true);qrAdminMessage('Checking image…','saving');
  try {converted=await quvoUploadImage(file);}
  catch(error) {qrAdminMessage(error.message,'error');return;}
  finally {qrSetBusy(false);}
  const payload=new FormData(form);payload.set('image',converted);payload.set('action','save_qr');payload.set('payment_method',form.dataset.method);
  await changeAdminPayment(payload,(adminPaymentMethods[form.dataset.method]?.label||form.dataset.method)+' QR saved.');
});
qrMethodCards.addEventListener('click',async event=>{
  const button=event.target.closest('[data-action]'),form=button?.closest('form[data-method]');if(!form||paymentQrSaving)return;
  const action=button.dataset.action,code=form.dataset.method,label=adminPaymentMethods[code]?.label||code;
  if(action==='set_visibility'){
    const enabled=form.elements.online_enabled.checked,payload=new FormData();payload.set('action',action);payload.set('payment_method',code);payload.set('online_enabled',enabled?'1':'0');
    await changeAdminPayment(payload,enabled?label+' online visibility enabled. A saved QR is required for online checkout.':label+' is now in-store only.');return;
  }
  if(action==='clear_file') {form.elements.image.value='';form.querySelector('.qr-file-name').textContent='No image selected';button.hidden=true;return;}
  const confirmation=action==='remove_qr'?'Remove the saved '+label+' QR image? Online checkout using this method will be unavailable until another QR is uploaded. The method stays available in-store.':
    'Remove '+label+' from new in-store and online payment options? Its QR will be removed. Past orders and receipts will be kept.';
  if(!window.confirm(confirmation))return;
  const payload=new FormData();payload.set('action',action);payload.set('payment_method',code);
  await changeAdminPayment(payload,action==='remove_qr'?label+' QR removed. The method stays available in-store.':label+' removed from new payment options.');
});
const addMethodModal=document.getElementById('addPaymentMethodModal');
document.getElementById('addPaymentMethodOpen').addEventListener('click',()=>{
  document.getElementById('addPaymentMethodError').textContent='';addMethodModal.showModal();document.getElementById('paymentMethodName').focus();
});
document.getElementById('addPaymentMethodForm').addEventListener('submit',async event=>{
  event.preventDefault();if(paymentQrSaving)return;
  const name=document.getElementById('paymentMethodName').value.trim();if(!name)return;
  const payload=new FormData(event.target);payload.set('action','add_method');payload.set('display_name',name);
  const enabled=event.target.elements.online_enabled.checked;payload.set('online_enabled',enabled?'1':'0');
  if(await changeAdminPayment(payload,enabled?name+' added for in-store use. Upload its QR image to enable online checkout.':name+' added for in-store use only.')) {event.target.reset();addMethodModal.close();}
  else document.getElementById('addPaymentMethodError').textContent=qrAdminNotice.textContent;
});
adminPaymentQrRequest().then(result=>showAdminPaymentQr(result.methods)).catch(error=>qrAdminMessage(error.message,'error'));
