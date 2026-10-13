const loginScreen=document.getElementById("loginScreen"),appShell=document.getElementById("appShell");
function bindKitchenLogin(){
  document.getElementById("loginForm").addEventListener("submit",async event=>{
    event.preventDefault();const button=document.getElementById('kitchenSignIn');button.disabled=true;document.getElementById('loginError').textContent='';
    try{if(!kitchenSql.csrf){const session=await kitchenApi(null,'?action=session');kitchenSql.csrf=session.csrf;}
      const data=await kitchenApi({action:'login',username:document.getElementById('username').value,password:document.getElementById('password').value});kitchenSql.csrf=data.csrf;kitchenSql.revision++;document.getElementById('password').value='';setKitchenUser(data.user);await loadKitchenOrders();
    }catch(error){document.getElementById('loginError').textContent=error.message;}finally{button.disabled=false;}
  });
  document.getElementById("logoutBtn").addEventListener("click",async()=>{
    if(kitchenSql.changing)return;try{const data=await kitchenApi({action:'logout'});kitchenSql.csrf=data.csrf;kitchenSql.revision++;setKitchenUser(null);}
    catch(error){if(error.status===401){kitchenSql.revision++;setKitchenUser(null);}else showToast(error.message);}
  });
}
