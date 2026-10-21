// Ready alert side effects use fake sound/vibration; no requests reach SQL.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const project=path.resolve(__dirname,'../..');
const read=app=>fs.readFileSync(path.join(project,app,'shared/order-ready-alerts.js'),'utf8');
const source=read('Quvo_Cafe_Customer_Branded(3)');
assert.equal(source,read('Quvo_Cafe_Online_Ordering'),'Both customer apps share the same alert behavior');
let checks=1;
const check=(value,label)=>{assert.ok(value,label);checks++;};
function fixture({storage=new Map(),sound=true,vibration=true,blocked=false,storageBlocked=false}={}){
 const events=new Map(),nodes=new Map(),calls={tones:0,vibration:[],view:[]};
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
  constructor(){this.state=blocked?'suspended':'running';this.currentTime=0;this.destination={};}
  resume(){return blocked?Promise.reject(Error('Sound blocked')):Promise.resolve();}
  createOscillator(){calls.tones++;return {frequency:{value:0},connect(){},disconnect(){},start(){},stop(){}};}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }
 let now=10000;class Clock extends Date{static now(){return now;}}
 const context={window:{...(sound?{AudioContext:Audio}:{})},document,navigator:vibration?{vibrate(pattern){calls.vibration.push(pattern);return true;}}:{},
  sessionStorage:{getItem(key){if(storageBlocked)throw Error('Storage blocked');return storage.get(key)||null;},setItem(key,value){if(storageBlocked)throw Error('Storage blocked');storage.set(key,value);}},
  Map,Set,Array,String,Boolean,JSON,Date:Clock,setTimeout,clearTimeout,console};
 vm.runInNewContext(source,context);const api=context.window.QuvoReadyAlerts;
 api.start({channel:'online',onSelect:async id=>calls.view.push(id),onVisible:async()=>{}});
 const controls=nodes.get('ready-alert-controls'),notice=nodes.get('ready-order-notice');
 return {api,calls,storage,controls,notice,advance(){now+=1500;},async submit(){for(const fn of events.get('click')||[])await fn({target:{closest:()=>({disabled:false})}});await new Promise(resolve=>setImmediate(resolve));},async visible(value){document.visibilityState=value;for(const fn of events.get('visibilitychange')||[])await fn();}};
}
const order=(id,status)=>({order_id:String(id),order_number:'QVO-'+id,order_status:status,fulfillment_type:'pickup'});
async function main(){
 const f=fixture();f.api.observe('online:A',[order(1,'preparing'),order(2,'ready'),order(3,'served')]);
 check(f.calls.tones===0&&f.notice.hidden,'Initial history does not announce old ready orders');
 await f.submit();check(f.controls.querySelector('strong').textContent==='Ready alerts on','Checkout tap enables ready alerts');
 f.api.observe('online:A',[order(1,'ready'),order(2,'ready')]);
 check(f.calls.tones===3&&f.calls.vibration.length===1,'A ready transition produces one chime and vibration pattern');
 check(!f.notice.hidden&&f.notice.querySelector('p').textContent.includes('QVO-1'),'A ready transition shows its order number');
 f.advance();f.api.observe('online:A',[order(1,'ready')]);f.api.observe('online:A',[order(1,'ready')]);
 check(f.calls.tones===3&&f.calls.vibration.length===1,'Repeated polling does not repeat the alert');
 await f.notice.querySelector('[data-ready-view]').click();
 check(f.calls.view.join() === '1'&&f.notice.hidden,'View order opens and acknowledges the correct ready order');
 f.api.observe('online:A',[order(1,'preparing')]);f.api.observe('online:A',[order(1,'ready')]);
 check(f.calls.tones===3,'The same order is never announced twice');
 const reload=fixture({storage:f.storage});await reload.submit();reload.api.observe('online:A',[order(1,'ready')]);
 check(reload.calls.tones===0&&reload.notice.hidden,'Reload preserves already announced order IDs');
 reload.api.observe('online:A',[order(4,'preparing')]);
 const afterRefresh=fixture({storage:f.storage});await afterRefresh.submit();afterRefresh.api.observe('online:A',[order(4,'ready')]);
 check(afterRefresh.calls.tones===3&&!afterRefresh.notice.hidden,'A transition during reload is recovered from its saved pending status');
 afterRefresh.advance();afterRefresh.api.observe('online:A',[order(5,'preparing')]);await afterRefresh.visible('hidden');afterRefresh.api.observe('online:A',[order(5,'ready')]);
 check(afterRefresh.calls.tones===3,'A hidden page defers sound and vibration');
 await afterRefresh.visible('visible');check(afterRefresh.calls.tones===6,'Returning to the page delivers a deferred ready alert once');
 await afterRefresh.visible('visible');check(afterRefresh.calls.tones===6,'Repeated visibility events do not repeat an alert');
 afterRefresh.api.reset();check(afterRefresh.notice.hidden&&afterRefresh.notice.querySelector('p').textContent==='','Logout clears the ready message and its order text');
 afterRefresh.advance();afterRefresh.api.observe('online:B',[order(5,'ready')]);
 check(afterRefresh.calls.tones===6&&afterRefresh.notice.hidden,'Another customer does not receive the previous customer alert');
 const batch=fixture();await batch.submit();batch.api.observe('dine:S',[order(10,'preparing'),order(11,'preparing')]);batch.api.observe('dine:S',[order(10,'ready'),order(11,'ready')]);
 check(batch.calls.tones===3&&batch.notice.querySelector('strong').textContent==='Your orders are ready','A batch of ready orders uses one chime and keeps both messages');
 await batch.notice.querySelector('[data-ready-dismiss]').click();check(!batch.notice.hidden,'Dismissing one ready order preserves the other');
 await batch.controls.querySelector('[data-ready-toggle]').click();batch.advance();await batch.submit();batch.api.observe('dine:S',[order(12,'preparing')]);batch.api.observe('dine:S',[order(12,'ready')]);
 check(batch.calls.tones===3&&!batch.notice.hidden,'Mute remains in effect after another checkout tap while visual alerts continue');
 const mutedReload=fixture({storage:batch.storage});await mutedReload.submit();
 check(mutedReload.calls.tones===0&&mutedReload.controls.querySelector('[data-ready-test]').hidden,'Mute preference survives reload');
 const noHardware=fixture({sound:false,vibration:false});noHardware.api.observe('online:A',[order(20,'preparing')]);noHardware.api.observe('online:A',[order(20,'ready')]);
 check(noHardware.controls.querySelector('[data-ready-toggle]').disabled&&!noHardware.notice.hidden,'Browsers without sound or vibration retain visual alerts');
 const soundOnly=fixture({vibration:false});await soundOnly.submit();soundOnly.api.observe('online:A',[order(30,'preparing')]);soundOnly.api.observe('online:A',[order(30,'ready')]);
 check(soundOnly.calls.tones===3&&soundOnly.calls.vibration.length===0,'Sound works without the Vibration API');
 const blocked=fixture({blocked:true});await blocked.submit();blocked.api.observe('online:A',[order(40,'preparing')]);blocked.api.observe('online:A',[order(40,'ready')]);
 check(blocked.calls.tones===0&&blocked.calls.vibration.length===1&&!blocked.notice.hidden,'Blocked audio falls back to vibration and visual alerts');
 const noStorage=fixture({storageBlocked:true});await noStorage.submit();noStorage.api.observe('dine:S',[order(50,'preparing')]);noStorage.api.observe('dine:S',[order(50,'ready')]);noStorage.api.observe('dine:S',[order(50,'ready')]);
 check(noStorage.calls.tones===3,'Storage restrictions do not break alert delivery or in-page deduplication');
 const completed=fixture();await completed.submit();completed.api.observe('online:A',[order(60,'preparing')]);await completed.visible('hidden');completed.api.observe('online:A',[order(60,'ready')]);completed.api.observe('online:A',[order(60,'served')]);await completed.visible('visible');
 check(completed.calls.tones===0&&completed.notice.hidden,'An order served while hidden does not ring as ready on return');
 console.log(checks+' ready alert checks passed. No network or SQL access.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
