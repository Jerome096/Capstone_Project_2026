(() => {
  const node=id=>document.getElementById(id),allowed=()=>window.QUVO_CONFIG?.allowedScreens?.includes('wifiSettings');
  let saved=null,busy=false,dirty=false,bound=false;
  function controls(){
    node('saveWifiSettings').disabled=busy||!dirty||!saved?.version||saved.setupRequired;
    node('reloadWifiSettings').disabled=busy;
    node('wifiSettingsForm').querySelectorAll('input').forEach(input=>input.disabled=busy||Boolean(saved?.setupRequired));
  }
  function fill(wifi){saved=wifi;node('wifiNetworkName').value=wifi.networkName;node('wifiNetworkPassword').value=wifi.password;node('wifiNetworkPassword').type='password';node('toggleWifiPassword').textContent='Show password';node('toggleWifiPassword').setAttribute('aria-pressed','false');dirty=false;}
  async function request(input){
    const response=await fetch(quvoPath('api/wifi-settings/index.php'),{method:input?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF||''},...(input?{body:JSON.stringify(input)}:{})});
    const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Could not update Wi-Fi details.');return result.wifi;
  }
  async function load(force=false){
    if(!allowed()||busy||(dirty&&!force))return;
    busy=true;controls();node('wifiSettingsError').textContent='';
    try{const wifi=await request();fill(wifi);node('wifiSettingsStatus').textContent=wifi.setupRequired?'Install SQL 24, then reload this module to save Wi-Fi details.':'Dine-in customers can view this note after payment is confirmed.';}
    catch(error){node('wifiSettingsError').textContent=error.message;}
    finally{busy=false;controls();}
  }
  function bind(){
    if(bound||!allowed())return;bound=true;controls();
    node('wifiSettingsForm').addEventListener('input',()=>{dirty=true;controls();});
    node('toggleWifiPassword').addEventListener('click',()=>{const field=node('wifiNetworkPassword'),show=field.type==='password';field.type=show?'text':'password';node('toggleWifiPassword').textContent=show?'Hide password':'Show password';node('toggleWifiPassword').setAttribute('aria-pressed',String(show));});
    node('reloadWifiSettings').addEventListener('click',()=>{if(!dirty||confirm('Discard the unsaved Wi-Fi changes and reload saved details?'))load(true);});
    node('wifiSettingsForm').addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!dirty||!saved?.version||!event.currentTarget.reportValidity())return;
      const input={version:saved.version,networkName:node('wifiNetworkName').value,password:node('wifiNetworkPassword').value};
      busy=true;controls();node('wifiSettingsError').textContent='';
      try{fill(await request(input));node('wifiSettingsStatus').textContent='Saved. Paid dine-in visits receive the latest Wi-Fi details.';showToast('Guest Wi-Fi details saved.');}
      catch(error){node('wifiSettingsError').textContent=error.message;}
      finally{busy=false;controls();}
    });
  }
  window.QuvoWifiSettings={bind,load};
})();
