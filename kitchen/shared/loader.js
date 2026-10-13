// Load every module before binding its controls. Serve this folder through HTTP.
(async()=>{
try{
  if(location.protocol==="file:")throw new Error("Open the kitchen through the project PHP server.");
  while(document.querySelector("template[data-fragment]")){
    await Promise.all([...document.querySelectorAll("template[data-fragment]")].map(async placeholder=>{const response=await fetch(placeholder.dataset.fragment,{cache:"no-store"});if(!response.ok)throw new Error("Could not load "+placeholder.dataset.fragment);const template=document.createElement("template");template.innerHTML=await response.text();placeholder.replaceWith(template.content);}));
  }
  for(const src of ["shared/state.js","shared/helpers.js","login/login.js","shared/navigation.js","dashboard/dashboard.js","orders/orders.js","orders/order-details.js","alerts/alerts.js","shared/database.js","shared/bootstrap.js"]){await new Promise((resolve,reject)=>{const script=document.createElement("script");script.src=src+'?v=kitchen-sql-1';script.onload=resolve;script.onerror=()=>reject(new Error("Could not load "+src));document.body.append(script);});}
  document.documentElement.dataset.appReady="true";
}catch(error){const message=document.createElement("p");message.textContent=error.message;message.setAttribute("role","alert");document.body.append(message);}
})();
