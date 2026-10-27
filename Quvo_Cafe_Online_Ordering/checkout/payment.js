// Checkout requires a configured QR and a receipt; only the cashier confirms payment.
const checkoutPayment = {methods:{},receipt:null,receiptCents:null,receiptBusy:false,qrLoaded:false,loading:false,request:0};
function selectedOnlinePayment() {
  return document.querySelector('input[name="paymentMethod"]:checked')?.value || "";
}
function onlinePaymentReady() {
  return (!window.QuvoDelivery||QuvoDelivery.ready()) && !checkoutPayment.loading && !checkoutPayment.receiptBusy && checkoutPayment.qrLoaded &&
    Boolean(checkoutPayment.methods[selectedOnlinePayment()]?.available && checkoutPayment.receipt) &&
    checkoutPayment.receiptCents===Math.round(getCartSubtotal()*100);
}
function paymentQrUrl(method,version,download=false) {
  return "api/index.php?view=payment-qr&method="+encodeURIComponent(method)+"&version="+encodeURIComponent(version)+(download?"&download=1":"");
}
function renderOnlinePaymentOptions() {
  const chosen=online.pending?.payload.payment_method||selectedOnlinePayment();
  const entries=Object.entries(checkoutPayment.methods),e=escapeCustomerHtml;
  const selected=entries.some(([code])=>code===chosen)?chosen:entries[0]?.[0];
  if(chosen && chosen!==selected && !online.pending)clearOnlinePaymentReceipt();
  document.getElementById('onlinePaymentOptions').innerHTML=entries.length?entries.map(([code,entry])=>
    '<label class="payment-option"><input name="paymentMethod" type="radio" value="'+e(code)+'" '+(selected===code?'checked ':'')+(onlineCartLocked()?'disabled':'')+' /><span>'+e(entry.label||code)+'</span></label>').join(''):
    '<p class="small-copy">No online payment methods are currently available.</p>';
}
function renderOnlinePayment() {
  if(!online.pending && checkoutPayment.receipt && checkoutPayment.receiptCents!==Math.round(getCartSubtotal()*100)) {
    clearOnlinePaymentReceipt();showToast("The total changed. Attach a receipt covering the updated total.");
  }
  const orderingPaused=window.QuvoOrdering?.isClosed()===true;
  const method=selectedOnlinePayment(),entry=checkoutPayment.methods[method];
  const label=entry?.label||method;
  const image=document.getElementById("paymentQrImage"),download=document.getElementById("paymentQrDownload");
  document.getElementById("paymentQrAmount").textContent=formatCurrency(getCartSubtotal());
  document.getElementById("paymentQrStatus").textContent=orderingPaused?"Ordering is paused. Please wait until ordering reopens before making a payment.":checkoutPayment.loading?"Checking payment options…":
    !method?"No payment methods are available. Please contact the café.":
    !entry?.available?label+" is unavailable. The café has not configured its payment QR code.":
    "Pay using the "+label+" QR code below.";
  image.hidden=orderingPaused || !entry?.available || checkoutPayment.loading;
  document.getElementById("paymentQrPlaceholder").hidden=!image.hidden;
  document.getElementById("paymentQrInstructions").hidden=image.hidden;
  download.hidden=image.hidden || !checkoutPayment.qrLoaded;
  if (!image.hidden) {
    image.alt=label+" payment QR code";
    const src=paymentQrUrl(method,entry.version);
    if (image.getAttribute("src")!==src) {checkoutPayment.qrLoaded=false;image.src=src;download.hidden=true;}
    download.href=paymentQrUrl(method,entry.version,true);
  } else {image.removeAttribute("src");checkoutPayment.qrLoaded=false;}
  const receipt=online.pending?.payload.receipt_image || checkoutPayment.receipt;
  const preview=document.getElementById("paymentReceiptPreview");
  preview.hidden=!receipt;if(receipt)preview.src=receipt;else preview.removeAttribute("src");
  const remove=document.getElementById("removePaymentReceipt");
  remove.hidden=!receipt;
  remove.disabled=onlineCartLocked() || checkoutPayment.receiptBusy;
  document.getElementById("onlinePaymentReceipt").disabled=orderingPaused || onlineCartLocked() || !entry?.available || checkoutPayment.loading || checkoutPayment.receiptBusy;
  document.getElementById("paymentReceiptButtonText").textContent=receipt?"Replace receipt image":"Choose receipt image";
  document.getElementById("paymentReceiptStatus").textContent=checkoutPayment.receiptBusy?"Checking receipt…":receipt?"Receipt attached. Ready for cashier review.":
    !entry?.available?"Receipt upload will be available once the payment QR is added.":"Upload your receipt to place the order.";
}
async function refreshOnlinePayment() {
  const request=++checkoutPayment.request,generation=online.generation;
  checkoutPayment.loading=true;checkoutPayment.qrLoaded=false;renderCart();
  try {
    const result=await onlineApi(null,"payments");
    if(request!==checkoutPayment.request || generation!==online.generation)return;
    const previous=checkoutPayment.methods[selectedOnlinePayment()]?.version;
    checkoutPayment.methods=result.methods;
    renderOnlinePaymentOptions();
    if(previous && previous!==result.methods[selectedOnlinePayment()]?.version && !online.pending) {
      clearOnlinePaymentReceipt();showToast("The payment QR changed. Contact the café if you have already paid.");
    }
  } catch(error) {
    if(request!==checkoutPayment.request || generation!==online.generation)return;
    checkoutPayment.methods={};renderOnlinePaymentOptions();showToast(error.message);
  } finally {
    if(request===checkoutPayment.request) {checkoutPayment.loading=false;renderCart();}
  }
}
function clearOnlinePaymentReceipt() {
  checkoutPayment.receipt=null;
  checkoutPayment.receiptCents=null;
  document.getElementById("onlinePaymentReceipt").value="";
}
async function chooseOnlineReceipt(event) {
  if(onlineCartLocked() || checkoutPayment.receiptBusy)return;
  const file=event.target.files?.[0];
  // Capture the file before clearing the input so replacing an invalid image is safe.
  clearOnlinePaymentReceipt();
  if(!file)return renderCart();
  const generation=online.generation,method=selectedOnlinePayment(),cents=Math.round(getCartSubtotal()*100);
  checkoutPayment.receiptBusy=true;renderCart();
  try {
    const converted=await quvoUploadImage(file);
    const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error("Could not read the receipt."));reader.readAsDataURL(converted);});
    if(generation===online.generation && method===selectedOnlinePayment()) {checkoutPayment.receipt=data;checkoutPayment.receiptCents=cents;}
  } catch(error) {showToast(error.message);}
  finally {checkoutPayment.receiptBusy=false;renderCart();}
}
function bindOnlinePayment() {
  document.getElementById("removePaymentReceipt").addEventListener("click",()=>{
    if(onlineCartLocked() || checkoutPayment.receiptBusy)return;
    clearOnlinePaymentReceipt();
    renderCart();
    const input=document.getElementById("onlinePaymentReceipt");
    if(!input.disabled)input.focus();
  });
  document.getElementById('onlinePaymentOptions').addEventListener("change",event=>{
    if(event.target.name!=='paymentMethod')return;
    if(onlineCartLocked())return;
    clearOnlinePaymentReceipt();checkoutPayment.qrLoaded=false;refreshOnlinePayment();
  });
  document.getElementById("onlinePaymentReceipt").addEventListener("change",chooseOnlineReceipt);
  document.getElementById("paymentQrImage").addEventListener("load",()=>{checkoutPayment.qrLoaded=true;renderCart();});
  document.getElementById("paymentQrImage").addEventListener("error",()=>{
    checkoutPayment.qrLoaded=false;
    document.getElementById("paymentQrStatus").textContent="The QR image could not load. Reopen the cart to retry.";
    document.getElementById("paymentQrDownload").hidden=true;
    submitOrderBtn.disabled=!online.pending;
  });
}
