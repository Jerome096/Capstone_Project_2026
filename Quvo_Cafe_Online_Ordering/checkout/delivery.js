(() => {
  const model={settings:null,loading:false,error:'',request:0,booking:null,bookingBusy:false,imageRequest:0};
  const node=id=>document.getElementById(id);
  const selected=()=>getSelectedFulfillment()!=='Pickup';
  function render(){
    const settings=model.settings,locked=onlineCartLocked(),image=online.pending?.payload.booking_image||model.booking;
    node('deliveryAddress').value=settings?.address||'';
    node('deliverySetupStatus').textContent=model.loading?'Loading café pickup details…':model.error||(!settings?.available?'Café pickup details are unavailable. Choose Pickup or contact Quvo.':'');
    node('deliverySetupStatus').hidden=Boolean(settings?.available&&!model.loading&&!model.error);
    node('deliverySettingsRetry').hidden=!(model.error||settings&&!settings.available);
    node('copyCafeAddress').disabled=!settings?.address||model.loading;
    const facebook=node('deliveryFacebook');facebook.hidden=!settings?.facebook;
    if(settings?.facebook)facebook.href=settings.facebook;else facebook.removeAttribute('href');
    node('deliveryPhoneContact').hidden=!settings?.phone;
    node('deliveryPhone').value=settings?.phone||'';
    node('copyCafePhone').disabled=!settings?.phone||model.loading;
    const map=node('deliveryMap');if(selected()&&!map.hasAttribute('src'))map.src=map.dataset.src;
    node('deliveryBookingStep').hidden=!selected();
    const preview=node('deliveryBookingPreview');preview.hidden=!image;if(image)preview.src=image;else preview.removeAttribute('src');
    node('removeDeliveryBooking').hidden=!image;node('removeDeliveryBooking').disabled=locked||model.bookingBusy;
    node('deliveryBookingImage').disabled=locked||model.bookingBusy||window.QuvoOrdering?.isClosed()===true;
    node('deliveryBookingButtonText').textContent=image?'Replace booking screenshot':'Choose Lalamove screenshot';
    node('deliveryBookingStatus').textContent=model.bookingBusy?'Checking booking screenshot…':image?'Booking screenshot attached for Quvo to review.':'Required for delivery: show the booking reference, rider and pickup details.';
  }
  async function refresh(){
    const request=++model.request;model.loading=true;model.error='';render();
    try {
      const result=await onlineApi(null,'delivery-settings');if(request!==model.request)return;
      if(!result.delivery||typeof result.delivery.address!=='string'||typeof result.delivery.version!=='string')throw new Error('Café pickup details could not load.');
      model.settings=result.delivery;
    }catch(error){if(request===model.request){model.settings=null;model.error=error.message;}}
    finally{if(request===model.request){model.loading=false;renderCart();}}
  }
  function update(){
    if(selected()&&!model.settings&&!model.loading&&!model.error)refresh();
    render();
  }
  async function choose(event){
    if(onlineCartLocked()||model.bookingBusy)return;
    const file=event.target.files?.[0];if(!file)return;
    const request=++model.imageRequest,generation=online.generation;model.booking=null;model.bookingBusy=true;event.target.value='';renderCart();
    try {
      const converted=await quvoUploadImage(file);
      const image=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Could not read the booking screenshot.'));reader.readAsDataURL(converted);});
      if(request===model.imageRequest&&generation===online.generation)model.booking=image;
    }catch(error){showToast(error.message);}
    finally{if(request===model.imageRequest){model.bookingBusy=false;renderCart();}}
  }
  function clear(){model.imageRequest++;model.booking=null;model.bookingBusy=false;node('deliveryBookingImage').value='';}
  async function copy(field,value,message){
    if(!value)return;
    try {await navigator.clipboard.writeText(value);showToast(message);}
    catch {
      const input=node(field);input.focus();input.select();let copied=false;
      try{copied=document.execCommand('copy');}catch{}
      showToast(copied?message:'Select and copy the '+(field==='deliveryPhone'?'phone number':'café pickup address')+' above.');
    }
  }
  function bind(){
    node('deliveryBookingImage').addEventListener('change',choose);
    node('removeDeliveryBooking').addEventListener('click',()=>{if(onlineCartLocked()||model.bookingBusy)return;clear();renderCart();});
    node('copyCafeAddress').addEventListener('click',()=>copy('deliveryAddress',model.settings?.address,'Quvo pickup address copied. Paste it into Lalamove.'));
    node('copyCafePhone').addEventListener('click',()=>copy('deliveryPhone',model.settings?.phone,'Quvo phone number copied.'));
    node('deliverySettingsRetry').addEventListener('click',refresh);
  }
  const ready=()=>!selected()||Boolean(model.settings?.available&&!model.loading&&!model.bookingBusy&&model.booking);
  function payload(){
    if(!ready())throw new Error('Review the café pickup details and upload your Lalamove booking screenshot first.');
    return {delivery_flow:'lalamove-v1',delivery_config_version:model.settings.version,booking_image:model.booking};
  }
  window.QuvoDelivery={bind,update,refresh,ready,payload,clear};
})();
