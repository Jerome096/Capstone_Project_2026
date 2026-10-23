const loginForm=document.getElementById("loginForm");
const loginError=document.getElementById("loginError");
function startOnlineFlow(){resetOnlineView(window.QuvoStorefront?.publicScreen()||'screenHome');}
function switchAuthTab(tab){
  state.authMode=tab;
  document.querySelectorAll(".auth-tab").forEach(button=>{const active=button.dataset.authTab===tab;button.classList.toggle("active",active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;});
  loginForm.classList.toggle("active",tab==="login");registerForm.classList.toggle("active",tab==="register");
  loginError.textContent="";registerError.textContent="";
}
async function handleLogin(event){
  event.preventDefault();
  await onlineForm(loginForm,loginError,async()=>{
    if(!online.csrf)await onlineApi();
    const result=await onlineApi({action:"login",email:document.getElementById("loginEmail").value.trim(),password:document.getElementById("loginPassword").value});
    loginForm.reset();const selectionHandled=await enterOnlineAccount(result.account);if(!selectionHandled)showToast("Welcome back.");
  });
}
function bindLoginEvents(){
  loginForm.addEventListener("submit",handleLogin);
  document.querySelectorAll("[data-auth-tab]").forEach(button=>button.addEventListener("click",()=>switchAuthTab(button.dataset.authTab)));
}
