const registerForm=document.getElementById("registerForm");
const registerError=document.getElementById("registerError");
const registration={pending:null,receivedAt:0,timer:null};
function registrationSeconds(key){return Math.max(0,Math.ceil(Number(registration.pending?.[key]||0)-(performance.now()-registration.receivedAt)/1000));}
function renderRegistrationTimer(){
  if(!registration.pending)return;
  const remaining=registrationSeconds('expires_in'),cooldown=registrationSeconds('resend_after');
  document.getElementById('registerCodeTimer').textContent=registration.pending.locked?'Too many incorrect attempts. Request a new code.':remaining?'Code expires in '+Math.floor(remaining/60)+':'+String(remaining%60).padStart(2,'0')+'.':'This code has expired. Request a new code.';
  const resend=document.getElementById('registerResend');
  resend.textContent=cooldown?'Resend in '+cooldown+'s':'Resend code';
  resend.disabled=Boolean(cooldown||registerForm.dataset.saving);
}
function setRegistrationPending(pending,focus=true){
  clearInterval(registration.timer);registration.timer=null;
  registration.pending=pending;registration.receivedAt=performance.now();
  const details=document.getElementById('registerDetails'),verification=document.getElementById('registerVerification');
  details.hidden=Boolean(pending);details.disabled=Boolean(pending);
  verification.hidden=!pending;verification.disabled=!pending;
  document.getElementById('registerSubmit').textContent=pending?'Verify & create account':'Submit';
  document.getElementById('registerCode').value='';
  if(pending){
    document.getElementById('registerCodeEmail').textContent=pending.email;
    renderRegistrationTimer();registration.timer=setInterval(renderRegistrationTimer,1000);
    if(focus)document.getElementById('registerCode').focus();
  }
}
async function restoreRegistration(){
  try{const result=await onlineApi(null,'registration-status');if(!state.onlineCustomer)setRegistrationPending(result.registration,false);}catch{}
}
async function handleRegister(event){
  event.preventDefault();
  await onlineForm(registerForm,registerError,async()=>{
    document.getElementById('registerNotice').textContent='';
    if(registration.pending){
      try{
        const result=await onlineApi({action:'register-verify',code:document.getElementById('registerCode').value.trim()});
        registerForm.reset();setRegistrationPending(null);
        const selectionHandled=await enterOnlineAccount(result.account);if(!selectionHandled)showToast('Email verified. Your account is ready.');
      }catch(error){
        if(error.code==='registration_expired')setRegistrationPending(null);
        if(error.code==='verification_locked'){registration.pending.locked=true;renderRegistrationTimer();}
        if(error.code==='verification_expired'){registration.pending.expires_in=0;renderRegistrationTimer();}
        throw error;
      }
      return;
    }
    const password=document.getElementById('registerPassword').value;
    if(password!==document.getElementById('registerPasswordConfirm').value)throw new Error('Passwords do not match.');
    if(!online.csrf)await onlineApi();
    const result=await onlineApi({action:'register',name:document.getElementById('registerName').value.trim(),
      email:document.getElementById('registerEmail').value.trim(),contact:document.getElementById('registerContact').value.trim(),password});
    document.getElementById('registerPassword').value='';document.getElementById('registerPasswordConfirm').value='';
    setRegistrationPending(result.registration);
  });
  renderRegistrationTimer();
}
async function resendRegistrationCode(){
  if(!registration.pending||registrationSeconds('resend_after')||registerForm.dataset.saving)return;
  await onlineForm(registerForm,registerError,async()=>{
    document.getElementById('registerResend').disabled=true;
    try{
      const result=await onlineApi({action:'register-resend'});setRegistrationPending(result.registration);
      document.getElementById('registerNotice').textContent='A new code has been sent. Use the newest email.';
    }catch(error){
      if(error.code==='registration_expired')setRegistrationPending(null);
      else await restoreRegistration();
      throw error;
    }
  });
  renderRegistrationTimer();
}
function bindRegisterEvents(){
  registerForm.addEventListener('submit',handleRegister);
  document.getElementById('registerResend').addEventListener('click',resendRegistrationCode);
  document.getElementById('registerChangeDetails').addEventListener('click',()=>{
    if(registerForm.dataset.saving)return;
    setRegistrationPending(null);registerError.textContent='';document.getElementById('registerNotice').textContent='';
    document.getElementById('registerEmail').focus();
  });
}
