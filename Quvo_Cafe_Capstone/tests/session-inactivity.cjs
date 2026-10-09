const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const elements = new Map();
const listeners = new Map();
const timers = new Map();
let now = 100000, nextTimer = 0, requests = [];
let rejectActivity = false;
function el(id) {
  if (!elements.has(id)) elements.set(id, {textContent:'',hidden:false,value:'',addEventListener(){}});
  return elements.get(id);
}
const context = vm.createContext({
  console, Number, Boolean, String, Math, AbortSignal,
  Date: {now:()=>now},
  state: {accessMode:'dineIn',sessionApproved:true},
  document: {visibilityState:'visible',getElementById:el,addEventListener:(type,cb)=>listeners.set(type,cb)},
  setInterval(){},setTimeout(cb,delay){timers.set(++nextTimer,{cb,delay}); return nextTimer;},
  clearTimeout(id){timers.delete(id);},
  async fetch(url, options) {
    requests.push(options);
    if (rejectActivity) throw new Error('Offline');
    return {ok:true,json:async()=>({ok:true,session:{status:'active',idle_paused:0,idle_remaining_seconds:600}})};
  }
});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../Quvo_Cafe_Customer_Branded(3)/dine-in/dine-in.js'),'utf8'),context);
const run = source => vm.runInContext(source,context);
const fire = (type, trusted=true) => listeners.get(type)?.({isTrusted:trusted});
async function flush() {
  const queued = [...timers.values()]; timers.clear();
  for (const timer of queued) await timer.cb();
}
(async()=>{
  run("updateGuestIdleNotice({status:'active',idle_paused:0,idle_remaining_seconds:600})");
  assert.match(el('dineSessionTimeout').textContent,/10:00/);
  now += 60000; run('renderGuestIdleNotice()');
  assert.match(el('dineSessionTimeout').textContent,/9:00/);
  run("updateGuestIdleNotice({status:'active',idle_paused:1,idle_remaining_seconds:-3600})");
  assert.match(el('dineSessionTimeout').textContent,/paused/);
  fire('wheel',false); fire('scroll'); await flush();
  assert.equal(requests.length,0,'script events do not count as customer activity');
  context.document.visibilityState='hidden'; fire('pointerdown'); await flush();
  assert.equal(requests.length,0,'background page does not send activity');
  context.document.visibilityState='visible'; fire('pointerdown'); await flush();
  assert.equal(JSON.parse(requests[0].body).action,'activity');
  assert.match(el('dineSessionTimeout').textContent,/10:00/);
  fire('input'); fire('keydown'); fire('wheel'); fire('touchmove'); await flush();
  assert.equal(requests.length,2,'rapid activity is batched');
  run('guestActionBusy=true'); fire('pointerdown'); await flush();
  assert.equal(requests.length,2,'activity waits for session changes');
  run('guestActionBusy=false'); await flush(); assert.equal(requests.length,3,'queued activity is preserved');
  run('state.accessMode="online"'); fire('input'); await flush();
  assert.equal(requests.length,3,'online orders are unaffected');
  run('renderGuestIdleNotice()'); assert.equal(el('dineSessionTimeout').hidden,true);
  run('state.accessMode="dineIn";state.sessionApproved=false'); fire('input'); await flush();
  assert.equal(requests.length,3,'unapproved visits do not send activity');
  run('state.sessionApproved=true'); rejectActivity=true;
  const clockBefore = run('guestIdleClock.received'); now += 60000;
  fire('pointerdown'); await flush();
  assert.equal(run('guestIdleClock.received'),clockBefore,'failed request cannot reset the displayed deadline');
  console.log('PASS: countdown, paused notice, trusted/visible activity, batching, busy retry, online isolation, failed activity.');
})().catch(error=>{console.error(error);process.exitCode=1;});
