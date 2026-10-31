(() => {
  const requests=new WeakMap();
  async function load(section,orderId){
    const previous=requests.get(section);if(previous?.url)URL.revokeObjectURL(previous.url);
    const request={};requests.set(section,request);
    const image=section.querySelector('img'),status=section.querySelector('[role="status"]'),retry=section.querySelector('[data-booking-retry]'),link=section.querySelector('[data-booking-link]');
    const url=quvoPath('api/orders/index.php?delivery_booking='+encodeURIComponent(orderId));
    image.hidden=true;image.removeAttribute('src');status.textContent='Loading the customer’s Lalamove booking screenshot…';
    retry.hidden=true;link.hidden=true;link.href=url;
    const current=()=>section.isConnected&&requests.get(section)===request;
    try{
      const response=await fetch(url,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
      if(!current())return;
      if(response.status===404)throw new Error('No Lalamove booking screenshot is saved for this order. If the customer uploaded one, check the order’s saved uploads before requesting it again.');
      if(response.status===401)throw new Error('Sign in again to view the customer’s booking screenshot.');
      if(response.status===403)throw new Error('Your account cannot view this booking screenshot.');
      if(!response.ok)throw new Error('Could not load the booking screenshot. Retry or open the full image.');
      if(!/^image\/(png|jpeg)(;|$)/i.test(response.headers.get('Content-Type')||''))throw new Error('The server did not return a booking image. Check that the delivery update is installed completely.');
      const blob=await response.blob();if(!current())return;
      const objectUrl=URL.createObjectURL(blob);request.url=objectUrl;
      image.onload=()=>{URL.revokeObjectURL(objectUrl);if(!current())return;image.hidden=false;status.textContent='Customer’s Lalamove booking screenshot. Verify the rider and agreed pickup time.';};
      image.onerror=()=>{URL.revokeObjectURL(objectUrl);if(!current())return;image.hidden=true;status.textContent='The saved booking image could not display. Retry or open the full image.';retry.hidden=false;};
      image.src=objectUrl;link.hidden=false;
    }catch(error){if(!current())return;status.textContent=error.name==='TimeoutError'?'Loading timed out. Retry the booking screenshot.':error.message;retry.hidden=false;link.hidden=false;}
    retry.onclick=()=>load(section,orderId);
  }
  window.QuvoStaffDeliveryProof={load};
})();
