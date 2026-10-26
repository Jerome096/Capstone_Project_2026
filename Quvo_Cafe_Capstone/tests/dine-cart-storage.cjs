const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../Quvo_Cafe_Customer_Branded(3)'),durable=new Map(),tabs=new Map();let blocked=false;
const line={cartId:'coffee-one',itemId:'1',name:'Latte',category:'coffee',quantity:2,unitPrice:200,pricedOptions:true,customization:{addons:['Oat milk'],notes:'No straw',options:{size:'large',extras:['oat']},optionsVersion:'version',optionLabels:[{label:'Size',value:'Large'}]}};
function create(table='1',visit='91',approved=true){
 const c=vm.createContext({console,AbortSignal,showToast(){},guestTableCode:table,guestCsrf:'test',state:{sessionApproved:approved,accessMode:'dineIn',cart:[]},
  localStorage:{getItem:key=>{if(blocked)throw Error('Blocked');return durable.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('Full');durable.set(key,value);},removeItem:key=>{if(blocked)throw Error('Blocked');durable.delete(key);}},
  sessionStorage:{getItem:key=>tabs.get(key)||null,setItem:(key,value)=>tabs.set(key,value),removeItem:key=>tabs.delete(key)}});c.window=c;
 for(const file of ['shared/cart-limits.js','orders/dine-in-orders.js','shared/cart-storage.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
 const run=code=>vm.runInContext(code,c);run('restoreDinePending('+JSON.stringify(visit)+')');return {c,run};
}
let a=create();a.c.state.cart=[structuredClone(line)];assert.equal(a.run('QuvoDineCart.save()'),true);
let refreshed=create();assert.equal(refreshed.c.state.cart[0].quantity,2);assert.equal(refreshed.c.state.cart[0].unitPrice,200);
assert.deepEqual(JSON.parse(JSON.stringify(refreshed.c.state.cart[0].customization)),line.customization,'options, notes and add-ons restored');
assert.equal(create('1','92').c.state.cart.length,0,'new visit at same table gets no old cart');
assert.equal(create('2','91').c.state.cart.length,0,'same visit number on a different table gets no old cart');
assert.equal(create('1','91',false).c.state.cart.length,0,'unapproved guest cannot restore a cart');
refreshed.run('state.sessionApproved=false;state.cart=[]');assert.equal(refreshed.run('QuvoDineCart.save()'),false);
refreshed.run('state.sessionApproved=true;restoreDinePending("91",true)');assert.equal(refreshed.c.state.cart.length,1,'same visit restores after a temporary verification failure');
refreshed.run('state.cart[0].quantity=4;QuvoDineCart.save()');assert.equal(create().c.state.cart[0].quantity,4,'quantity edits persist');
refreshed.run('state.cart=[];QuvoDineCart.save()');assert.equal(create().c.state.cart.length,0,'intentionally emptied cart stays empty');
a=create();a.c.state.cart=[structuredClone(line)];a.run('QuvoDineCart.save()');
const pending={sessionId:'91',payload:{action:'submit',submission_key:'11111111-1111-4111-8111-111111111111',expected_total:'200.00',items:[]},cart:[{...line,quantity:1}]};
a.c.pendingFixture=pending;a.run('saveDinePending(pendingFixture)');tabs.clear();
let restarted=create();assert.equal(restarted.c.state.cart[0].quantity,1,'pending snapshot wins over ordinary draft');
assert.equal(restarted.run('dineOrders.pending.payload.submission_key'),pending.payload.submission_key,'restart preserves retry identity');
assert.equal(restarted.run('dineCartLocked()'),true,'pending retry stays locked');
assert.equal(create('1','92').run('dineOrders.pending'),null,'next table guest cannot inherit pending submission');
restarted.run('QuvoDineCart.clear();saveDinePending(null)');assert.equal(create().c.state.cart.length,0,'accepted cleanup cannot resurrect ordinary draft');
tabs.set('quvo_dine_pending_1',JSON.stringify(pending));let legacy=create();
assert.equal(legacy.run('dineOrders.pending.payload.submission_key'),pending.payload.submission_key);
assert.ok(durable.has('quvo_dine_pending_v2_1_91'),'legacy pending record migrates to durable visit key');assert.equal(tabs.size,0);
let other=create('2','92');other.c.state.cart=[structuredClone(line)];other.run('QuvoDineCart.save()');legacy.run('QuvoDineCart.clear("91","1");saveDinePending(null,"91","1")');
assert.equal(create('2','92').c.state.cart.length,1,'cleanup for old visit preserves another table cart');
let fail=create('3','93');fail.c.state.cart=[structuredClone(line)];blocked=true;
assert.equal(fail.run('QuvoDineCart.save()'),false);fail.c.pendingFixture={...pending,sessionId:'93'};
assert.throws(()=>fail.run('saveDinePending(pendingFixture)'),/save this order for recovery/);assert.equal(fail.run('dineOrders.pending'),null,'failed durable write cannot send unrecoverable order');blocked=false;
durable.set('quvo_dine_cart_v1_1_91','{invalid');assert.equal(create().c.state.cart.length,0,'corrupt draft does not crash startup');
durable.set('quvo_dine_cart_v1_1_91',JSON.stringify({version:1,sessionId:'91',tableCode:'1',cart:[{...line,quantity:7},{...line,cartId:'second-size',quantity:6},{...line,cartId:'third',quantity:2},{...line,cartId:'food',itemId:'2',quantity:12}]}));
let limited=create();
assert.equal(limited.c.state.cart.length,3,'older draft keeps other items and valid variants');
assert.equal(limited.c.state.cart[0].quantity,7);assert.equal(limited.c.state.cart[1].quantity,3);assert.equal(limited.c.state.cart[2].quantity,10,'older quantities capped per item');
assert.equal(limited.c.state.cart[1].customization.notes,line.customization.notes,'options and notes remain after reducing quantity');
assert.equal(JSON.parse(durable.get('quvo_dine_cart_v1_1_91')).cart[1].quantity,3,'adjusted cart is persisted across subsequent reloads');
console.log('PASS: dine-in refresh/restart, visit/table isolation, approval guard, outage recovery, edits/removal, pending retry, legacy migration and storage failures.');
