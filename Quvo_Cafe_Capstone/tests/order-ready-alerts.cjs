// Ready alert side effects use fake sound/vibration; no requests reach SQL.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../..');
const read=app=>fs.readFileSync(path.join(project,app,'shared/order-ready-alerts.js'),'utf8');
const source=read('Quvo_Cafe_Customer_Branded(3)');
assert.equal(source,read('Quvo_Cafe_Online_Ordering'),'Both customer apps share the same alert behavior');
let checks=1;
const check=(value,label)=>{assert.ok(value,label);checks++;};
function fixture({storage=new Map(),sound=true,vibration=true,blocked=false,storageBlocked=false}={}){
 const events=new Map(),nodes=new Map(),calls={tones:0,vibration:[],view:[],audio:[],resumes:0,voices:[],envelopes:[]};
 class Element{
  constructor(){this.hidden=false;this.disabled=false;this.textContent='';this.children=new Map();this.listeners=new Map();}
  querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
  setAttribute(){}after(child){nodes.set(child.className,child);}append(child){nodes.set(child.className,child);}
  contains(target){return [...this.children.values()].includes(target);}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  async click(){if(!this.disabled)await this.listeners.get('click')?.({currentTarget:this,target:this});}
 }
 const document={visibilityState:'visible',body:new Element(),createElement:()=>new Element(),querySelector:()=>new Element(),
  addEventListener(name,fn){if(!events.has(name))events.set(name,[]);events.get(name).push(fn);}};
 class Audio{
  constructor(){this.state=blocked?'suspended':'running';this.currentTime=0;this.destination={};this.listeners=new Map();calls.audio.push(this);}
  addEventListener(name,handler){this.listeners.set(name,handler);}
  resume(){calls.resumes++;if(blocked)return Promise.reject(Error('Sound blocked'));this.state='running';this.listeners.get('statechange')?.();return Promise.resolve();}
  suspend(){this.state='suspended';this.listeners.get('statechange')?.();}
  createOscillator(){calls.tones++;const voice={frequency:{value:0},stops:[],disconnected:false,connect(){},disconnect(){this.disconnected=true;},start(at){this.started=at;},stop(at){this.stops.push(at);}};calls.voices.push(voice);return voice;}
  createGain(){const envelope=[];calls.envelopes.push(envelope);return {gain:{setValueAtTime(value,at){envelope.push({value,at});},exponentialRampToValueAtTime(value,at){envelope.push({value,at});}},connect(){},disconnect(){}};}
 }
 let now=10000;class Clock extends Date{static now(){return now;}}
 const context={window:{...(sound?{AudioContext:Audio}:{})},document,navigator:vibration?{vibrate(pattern){calls.vibration.push(pattern);return true;}}:{},
  sessionStorage:{getItem(key){if(storageBlocked)throw Error('Storage blocked');return storage.get(key)||null;},setItem(key,value){if(storageBlocked)throw Error('Storage blocked');storage.set(key,value);}},
  Map,Set,Array,String,Boolean,JSON,Date:Clock,setTimeout,clearTimeout,console};
 vm.runInNewContext(source,context);const api=context.window.QuvoReadyAlerts;
 api.start({channel:'online',onSelect:async id=>calls.view.push(id),onVisible:async()=>{}});
 const controls=nodes.get('ready-alert-controls'),notice=nodes.get('ready-order-notice');
 return {api,calls,storage,controls,notice,setBlocked(value){blocked=value;},advance(){now+=1500;},async submit(){for(const fn of events.get('click')||[])await fn({target:{closest:()=>({disabled:false})}});await new Promise(resolve=>setImmediate(resolve));},async visible(value){document.visibilityState=value;for(const fn of events.get('visibilitychange')||[])await fn();}};
}
const order=(id,status)=>({order_id:String(id),order_number:'QVO-'+id,order_status:status,fulfillment_type:'pickup'});
async function main(){
 const f=fixture();f.api.observe('online:A',[order(1,'preparing'),order(2,'ready'),order(3,'served')]);
 check(f.calls.tones===0&&f.notice.hidden,'Initial history does not announce old ready orders');
 await f.submit();check(f.controls.querySelector('strong').textContent==='Ready alerts on','Checkout tap enables ready alerts');
 f.api.observe('online:A',[order(1,'ready'),order(2,'ready')]);
 check(f.calls.tones===12&&f.calls.vibration.length===1,'A ready transition produces one chime and vibration pattern');
 check(!f.notice.hidden&&f.notice.querySelector('p').textContent.includes('QVO-1'),'A ready transition shows its order number');
 const duration=Math.max(...f.calls.voices.map(voice=>voice.stops[0]))-Math.min(...f.calls.voices.map(voice=>voice.started));
 check(duration>=7&&duration<=8,'Ready alert repeats for approximately seven seconds');
 check(f.calls.voices.every(voice=>voice.type==='triangle'),'Bright chime waveform is used consistently');
 check(f.calls.envelopes.every(envelope=>Math.max(...envelope.map(point=>point.value))===.9),'Every note reaches the louder 90 percent peak');
 check(f.calls.voices.every((voice,index,voices)=>index===0||voice.started>=voices[index-1].stops[0]),'Notes never overlap and amplify each other');
 f.advance();f.api.observe('online:A',[order(1,'ready')]);f.api.observe('online:A',[order(1,'ready')]);
 check(f.calls.tones===12&&f.calls.vibration.length===1,'Repeated polling does not repeat the alert');
 await f.notice.querySelector('[data-ready-view]').click();
 check(f.calls.view.join() === '1'&&f.notice.hidden,'View order opens and acknowledges the correct ready order');
 check(f.calls.voices.every(voice=>voice.disconnected),'View order stops the remaining scheduled chimes');
 f.api.observe('online:A',[order(1,'preparing')]);f.api.observe('online:A',[order(1,'ready')]);
 check(f.calls.tones===12,'The same order is never announced twice');
 const reload=fixture({storage:f.storage});await reload.submit();reload.api.observe('online:A',[order(1,'ready')]);
 check(reload.calls.tones===0&&reload.notice.hidden,'Reload preserves already announced order IDs');
 reload.api.observe('online:A',[order(4,'preparing')]);
 const afterRefresh=fixture({storage:f.storage});await afterRefresh.submit();afterRefresh.api.observe('online:A',[order(4,'ready')]);
 check(afterRefresh.calls.tones===12&&!afterRefresh.notice.hidden,'A transition during reload is recovered from its saved pending status');
 afterRefresh.advance();afterRefresh.api.observe('online:A',[order(5,'preparing')]);await afterRefresh.visible('hidden');afterRefresh.api.observe('online:A',[order(5,'ready')]);
 check(afterRefresh.calls.tones===12,'A hidden page defers sound and vibration');
 await afterRefresh.visible('visible');check(afterRefresh.calls.tones===24,'Returning to the page delivers a deferred ready alert once');
 await afterRefresh.visible('visible');check(afterRefresh.calls.tones===24,'Repeated visibility events do not repeat an alert');
 afterRefresh.api.reset();check(afterRefresh.notice.hidden&&afterRefresh.notice.querySelector('p').textContent==='','Logout clears the ready message and its order text');
 afterRefresh.advance();afterRefresh.api.observe('online:B',[order(5,'ready')]);
 check(afterRefresh.calls.tones===24&&afterRefresh.notice.hidden,'Another customer does not receive the previous customer alert');
 const batch=fixture();await batch.submit();batch.api.observe('dine:S',[order(10,'preparing'),order(11,'preparing')]);batch.api.observe('dine:S',[order(10,'ready'),order(11,'ready')]);
 check(batch.calls.tones===12&&batch.notice.querySelector('strong').textContent==='Your orders are ready','A batch of ready orders uses one chime and keeps both messages');
 await batch.notice.querySelector('[data-ready-dismiss]').click();check(!batch.notice.hidden,'Dismissing one ready order preserves the other');
 await batch.controls.querySelector('[data-ready-toggle]').click();batch.advance();await batch.submit();batch.api.observe('dine:S',[order(12,'preparing')]);batch.api.observe('dine:S',[order(12,'ready')]);
 check(batch.calls.tones===12&&!batch.notice.hidden,'Mute remains in effect after another checkout tap while visual alerts continue');
 const mutedReload=fixture({storage:batch.storage});await mutedReload.submit();
 check(mutedReload.calls.tones===0&&mutedReload.controls.querySelector('[data-ready-test]').hidden,'Mute preference survives reload');
 const noHardware=fixture({sound:false,vibration:false});noHardware.api.observe('online:A',[order(20,'preparing')]);noHardware.api.observe('online:A',[order(20,'ready')]);
 check(noHardware.controls.querySelector('[data-ready-toggle]').disabled&&!noHardware.notice.hidden,'Browsers without sound or vibration retain visual alerts');
 const soundOnly=fixture({vibration:false});await soundOnly.submit();soundOnly.api.observe('online:A',[order(30,'preparing')]);soundOnly.api.observe('online:A',[order(30,'ready')]);
 check(soundOnly.calls.tones===12&&soundOnly.calls.vibration.length===0,'Sound works without the Vibration API');
 const blocked=fixture({blocked:true});await blocked.submit();blocked.api.observe('online:A',[order(40,'preparing')]);blocked.api.observe('online:A',[order(40,'ready')]);
 check(blocked.calls.tones===0&&blocked.calls.vibration.length===1&&!blocked.notice.hidden,'Blocked audio falls back to vibration and visual alerts');
 const noStorage=fixture({storageBlocked:true});await noStorage.submit();noStorage.api.observe('dine:S',[order(50,'preparing')]);noStorage.api.observe('dine:S',[order(50,'ready')]);noStorage.api.observe('dine:S',[order(50,'ready')]);
 check(noStorage.calls.tones===12,'Storage restrictions do not break alert delivery or in-page deduplication');
 const completed=fixture();await completed.submit();completed.api.observe('online:A',[order(60,'preparing')]);await completed.visible('hidden');completed.api.observe('online:A',[order(60,'ready')]);completed.api.observe('online:A',[order(60,'served')]);await completed.visible('visible');
 check(completed.calls.tones===0&&completed.notice.hidden,'An order served while hidden does not ring as ready on return');
 const reminder=fixture();await reminder.submit();reminder.api.observe('online:A',[order(70,'preparing')]);reminder.api.observe('online:A',[order(70,'ready')]);await reminder.notice.querySelector('[data-ready-dismiss]').click();reminder.advance();
 reminder.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740993'}]);
 check(reminder.calls.tones===24&&!reminder.notice.hidden,'Cashier reminder reannounces an already ready order');
 reminder.advance();reminder.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740993'}]);
 check(reminder.calls.tones===24,'Repeated polling of the same reminder stays silent');
 reminder.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740994'}]);
 check(reminder.calls.tones===36,'Distinct 64-bit reminder IDs produce separate alerts without precision loss');
 reminder.advance();reminder.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740993'}]);reminder.api.observe('online:A',[order(70,'ready')]);reminder.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740994'}]);
 check(reminder.calls.tones===36,'Older or incomplete responses cannot reset the reminder cursor');
 const reminderReload=fixture({storage:reminder.storage});await reminderReload.submit();reminderReload.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740994'}]);
 check(reminderReload.calls.tones===0&&reminderReload.notice.hidden,'Reload does not repeat a cashier reminder');
 reminderReload.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740995'}]);
 check(reminderReload.calls.tones===12,'A new reminder after reload is delivered');
 await reminderReload.controls.querySelector('[data-ready-toggle]').click();reminderReload.advance();reminderReload.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740996'}]);
 check(reminderReload.calls.tones===12&&!reminderReload.notice.hidden,'Cashier reminders honor mute while retaining their visual message');
 reminderReload.api.observe('online:A',[{...order(70,'served'),ready_alert_version:'9007199254740996'}]);reminderReload.api.observe('online:A',[{...order(70,'ready'),ready_alert_version:'9007199254740997'}]);
 check(reminderReload.notice.hidden,'An outdated ready response cannot reannounce a served order');
 const historyReminder=fixture();await historyReminder.submit();historyReminder.api.observe('online:A',[{...order(80,'ready'),ready_alert_version:'99'}]);
 check(historyReminder.calls.tones===0&&historyReminder.notice.hidden,'Initial ready history with old reminders stays silent');
 const interrupted=fixture();await interrupted.submit();interrupted.api.observe('online:A',[order(90,'preparing')]);
 interrupted.calls.audio[0].suspend();
 check(interrupted.controls.querySelector('strong').textContent!=='Ready alerts on','Paused audio must not claim that sound is ready');
 interrupted.api.observe('online:A',[order(90,'ready')]);await new Promise(resolve=>setImmediate(resolve));
 check(interrupted.calls.resumes===1&&interrupted.calls.tones===12,'A ready event resumes paused audio and delivers the pending sound');
 interrupted.advance();interrupted.calls.audio[0].suspend();
 interrupted.api.observe('online:A',[{...order(90,'ready'),ready_alert_version:'1'}]);await new Promise(resolve=>setImmediate(resolve));
 check(interrupted.calls.resumes===2&&interrupted.calls.tones===24,'A cashier reminder also recovers interrupted audio');
 interrupted.advance();interrupted.api.observe('online:A',[{...order(90,'ready'),ready_alert_version:'1'}]);
 check(interrupted.calls.tones===24,'Recovering audio does not repeat the same reminder on polling');
 const lateTap=fixture({blocked:true});await lateTap.submit();lateTap.api.observe('online:A',[order(91,'preparing')]);lateTap.api.observe('online:A',[order(91,'ready')]);await new Promise(resolve=>setImmediate(resolve));
 check(lateTap.calls.tones===0&&!lateTap.notice.querySelector('[data-ready-play]').hidden,'Blocked sound offers a play button on the visible ready message');
 lateTap.setBlocked(false);await lateTap.notice.querySelector('[data-ready-play]').click();
 check(lateTap.calls.tones===12&&lateTap.notice.querySelector('[data-ready-play]').hidden,'A customer tap plays the missed alert and clears the pending sound');
 lateTap.advance();lateTap.api.observe('online:A',[order(91,'ready')]);
 check(lateTap.calls.tones===12,'Playing a missed alert does not duplicate it on the next poll');
 const cancelledSound=fixture({blocked:true});await cancelledSound.submit();cancelledSound.api.observe('online:A',[order(92,'preparing')]);cancelledSound.api.observe('online:A',[order(92,'ready')]);await new Promise(resolve=>setImmediate(resolve));
 await cancelledSound.notice.querySelector('[data-ready-dismiss]').click();cancelledSound.setBlocked(false);await cancelledSound.submit();
 check(cancelledSound.calls.tones===0,'Dismissing a ready notice cancels its blocked pending sound');
 const servedSound=fixture({blocked:true});await servedSound.submit();servedSound.api.observe('online:A',[order(93,'preparing')]);servedSound.api.observe('online:A',[order(93,'ready')]);await new Promise(resolve=>setImmediate(resolve));
 servedSound.api.observe('online:A',[order(93,'served')]);servedSound.setBlocked(false);await servedSound.submit();
 check(servedSound.calls.tones===0&&servedSound.notice.hidden,'Serving an order cancels its blocked pending sound');
 const vibrationOnly=fixture({sound:false});await vibrationOnly.submit();vibrationOnly.api.observe('online:A',[order(94,'preparing')]);vibrationOnly.api.observe('online:A',[order(94,'ready')]);
 check(vibrationOnly.calls.vibration.length===1&&vibrationOnly.calls.tones===0,'Vibration-only browsers still receive ready alerts');
 const lifecycle=fixture();await lifecycle.controls.querySelector('[data-ready-toggle]').click();
 check(lifecycle.calls.voices.length===12&&lifecycle.calls.voices.every(voice=>!voice.disconnected),'Enable/Test preview plays even without a ready order notice');
 await lifecycle.controls.querySelector('[data-ready-test]').click();
 check(lifecycle.calls.voices.slice(0,12).every(voice=>voice.disconnected)&&lifecycle.calls.voices.slice(12).every(voice=>!voice.disconnected),'Testing again replaces the sequence instead of stacking sound');
 await lifecycle.controls.querySelector('[data-ready-toggle]').click();
 check(lifecycle.calls.voices.every(voice=>voice.disconnected&&voice.stops.at(-1)===undefined),'Mute immediately cancels playing and future tones');
 await lifecycle.controls.querySelector('[data-ready-toggle]').click();lifecycle.api.reset();
 check(lifecycle.calls.voices.every(voice=>voice.disconnected),'Account/session reset cancels all scheduled tones');
 const dismiss=fixture();await dismiss.submit();dismiss.api.observe('online:A',[order(100,'preparing')]);dismiss.api.observe('online:A',[order(100,'ready')]);
 await dismiss.notice.querySelector('[data-ready-dismiss]').click();
 check(dismiss.calls.voices.every(voice=>voice.disconnected)&&dismiss.notice.hidden,'Dismiss immediately stops the long alert');
 const serving=fixture();await serving.submit();serving.api.observe('online:A',[order(101,'preparing')]);serving.api.observe('online:A',[order(101,'ready')]);serving.api.observe('online:A',[order(101,'served')]);
 check(serving.calls.voices.every(voice=>voice.disconnected)&&serving.notice.hidden,'Served status cancels the remaining alert tones');
 console.log(checks+' ready alert checks passed. No network or SQL access.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
