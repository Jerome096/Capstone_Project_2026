const registerForm=document.getElementById("registerForm");
const registerError=document.getElementById("registerError");
async function handleRegister(event){
  event.preventDefault();
  await onlineForm(registerForm,registerError,async()=>{
    const password=document.getElementById("registerPassword").value;
    if(password!==document.getElementById("registerPasswordConfirm").value)throw new Error("Passwords do not match.");
    if(!online.csrf)await onlineApi();
    const result=await onlineApi({action:"register",name:document.getElementById("registerName").value.trim(),
      email:document.getElementById("registerEmail").value.trim(),contact:document.getElementById("registerContact").value.trim(),
      password});
    registerForm.reset();const selectionHandled=await enterOnlineAccount(result.account);if(!selectionHandled)showToast("Account created.");
  });
}
function bindRegisterEvents(){registerForm.addEventListener("submit",handleRegister);}
