const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();let now=1000;
function el(id){if(!elements.has(id))elements.set(id,{textContent:'',innerHTML:'',value:'',disabled:false,open:false,addEventListener(){},showModal(){this.open=true;},close(){this.open=false;},classList:{add(){},remove(){}}});return elements.get(id);}
const context=vm.createContext({console,Math,Number,String,AbortSignal,Date:{now:()=>now},setInterval(){},
  document:{getElementById:el},state:{accessMode:'dineIn',sessionApproved:true,alerts:[]},lucide:{createIcons(){}},
  escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../../Quvo_Cafe_Customer_Branded(3)/dine-in/assistance.js'),'utf8'),context);
context.requestStaffAssistance();assert.equal(el('staffAssistanceDialog').open,true);
context.applyGuestAssistance({request_id:'1',status:'pending',remaining_seconds:60});
assert.equal(el('staffBtnHeader').disabled,true);assert.match(el('staffAssistanceStatus').textContent,/60s/);
now+=60000;context.renderGuestAssistance();assert.equal(el('staffBtnHeader').disabled,false);
context.resetGuestAssistance();assert.equal(el('staffAssistanceDialog').open,false);
vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../cashier/alerts/alerts.js'),'utf8'),context);
context.installAssistanceAlerts([{request_id:'1',table_name:'<Table>',guest_name:'<Guest>',concern:'<script>bad</script>',remaining_seconds:60}]);
assert.match(el('alertsList').innerHTML,/&lt;script&gt;/);assert.doesNotMatch(el('alertsList').innerHTML,/<script>/);
assert.equal(el('sidebarAlertCount').textContent,1);
now+=60000;context.renderAlerts();assert.equal(el('sidebarAlertCount').textContent,0);assert.equal(el('alertsList').innerHTML,'');
console.log('PASS: customer popup, cooldown, reset on session end, escaped concerns and exact-minute alert removal.');
