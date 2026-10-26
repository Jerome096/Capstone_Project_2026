const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../../Quvo_Cafe_Online_Ordering'),durable=new Map(),tabs=new Map();let blocked=false;
const line={cartId:'1-coffee',itemId:'1',name:'Latte',category:'coffee',unitPrice:180,quantity:2,pricedOptions:true,customization:{size:'Large',addons:['Oat milk'],notes:'No straw',options:{size:'large',milk:'oat'},optionsVersion:'catalog-version',optionLabels:[{label:'Milk',value:'Oat milk'}]}};
function create(id='7'){
 const elements=new Map(),node=key=>{if(!elements.has(key))elements.set(key,{value:''});return elements.get(key);};
 const c=vm.createContext({console,AbortSignal,showToast(){},state:{onlineCustomer:{id},cart:[]},
  localStorage:{getItem:key=>{if(blocked)throw Error('Storage blocked');return durable.get(key)||null;},setItem:(key,value)=>{if(blocked)throw Error('Storage full');durable.set(key,value);},removeItem:key=>{if(blocked)throw Error('Storage blocked');durable.delete(key);}},
  sessionStorage:{getItem:key=>tabs.get(key)||null,setItem:(key,value)=>tabs.set(key,value),removeItem:key=>tabs.delete(key)},
  document:{getElementById:node,querySelectorAll:()=>[]}});c.window=c;
 for(const file of ['shared/cart-limits.js','shared/storage.js','shared/cart-storage.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),c);
 return {c,run:code=>vm.runInContext(code,c)};
}
let a=create();a.c.state.cart=[structuredClone(line)];assert.equal(a.run('QuvoOnlineCart.save()'),true);
let reloaded=create();reloaded.run('restoreOnlinePending()');
assert.equal(JSON.stringify(reloaded.c.state.cart),JSON.stringify(a.run('QuvoOnlineCart.restore()')),'a fresh document restores full cart');
assert.deepEqual(JSON.parse(JSON.stringify(reloaded.c.state.cart[0].customization)),line.customization,'choices, notes and add-ons survive reload');
assert.equal(reloaded.c.state.cart[0].quantity,2);assert.equal(reloaded.c.state.cart[0].unitPrice,180);
assert.equal(create('8').run('QuvoOnlineCart.restore().length'),0,'another customer sees no previous cart');
reloaded.c.state.onlineCustomer=null;assert.equal(reloaded.run('QuvoOnlineCart.save()'),false,'signed-out initialization cannot erase a saved cart');
assert.equal(create().run('QuvoOnlineCart.restore().length'),1,'signing back into the same account recovers its cart');
reloaded=create();reloaded.run('restoreOnlinePending();state.cart[0].quantity=4;QuvoOnlineCart.save()');
assert.equal(create().run('QuvoOnlineCart.restore()[0].quantity'),4,'quantity edits persist');
reloaded.run('state.cart=[];QuvoOnlineCart.save()');assert.equal(create().run('QuvoOnlineCart.restore().length'),0,'an intentionally empty cart stays empty');
a=create();a.c.state.cart=[structuredClone(line)];a.run('QuvoOnlineCart.save()');
const pending={customerId:'7',payload:{action:'submit',submission_key:'11111111-1111-4111-8111-111111111111',receipt_image:'original-photo',expected_total:'180.00',fulfillment:'pickup'},cart:[{...structuredClone(line),quantity:1}]};
a.c.pendingFixture=pending;a.run('saveOnlinePending(pendingFixture)');tabs.clear();
let restarted=create();restarted.run('restoreOnlinePending()');
assert.equal(restarted.c.state.cart[0].quantity,1,'pending submission takes priority over an older draft');
assert.equal(restarted.run('online.pending.payload.receipt_image'),'original-photo','crash recovery keeps the exact submitted image');
assert.equal(restarted.run('onlineCartLocked()'),true,'unconfirmed submission stays locked for identical retry');
assert.equal(create('8').run('restoreOnlinePending();online.pending'),null,'pending proof is account scoped');
assert.equal(restarted.run('QuvoOnlineCart.clear("7")'),true);restarted.run('saveOnlinePending(null)');
assert.equal(create().run('restoreOnlinePending();state.cart.length'),0,'accepted checkout cleanup cannot resurrect an old cart');
tabs.set('quvo_online_pending_sql_v1_7',JSON.stringify(pending));let legacy=create();legacy.run('restoreOnlinePending()');
assert.equal(legacy.run('online.pending.payload.submission_key'),pending.payload.submission_key);
assert.ok(durable.has('quvo_online_pending_sql_v1_7'),'old tab-scoped pending data migrates to durable storage');assert.equal(tabs.size,0);
blocked=true;let unavailable=create();unavailable.c.state.cart=[structuredClone(line)];
assert.equal(unavailable.run('QuvoOnlineCart.save()'),false,'blocked draft storage is handled');
unavailable.c.pendingFixture=pending;assert.throws(()=>unavailable.run('saveOnlinePending(pendingFixture)'),/save this order for recovery/,'an unrecoverable pending write fails before submission');
assert.equal(unavailable.run('online.pending'),null);blocked=false;
durable.set('quvo_online_cart_v1_7','{corrupt');assert.equal(create().run('QuvoOnlineCart.restore().length'),0,'corrupt data does not crash startup');
durable.set('quvo_online_cart_v1_7',JSON.stringify({version:1,customerId:'8',cart:[line]}));assert.equal(create().run('QuvoOnlineCart.restore().length'),0,'a mismatched stored owner is rejected');
durable.set('quvo_online_cart_v1_7',JSON.stringify({version:1,customerId:'7',cart:[{...line,quantity:1000}]}));assert.equal(create().run('QuvoOnlineCart.restore().length'),0,'invalid saved quantities are rejected');
durable.set('quvo_online_cart_v1_7',JSON.stringify({version:1,customerId:'7',cart:[{...line,quantity:7},{...line,cartId:'second-size',quantity:6},{...line,cartId:'third',quantity:2},{...line,cartId:'food',itemId:'2',quantity:12}]}));
let limited=create();limited.c.state.cart=limited.run('QuvoOnlineCart.restore()');
assert.equal(limited.c.state.cart.length,3,'older draft keeps other items and valid variants');
assert.equal(limited.c.state.cart[0].quantity,7);assert.equal(limited.c.state.cart[1].quantity,3);assert.equal(limited.c.state.cart[2].quantity,10,'older quantities capped per item');
assert.equal(limited.c.state.cart[1].customization.notes,line.customization.notes,'options and notes remain after reducing quantity');
assert.equal(JSON.parse(durable.get('quvo_online_cart_v1_7')).cart[1].quantity,3,'adjusted cart is persisted across subsequent reloads');
console.log('PASS: full cart persistence, account isolation, edits/removal, pending priority, restart recovery, accepted cleanup, legacy migration and blocked/corrupt storage.');
