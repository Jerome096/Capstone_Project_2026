const loginForm=document.getElementById("loginForm");
const loginError=document.getElementById("loginError");
function startOnlineFlow(){resetOnlineView();}
function switchAuthTab(tab){
  state.authMode=tab;
  document.querySelectorAll(".auth-tab").forEach(button=>button.classList.toggle("active",button.dataset.authTab===tab));
  loginForm.classList.toggle("active",tab==="login");registerForm.classList.toggle("active",tab==="register");
  loginError.textContent="";registerError.textContent="";
}
async function handleLogin(event){
  event.preventDefault();
  await onlineForm(loginForm,loginError,async()=>{
    if(!online.csrf)await onlineApi();
    const result=await onlineApi({action:"login",email:document.getElementById("loginEmail").value.trim(),password:document.getElementById("loginPassword").value});
    loginForm.reset();await enterOnlineAccount(result.account);showToast("Welcome back.");
  });
}
function bindLoginEvents(){
  loginForm.addEventListener("submit",handleLogin);
  document.querySelectorAll("[data-auth-tab]").forEach(button=>button.addEventListener("click",()=>switchAuthTab(button.dataset.authTab)));
}
