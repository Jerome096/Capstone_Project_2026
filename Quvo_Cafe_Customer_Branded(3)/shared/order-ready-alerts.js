(() => {
  'use strict';
  const AudioEngine=window.AudioContext||window.webkitAudioContext;
  const vibrationSupported=typeof navigator.vibrate==='function';
  const preferenceKey='quvo_ready_alert_preference';
  let started=false,scope='',audio=null,enabled=false,activating=false,pending=false,lastChime=0;
  let preference='auto',soundError=false,options={},controls,notice;
  let previous=new Map(),announced=new Set(),reminders=new Map();
  const queue=new Map();
  try{preference=sessionStorage.getItem(preferenceKey)||'auto';}catch{}
  const savePreference=value=>{preference=value;try{sessionStorage.setItem(preferenceKey,value);}catch{}};
  function saveSnapshot(){
    if(!scope)return;
    while(previous.size>200)previous.delete(previous.keys().next().value);
    announced=new Set([...announced].filter(id=>previous.has(id)));
    reminders=new Map([...reminders].filter(([id])=>previous.has(id)));
    try{sessionStorage.setItem('quvo_ready_orders_'+scope,JSON.stringify({orders:[...previous],announced:[...announced],reminders:[...reminders]}));}catch{}
  }
  function reset(){scope='';previous=new Map();announced=new Set();reminders=new Map();queue.clear();pending=false;renderNotice();}
  function useScope(value){
    if(scope===value)return;
    reset();scope=value;
    try{
      const saved=JSON.parse(sessionStorage.getItem('quvo_ready_orders_'+scope)||'null');
      if(Array.isArray(saved?.orders))previous=new Map(saved.orders.filter(row=>Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&typeof row[1]==='string').slice(-200));
      if(Array.isArray(saved?.announced))announced=new Set(saved.announced.filter(id=>typeof id==='string'&&previous.has(id)));
      if(Array.isArray(saved?.reminders))reminders=new Map(saved.reminders.filter(row=>Array.isArray(row)&&row.length===2&&typeof row[0]==='string'&&typeof row[1]==='string'&&/^[0-9]{1,20}$/.test(row[1])&&previous.has(row[0])));
    }catch{}
  }
  function renderControls(){
    if(!controls)return;
    const canAlert=Boolean(AudioEngine)||vibrationSupported;
    const active=enabled&&preference!=='off';
    controls.querySelector('strong').textContent=active?'Ready alerts on':'Order ready alerts';
    controls.querySelector('p').textContent=!canAlert?'Ready messages will appear here. Sound and vibration are unavailable in this browser.':
      soundError?'Sound could not start. Tap Enable alerts to try again. Vibration works where supported.':
      active?'Keep this page open. We will alert you when an order is ready. Vibration works where supported.':
      preference==='off'?'Sound and vibration are muted. Order ready messages will still appear.':
      'Turn on alerts, or place an order to enable them. Keep this page open while waiting.';
    const toggle=controls.querySelector('[data-ready-toggle]');
    toggle.textContent=activating?'Enabling alerts…':active&&!soundError?'Mute alerts':AudioEngine?(vibrationSupported?'Enable sound & vibration':'Enable sound'):'Enable vibration';
    toggle.disabled=activating||!canAlert;
    toggle.setAttribute('aria-pressed',String(active));
    controls.querySelector('[data-ready-test]').hidden=!active;
  }
  function play(preview=false){
    if(!enabled||preference==='off'||document.visibilityState==='hidden')return;
    if(!preview&&Date.now()-lastChime<900)return;
    if(!preview)lastChime=Date.now();
    if(vibrationSupported){try{navigator.vibrate(preview?[100]:[180,100,180,100,320]);}catch{}}
    if(!audio||audio.state!=='running'){if(AudioEngine){soundError=true;renderControls();}return;}
    try{
      const start=audio.currentTime+.02;
      for(const [index,frequency] of [659.25,830.61,987.77].entries()){
        const tone=audio.createOscillator(),gain=audio.createGain(),at=start+index*.19;
        tone.type='sine';tone.frequency.value=frequency;
        gain.gain.setValueAtTime(.0001,at);gain.gain.exponentialRampToValueAtTime(.12,at+.025);gain.gain.exponentialRampToValueAtTime(.0001,at+.18);
        tone.connect(gain);gain.connect(audio.destination);
        tone.onended=()=>{tone.disconnect();gain.disconnect();};tone.start(at);tone.stop(at+.19);
      }
    }catch{soundError=true;renderControls();}
  }
  async function enable(preview=false){
    if(activating)return;
    activating=true;savePreference('on');soundError=false;renderControls();
    let timer;
    try{
      if(AudioEngine){
        if(!audio||audio.state==='closed')audio=new AudioEngine();
        if(audio.state!=='running')await Promise.race([audio.resume(),new Promise(resolve=>{timer=setTimeout(resolve,1200);})]);
        soundError=audio.state!=='running';
      }
    }catch{soundError=true;}
    finally{clearTimeout(timer);activating=false;enabled=Boolean(audio?.state==='running')||vibrationSupported;renderControls();}
    if(preview)play(true);
  }
  function mute(){savePreference('off');enabled=false;pending=false;try{navigator.vibrate?.(0);}catch{}renderControls();}
  function renderNotice(){
    if(!notice)return;
    const order=queue.values().next().value;notice.hidden=!order;
    if(!order){notice.querySelector('strong').textContent='';notice.querySelector('p').textContent='';return;}
    notice.querySelector('strong').textContent=queue.size>1?'Your orders are ready':'Your order is ready';
    const message=options.channel==='dine'?' is ready to serve.':order.fulfillment_type==='delivery'?' is ready for delivery.':' is ready for pickup.';
    notice.querySelector('p').textContent=String(order.order_number||'Your order')+message+(queue.size>1?' '+(queue.size-1)+' more ready.':'');
  }
  function flush(){
    if(!pending||document.visibilityState==='hidden')return;
    pending=false;if(queue.size)play();
  }
  function observe(identity,rows){
    if(!identity){reset();return;}
    useScope(String(identity));let fresh=false;
    const unique=new Map((rows||[]).filter(order=>order&&order.order_id!=null).map(order=>[String(order.order_id),order]));
    for(const [id,order] of unique){
      const status=String(order.order_status),before=previous.get(id),rawVersion=String(order.ready_alert_version||'0');
      if((before==='served'||before==='cancelled')&&status!==before)continue;
      const version=/^[0-9]{1,20}$/.test(rawVersion)?rawVersion.replace(/^0+(?=\d)/,''):'0',last=reminders.get(id);
      // Audit IDs can exceed JavaScript's safe integer range. Compare decimal strings.
      const reminder=last!==undefined&&(version.length>last.length||(version.length===last.length&&version>last));
      if(status==='ready'){
        if(reminder||(before&&before!=='ready'&&!announced.has(id))){queue.set(id,{...order,order_id:id});fresh=true;}
        // A first snapshot of old ready orders is history, not a new ready event.
        announced.add(id);
      }else queue.delete(id);
      previous.delete(id);previous.set(id,status);
      if(last===undefined||reminder)reminders.set(id,version);
    }
    saveSnapshot();renderNotice();
    if(fresh)pending=true;
    flush();
  }
  function start(config){
    if(started)return;started=true;options=config;
    controls=document.createElement('section');controls.className='ready-alert-controls';controls.setAttribute('aria-label','Order ready alerts');
    controls.innerHTML='<div><strong>Order ready alerts</strong><p></p></div><div class="ready-alert-actions"><button type="button" data-ready-toggle></button><button type="button" data-ready-test hidden>Test alert</button></div>';
    document.querySelector('#screenTracking .order-ticket')?.after(controls);
    notice=document.createElement('section');notice.className='ready-order-notice';notice.hidden=true;notice.setAttribute('aria-label','Order ready');
    notice.innerHTML='<div role="status" aria-live="polite" aria-atomic="true"><strong></strong><p></p></div><div class="ready-alert-actions"><button type="button" data-ready-view>View order</button><button type="button" data-ready-dismiss>Dismiss</button></div>';
    document.body.append(notice);
    controls.querySelector('[data-ready-toggle]').addEventListener('click',()=>enabled&&preference!=='off'&&!soundError?mute():enable(true));
    controls.querySelector('[data-ready-test]').addEventListener('click',()=>enable(true));
    notice.querySelector('[data-ready-dismiss]').addEventListener('click',()=>{const id=queue.keys().next().value;queue.delete(id);renderNotice();});
    notice.querySelector('[data-ready-view]').addEventListener('click',async event=>{
      const button=event.currentTarget,id=queue.keys().next().value;if(!id||button.disabled)return;
      button.disabled=true;
      try{await options.onSelect(id);queue.delete(id);renderNotice();}catch{}finally{button.disabled=false;}
    });
    // Unlock sound during the customer's actual tap, before checkout awaits fetch.
    document.addEventListener('click',event=>{
      if(preference==='off'||enabled||activating)return;
      if(controls.contains(event.target))return;
      const submit=event.target.closest?.('#submitOrderBtn');
      if((submit&&!submit.disabled)||preference==='on')enable(false);
    },true);
    document.addEventListener('visibilitychange',async()=>{
      if(document.visibilityState!=='visible')return;
      try{await options.onVisible?.();}catch{}flush();renderControls();
    });
    renderControls();
  }
  window.QuvoReadyAlerts={start,observe,reset};
})();
