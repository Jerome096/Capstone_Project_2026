const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const elements=new Map();
const el=id=>{if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',disabled:false,showModal(){this.open=true;}});return elements.get(id);};
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const ctx=vm.createContext({console,Date,JSON,Set,Number,String,window:{QUVO_SESSION:{full_name:'Cashier test'}},state:{menu:[],orders:[]},document:{getElementById:el},escapeHtml:escape,normalizeName:value=>value.toLowerCase()});
const run=code=>vm.runInContext(code,ctx);
run(fs.readFileSync(path.join(__dirname,'../shared/js/menu-categories.js'),'utf8'));ctx.QuvoMenuCategories=ctx.window.QuvoMenuCategories;
for(const file of ['cashier/orders/orders.js','cashier/receipts/receipts.js','shared/js/thermal-print.js','cashier/orders/preparation-tickets.js'])run(fs.readFileSync(path.join(__dirname,'..',file),'utf8'));
const order={id:'sql1',number:'QVO-1',paid:true,stage:'preparing',source:'online',table:'Online delivery',customerName:'<Guest>',fulfillment:'Delivery request',approvedBy:'Cashier test',approvedAt:'10/13/2026 7:30 PM',items:[
  {name:'<Coffee>',qty:2,category:'coffee',note:'50% sugar · Less ice'},
  {name:'Juice',qty:1,category:'non-coffee'},
  {name:'Pasta',qty:1,category:'food',notes:'No sauce'},
  {name:'Cake',qty:2,category:'pastry'}
]};
ctx.order=order;
const split=run('splitPreparationItems(order)');assert.equal(split.length,2);assert.deepEqual(Array.from(split[0].items,item=>item.name),['<Coffee>','Juice']);assert.deepEqual(Array.from(split[1].items,item=>item.name),['Pasta','Cake']);
const drinks=run('preparationTicketMarkup(order,splitPreparationItems(order)[0])'),food=run('preparationTicketMarkup(order,splitPreparationItems(order)[1])');
assert.match(drinks,/DRINKS TICKET/);assert.match(food,/KITCHEN TICKET/);assert.match(drinks,/&lt;Coffee&gt;/);assert.match(drinks,/50% sugar/);assert.doesNotMatch(drinks,/Pasta|Cake/);assert.match(food,/No sauce/);assert.doesNotMatch(food,/Juice|&lt;Coffee&gt;/);
assert.match(run('buildPreparationTicketsDocument(order)'),/break-after:page/);
assert.match(run('buildPreparationTicketsDocument(order)'),/size:58mm 200mm/);
assert.match(run('buildPreparationTicketsDocument(order)'),/width:48mm/);
ctx.receipt={orderNumber:'QVO-1',customerName:'<Guest>',date:'2026-10-13',time:'7:30 PM',status:'served',source:'Walk-in / POS',location:'Counter',items:[{name:'<Coffee>',qty:2,price:150,note:'No sugar'}],total:300,paymentMethod:'Cash',amountReceived:350,change:50};
const payment=run('buildThermalReceiptDocument(receipt)');assert.match(payment,/&lt;Guest&gt;/);assert.match(payment,/&lt;Coffee&gt;/);assert.match(payment,/₱300\.00/);assert.match(payment,/₱50\.00/);assert.match(payment,/Walk-in \/ POS/);
run('openPreparationTickets(order)');assert.equal(el('preparationTicketsModal').open,true);assert.match(el('preparationTicketsSummary').textContent,/one ticket for drinks and one for food/);
for(const source of ['manual','qr','online']){order.source=source;run('openPreparationTickets(order)');assert.match(el('preparationTicketsPreview').innerHTML,/Approved for preparation/);}
assert.equal(run('splitPreparationItems({...order,items:[order.items[0]]}).length'),1);assert.equal(run('splitPreparationItems({...order,items:[order.items[2]]}).length'),1);
elements.clear();run('openPreparationTickets({...order,paid:false})');assert.equal(elements.size,0,'unpaid orders cannot print approval tickets');
assert.equal(run('preparationReprintMarkup({...order,paid:false})'),'');
console.log('PASS: exact drinks/food split, quantities and notes, escaped customer/item text, all order sources, separate print pages, single-department tickets, and unpaid guard.');
