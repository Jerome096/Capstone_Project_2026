// SQL owns stock balances, recipes and the movement log. Stock warnings never change menu availability.
const inventorySql = {loaded:false, loading:false, busy:false, pending:null, request:0, error:'', menus:[], impact:[], nextOffset:null, editVersion:null, editCurrent:null, recipeId:null, restockOnly:false};
function inventoryAllowed() {return window.QUVO_CONFIG.allowedScreens.includes('inventory');}
function inventoryPendingKey() {
  const id=window.QUVO_SESSION?.staff_id;
  if(!id)throw new Error('Please sign in again.');
  return 'quvo_inventory_pending_v1_'+id;
}
function inventoryStorePending(value) {
  if(value)sessionStorage.setItem(inventoryPendingKey(),JSON.stringify(value));
  else sessionStorage.removeItem(inventoryPendingKey());
  inventorySql.pending=value;
}
function inventoryKey() {
  const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const h=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}
function bindInventory() {
  if(!inventoryAllowed())return;
  const search=document.getElementById('inventorySearch');search.value='';
  const enableSearch=()=>search.removeAttribute('readonly');
  search.addEventListener('focus',enableSearch);search.addEventListener('pointerdown',enableSearch);
  search.addEventListener('input',renderInventoryRows);
  document.getElementById('inventorySearchForm').addEventListener('submit',event=>event.preventDefault());
  document.querySelectorAll('[data-inventory-filter]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-inventory-filter]').forEach(entry=>entry.classList.remove('active'));
    button.classList.add('active');state.activeInventoryFilter=button.dataset.inventoryFilter;renderInventoryRows();updateInventoryControls();
  }));
  const bindings={addInventoryItemBtn:()=>openInventoryStockModal(),addStockMovementBtn:()=>addManualStockMovement(),
    addInventoryRecipeBtn:()=>openInventoryRecipeModal(),inventoryStockClose:closeInventoryStockModal,
    inventoryStockCancel:closeInventoryStockModal,inventoryStockSave:saveInventoryStockItem,
    inventoryRecipeClose:closeInventoryRecipeModal,inventoryRecipeCancel:closeInventoryRecipeModal,inventoryRecipeSave:saveInventoryRecipe,
    inventoryMovementClose:closeInventoryMovementModal,inventoryMovementCancel:closeInventoryMovementModal,inventoryMovementSave:saveInventoryMovement,
    inventoryRefresh:()=>loadInventory(),inventoryMore:()=>loadInventory(true),inventoryRetry:()=>submitInventoryChange()};
  for(const [id,fn] of Object.entries(bindings))document.getElementById(id).addEventListener('click',fn);
  document.getElementById('inventoryMovementItem').addEventListener('change',updateInventoryMovementDetails);
  document.getElementById('inventoryMovementType').addEventListener('change',updateInventoryMovementDetails);
  document.getElementById('inventoryMovementQty').addEventListener('input',updateInventoryRestockPreview);
  document.getElementById('inventoryMovementUnit').addEventListener('change',updateInventoryRestockPreview);
  document.getElementById('inventoryMovementQty').addEventListener('keydown',event=>{
    if(event.key==='Enter'&&inventorySql.restockOnly){event.preventDefault();saveInventoryMovement();}
  });
  document.getElementById('inventoryRecipeMenu').addEventListener('change',event=>fillInventoryRecipeMaterials(event.target.value));
  document.getElementById('inventoryRecipeMaterials').addEventListener('input',event=>{
    if(event.target.matches('[data-inventory-recipe-item]'))updateInventoryRecipeAmount(event.target.dataset.inventoryRecipeItem);
  });
  document.getElementById('inventoryRecipeMaterials').addEventListener('change',event=>{
    if(event.target.matches('[data-inventory-recipe-unit]'))updateInventoryRecipeAmount(event.target.dataset.inventoryRecipeUnit);
  });
  for(const kind of ['Stock','Recipe','Movement'])document.getElementById('inventory'+kind+'Modal').addEventListener('click',event=>{
    if(event.target.id==='inventory'+kind+'Modal')({Stock:closeInventoryStockModal,Recipe:closeInventoryRecipeModal,Movement:closeInventoryMovementModal})[kind]();
  });
  try {const saved=JSON.parse(sessionStorage.getItem(inventoryPendingKey())||'null');if(saved?.payload?.submission_key)inventorySql.pending=saved;} catch {}
  loadInventory();
  setInterval(()=>{if(document.getElementById('inventory').classList.contains('active-screen')&&!inventorySql.pending&&!inventorySql.busy&&!inventorySql.loading)loadInventory();},10000);
}
function installInventorySnapshot(snapshot,append=false) {
  state.inventoryItems=snapshot.items;state.inventoryRecipes=snapshot.recipes;
  state.inventoryMovements=append?[...state.inventoryMovements,...snapshot.movements]:snapshot.movements;
  inventorySql.menus=snapshot.menus;inventorySql.impact=snapshot.impact;inventorySql.nextOffset=snapshot.nextOffset;inventorySql.loaded=true;
}
async function loadInventory(append=false) {
  if(!inventoryAllowed()||inventorySql.busy||inventorySql.loading)return;
  if(append&&inventorySql.nextOffset===null)return;
  const request=++inventorySql.request;inventorySql.loading=true;inventorySql.error='';renderInventory();
  try {
    const response=await fetch(quvoPath('api/inventory/index.php')+'?offset='+(append?inventorySql.nextOffset:0),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000)});
    const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Could not load inventory.');
    if(request===inventorySql.request)installInventorySnapshot(result.snapshot,append);
  } catch(error) {if(request===inventorySql.request)inventorySql.error=error.message;}
  finally {if(request===inventorySql.request){inventorySql.loading=false;renderInventory();}}
}
function updateInventoryControls() {
  const locked=inventorySql.busy||Boolean(inventorySql.pending),unready=!inventorySql.loaded;
  document.getElementById('inventoryPendingBanner').hidden=!inventorySql.pending;
  document.getElementById('inventoryRetry').disabled=inventorySql.busy;
  document.getElementById('inventoryRefresh').disabled=inventorySql.busy||inventorySql.loading;
  document.getElementById('inventoryMore').hidden=inventorySql.nextOffset===null;
  document.getElementById('inventoryMore').disabled=inventorySql.loading||inventorySql.busy;
  document.querySelectorAll('#addInventoryItemBtn,#addStockMovementBtn,#addInventoryRecipeBtn,#inventoryRows button,#inventoryRecipeList button').forEach(el=>el.disabled=locked||unready);
  for(const kind of ['Stock','Recipe','Movement']) {
    document.querySelectorAll('#inventory'+kind+'Modal input,#inventory'+kind+'Modal select,#inventory'+kind+'Modal textarea').forEach(el=>el.disabled=locked);
    const canRetry=(kind==='Stock'&&inventorySql.pending?.payload.action==='save_item')||(kind==='Movement'&&inventorySql.pending?.payload.action==='movement');
    document.getElementById('inventory'+kind+'Save').disabled=inventorySql.busy||unready||(Boolean(inventorySql.pending)&&!canRetry);
    document.getElementById('inventory'+kind+'Close').disabled=inventorySql.busy;
    document.getElementById('inventory'+kind+'Cancel').disabled=inventorySql.busy;
  }
  document.getElementById('inventoryLinkedMenu').disabled=true;
  document.getElementById('inventoryUnit').disabled=locked||Boolean(state.editingInventoryItemId);
  document.getElementById('inventoryStockSave').textContent=inventorySql.busy?'Saving…':inventorySql.pending?.payload.action==='save_item'?'Retry saved change':'Save stock';
  document.getElementById('inventoryMovementSave').textContent=inventorySql.busy?'Saving…':inventorySql.pending?.payload.action==='movement'?'Retry saved change':inventorySql.restockOnly?'Add stock':'Save movement';
}
function renderInventory() {
  if(!document.getElementById('inventoryRows'))return;
  document.getElementById('inventorySqlStatus').textContent=inventorySql.error||(inventorySql.busy?'Saving inventory change…':inventorySql.loading?'Loading stock records…':inventorySql.loaded?'Stock records are up to date. Ingredients are deducted when the cashier approves payment.':'Inventory has not loaded.');
  renderInventoryStats();renderInventoryRows();renderInventoryImpact();renderInventoryMovements();renderInventoryRecipes();updateInventoryControls();
  if(!inventorySql.busy&&inventorySql.restockOnly&&!document.getElementById('inventoryMovementModal').classList.contains('hidden'))updateInventoryRestockPreview();
}
function getInventoryStatus(item) {return Number(item.current)<=0?'out':Number(item.current)<=Number(item.reorder)?'low':'normal';}
function getInventoryStatusLabel(status) {return {normal:'Normal',low:'Low',out:'Out'}[status];}
function inventoryQty(value) {return new Intl.NumberFormat('en-PH',{maximumFractionDigits:3}).format(Number(value));}
function renderInventoryStats() {
  const items=state.inventoryItems;
  for(const [id,value] of [['Tracked',items.length],['Low',items.filter(i=>getInventoryStatus(i)==='low').length],['Out',items.filter(i=>getInventoryStatus(i)==='out').length],['Affected',inventorySql.impact.length]])document.getElementById('inventory'+id+'Stat').textContent=inventorySql.loaded?value:'—';
}
function inventoryEmpty() {return inventorySql.loaded?'No inventory items found.':'Stock records are not loaded. Use Refresh stock to retry.';}
function renderInventoryRows() {
  const query=document.getElementById('inventorySearch').value.toLowerCase().trim(),e=escapeHtml;
  const items=state.inventoryItems.filter(item=>(state.activeInventoryFilter==='all'||state.activeInventoryFilter===getInventoryStatus(item))&&`${item.name} ${item.category} ${item.linkedMenu}`.toLowerCase().includes(query));
  document.getElementById('inventoryRows').innerHTML=items.length?items.map(item=>{
    const status=getInventoryStatus(item);
    return `<div class="inventory-row"><div class="inventory-item-name">${e(item.name)}</div><span>${e(item.category)}</span><span><b>${inventoryQty(item.current)}</b> ${e(item.unit)}</span><span>${inventoryQty(item.reorder)} ${e(item.unit)}</span><span><span class="inventory-status ${status}">${getInventoryStatusLabel(status)}</span></span><span>${e(item.linkedMenu||'Not linked')}</span><span class="inventory-row-actions"><button class="btn light" onclick="openInventoryStockModal('${item.id}')">Edit</button><button class="btn dark" onclick="quickInventoryRestock('${item.id}')">Restock</button><button class="btn light inventory-remove-btn" onclick="removeInventoryStockItem('${item.id}')">Remove</button></span></div>`;
  }).join(''):`<div class="inventory-row"><span>${inventoryEmpty()}</span></div>`;
}
function renderInventoryImpact() {
  const e=escapeHtml;
  document.getElementById('inventoryImpactList').innerHTML=inventorySql.impact.length?inventorySql.impact.map(menu=>`<article class="inventory-impact-card"><b>${e(menu.name)}</b><p class="inventory-warning">Recorded ingredients are low for one serving. Ordering stays open; review stock and set menu availability when needed.</p></article>`).join(''):`<article class="inventory-impact-card"><b>${inventorySql.loaded?'No recipe stock warnings.':'Inventory not loaded.'}</b><p>Stock reminders do not change menu availability. The cafe decides which items are available.</p></article>`;
}
function renderInventoryMovements() {
  const e=escapeHtml,labels={restock:'Restock',waste:'Waste',adjustment:'Adjustment',consumption:'Order deduction'};
  document.getElementById('inventoryMovementLog').innerHTML=state.inventoryMovements.length?state.inventoryMovements.map(entry=>{
    const timestamp=new Date(entry.time.replace(' ','T')+'Z');
    const time=Number.isNaN(timestamp.getTime())?entry.time:timestamp.toLocaleString('en-PH',{timeZone:'Asia/Manila'});
    return `<article class="inventory-movement-card"><div class="inventory-card-top"><b>${labels[entry.type]||e(entry.type)}</b><span>${e(time)}</span></div><p>${e(entry.item)} · ${Number(entry.quantity)>0?'+':''}${inventoryQty(entry.quantity)} ${e(entry.unit)}</p><p>${e(entry.note||'')}</p><p class="inventory-subtext">${e(entry.recordedBy||'')} ${e(entry.orderNumber||'')}</p></article>`;
  }).join(''):`<article class="inventory-movement-card"><b>${inventorySql.loaded?'No stock movements yet.':'Stock movements not loaded.'}</b><p>Restock, waste, adjustments and approved order deductions will appear here.</p></article>`;
}
function renderInventoryRecipes() {
  const e=escapeHtml;
  document.getElementById('inventoryRecipeList').innerHTML=state.inventoryRecipes.length?state.inventoryRecipes.map(recipe=>`<article class="inventory-recipe-card"><div class="inventory-card-top"><b>${e(recipe.menu)}</b><span class="inventory-chip">Version ${recipe.version}</span></div><div class="inventory-chip-row">${recipe.ingredients.map(line=>`<span class="inventory-chip">${e(line.item)}: ${inventoryQty(line.qty)} ${e(line.unit)}</span>`).join('')}</div><div class="inventory-recipe-actions"><button class="btn light" onclick="openInventoryRecipeModal('${recipe.menuId}')">Edit Bill of Materials</button></div></article>`).join(''):`<article class="inventory-recipe-card"><b>${inventorySql.loaded?'No Bill of Materials saved.':'Recipes not loaded.'}</b><p>Add stock items, then link the ingredients used for one serving of each menu item.</p></article>`;
}
function inventoryCanEdit() {return inventoryAllowed()&&inventorySql.loaded&&!inventorySql.busy&&!inventorySql.pending;}
function openInventoryStockModal(itemId=null) {
  if(!inventoryCanEdit())return;
  const item=itemId?state.inventoryItems.find(i=>i.id===String(itemId)):null;if(itemId&&!item)return;
  state.editingInventoryItemId=item?.id||null;inventorySql.editVersion=item?.version||null;inventorySql.editCurrent=item?.current??null;
  document.getElementById('inventoryStockTitle').textContent=item?'Update stock item':'New inventory item';
  const values={inventoryItemName:item?.name||'',inventoryCategory:item?.category||'Other',inventoryCurrent:item?.current??'0',inventoryUnit:item?.unit||'',inventoryReorder:item?.reorder??'0',inventoryLinkedMenu:item?.linkedMenu||'',inventoryNote:''};
  for(const [id,value] of Object.entries(values))document.getElementById(id).value=value;
  document.getElementById('inventoryStockError').textContent='';document.getElementById('inventoryStockModal').classList.remove('hidden');updateInventoryControls();
}
function closeInventoryStockModal() {if(inventorySql.busy)return;document.getElementById('inventoryStockModal').classList.add('hidden');state.editingInventoryItemId=null;}
function inventoryFeedback(errorId,message,fieldId=null) {
  const error=document.getElementById(errorId);if(error)error.textContent=message;
  showToast(message);
  if(fieldId){const field=document.getElementById(fieldId);field?.setAttribute('aria-invalid','true');field?.focus();}
  error?.scrollIntoView?.({block:'nearest'});
}
function validateInventoryStock(payload) {
  if(!payload.name||payload.name.length>100)return ['inventoryItemName','Enter a stock item name, up to 100 characters.'];
  if(!payload.category)return ['inventoryCategory','Choose a category.'];
  if(!/^[a-z][a-z0-9 ._-]{0,19}$/i.test(payload.unit))return ['inventoryUnit','Enter one unit, such as kg, g, L, ml or pcs.'];
  for(const [key,id,label] of [['current','inventoryCurrent','Current stock'],['reorder','inventoryReorder','Reorder level']]) {
    if(!/^(?:[0-9]{1,9}(?:\.[0-9]{1,3})?|\.[0-9]{1,3})$/.test(payload[key]))return [id,label+' must be zero or a positive number with at most three decimal places.'];
  }
  if(payload.note.length>500)return ['inventoryNote','Keep the reason within 500 characters.'];
  if(payload.id&&Number(payload.current)<Number(inventorySql.editCurrent)&&!payload.note)return ['inventoryNote','Enter a reason for reducing the stock count.'];
  return null;
}
function saveInventoryStockItem() {
  if(inventorySql.pending?.payload.action==='save_item')return submitInventoryChange();
  if(!inventoryCanEdit())return;
  const value=id=>document.getElementById(id).value.trim();
  const payload={action:'save_item',name:value('inventoryItemName'),category:value('inventoryCategory'),current:value('inventoryCurrent'),unit:value('inventoryUnit'),reorder:value('inventoryReorder')||'0',note:value('inventoryNote')};
  if(state.editingInventoryItemId){payload.id=state.editingInventoryItemId;payload.version=inventorySql.editVersion;}
  document.querySelectorAll('#inventoryStockModal [aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
  const invalid=validateInventoryStock(payload);if(invalid){inventoryFeedback('inventoryStockError',invalid[1],invalid[0]);return;}
  document.getElementById('inventoryStockError').textContent='';
  return submitInventoryChange(payload,'inventoryStockError');
}
async function removeInventoryStockItem(itemId) {
  if(!inventoryCanEdit())return;
  const item=state.inventoryItems.find(item=>item.id===String(itemId));if(!item)return;
  if(!window.confirm('Remove "'+item.name+'" from inventory?\n\nIt will also be removed from current Bill of Materials recipes. Past orders and stock movement history will be kept.'))return;
  return submitInventoryChange({action:'remove_item',id:item.id,version:item.version});
}
function quickInventoryRestock(itemId) {addManualStockMovement(itemId,true);}
function addManualStockMovement(itemId=null,restockOnly=false) {
  if(!inventoryCanEdit())return;if(!state.inventoryItems.length){showToast('Add a stock item first.');return;}
  inventorySql.restockOnly=restockOnly;
  const select=document.getElementById('inventoryMovementItem');
  select.innerHTML=state.inventoryItems.map(i=>`<option value="${i.id}">${escapeHtml(i.name)} (${inventoryQty(i.current)} ${escapeHtml(i.unit)})</option>`).join('');
  if(itemId)select.value=String(itemId);
  document.getElementById('inventoryMovementType').value='restock';document.getElementById('inventoryMovementQty').value='';document.getElementById('inventoryMovementNote').value='';document.getElementById('inventoryMovementError').textContent='';
  document.querySelectorAll('#inventoryMovementModal [aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
  updateInventoryMovementDetails();
  document.getElementById('inventoryMovementModal').classList.remove('hidden');updateInventoryControls();
}
function updateInventoryMovementDetails() {
  const item=state.inventoryItems.find(item=>item.id===document.getElementById('inventoryMovementItem').value);if(!item)return;
  const quick=inventorySql.restockOnly,type=quick?'restock':document.getElementById('inventoryMovementType').value,units=inventoryRecipeUnits(item.unit);
  document.getElementById('inventoryMovementEyebrow').textContent=quick?'Restock':'Stock movement';
  document.getElementById('inventoryMovementTitle').textContent=quick?'Restock '+item.name:'Record stock movement';
  document.getElementById('inventoryMovementHelp').textContent=quick?'Enter how much stock you received.':'Record stock received, waste, or a count adjustment.';
  document.getElementById('inventoryMovementItemField').hidden=quick;
  document.getElementById('inventoryMovementTypeField').hidden=quick;
  document.getElementById('inventoryMovementUnitField').hidden=!quick||units.choices.length===1;
  document.getElementById('inventoryRestockSummary').hidden=!quick;
  document.getElementById('inventoryRestockItemName').textContent=item.name;
  document.getElementById('inventoryRestockCurrent').textContent='Current stock: '+inventoryQty(item.current)+' '+units.stock.code;
  document.getElementById('inventoryMovementQtyLabel').textContent=quick?'Quantity to add'+(units.choices.length===1?' ('+units.stock.code+')':''):'Quantity ('+units.stock.code+')';
  document.getElementById('inventoryMovementQtyField').className=quick&&units.choices.length===1?'full':'';
  const field=document.getElementById('inventoryMovementQty');
  if(type==='adjustment')field.removeAttribute('min');else field.setAttribute('min','0.001');
  const e=value=>escapeHtml(value).replaceAll('"','&quot;');
  document.getElementById('inventoryMovementUnit').innerHTML=units.choices.map(unit=>`<option value="${e(unit.code)}"${unit.code===units.stock.code?' selected':''}>${e(unit.label)}</option>`).join('');
  document.getElementById('inventoryMovementUnit').value=units.stock.code;
  document.getElementById('inventoryMovementNoteLabel').textContent=type==='restock'?'Reference or note (optional)':'Reason / receipt reference (required)';
  document.getElementById('inventoryMovementNote').placeholder=type==='restock'?'Delivery receipt or note, if any':'Enter a reason for this change';
  document.getElementById('inventoryMovementNote').required=type!=='restock';
  document.getElementById('inventoryMovementGuide').hidden=quick;
  document.getElementById('inventoryMovementGuide').textContent=type==='adjustment'?'A positive amount adds stock. A negative amount removes stock.':type==='waste'?'Enter the amount wasted as a positive number.':'Enter the amount received as a positive number.';
  document.getElementById('inventoryRestockPreview').hidden=!quick;
  updateInventoryRestockPreview();
}
function inventoryRestockQuantity(item) {
  const field=document.getElementById('inventoryMovementQty'),quantity=field.value.trim();
  if(field.validity.badInput||!quantity||Number(quantity)<=0)throw new Error('Enter a quantity to add, greater than zero.');
  return inventoryRecipeStockQuantity(item,quantity,document.getElementById('inventoryMovementUnit').value);
}
function updateInventoryRestockPreview() {
  if(!inventorySql.restockOnly)return;
  const item=state.inventoryItems.find(item=>item.id===document.getElementById('inventoryMovementItem').value);if(!item)return;
  const preview=document.getElementById('inventoryRestockPreview'),field=document.getElementById('inventoryMovementQty'),unit=inventoryRecipeUnits(item.unit).stock.code;
  document.getElementById('inventoryRestockCurrent').textContent='Current stock: '+inventoryQty(item.current)+' '+unit;
  preview.classList.remove('inventory-danger');
  try {
    if(!field.value.trim()&&!field.validity.badInput){preview.textContent='Enter a quantity to see the new stock total.';return;}
    const quantity=inventoryRestockQuantity(item);
    preview.textContent='After restock: '+inventoryQty(Number(item.current)+Number(quantity))+' '+unit+' (adding '+inventoryQty(quantity)+' '+unit+').';
    field.removeAttribute('aria-invalid');
  } catch(error){preview.textContent=error.message;preview.classList.add('inventory-danger');}
}
function closeInventoryMovementModal() {if(!inventorySql.busy)document.getElementById('inventoryMovementModal').classList.add('hidden');}
function saveInventoryMovement() {
  if(inventorySql.pending?.payload.action==='movement')return submitInventoryChange();
  if(!inventoryCanEdit())return;
  document.querySelectorAll('#inventoryMovementModal [aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
  const type=inventorySql.restockOnly?'restock':document.getElementById('inventoryMovementType').value,item=state.inventoryItems.find(item=>item.id===document.getElementById('inventoryMovementItem').value),field=document.getElementById('inventoryMovementQty');
  let quantity=field.value.trim();const note=document.getElementById('inventoryMovementNote').value.trim();
  try {
    if(!item)throw new Error('This stock item was removed. Close the form and refresh stock.');
    if(inventorySql.restockOnly)quantity=inventoryRestockQuantity(item);
    else {
      const pattern=type==='adjustment'?/^-?(?:[0-9]{1,9}(?:\.[0-9]{1,3})?|\.[0-9]{1,3})$/:/^(?:[0-9]{1,9}(?:\.[0-9]{1,3})?|\.[0-9]{1,3})$/;
      if(field.validity.badInput||!pattern.test(quantity)||Number(quantity)===0)throw new Error('Enter a valid nonzero quantity with at most three decimal places.');
      if(type==='waste')quantity='-'+quantity;
    }
    if(type!=='restock'&&!note){const error=new Error('Enter a reason for waste or adjustment.');error.fieldId='inventoryMovementNote';throw error;}
    if(note.length>500){const error=new Error('Keep the reference or note within 500 characters.');error.fieldId='inventoryMovementNote';throw error;}
    document.getElementById('inventoryMovementError').textContent='';
    return submitInventoryChange({action:'movement',id:item.id,type,quantity,note},'inventoryMovementError');
  } catch(error){
    document.getElementById('inventoryMovementError').textContent=error.message;
    const invalid=document.getElementById(error.fieldId||'inventoryMovementQty');invalid.setAttribute('aria-invalid','true');invalid.focus();
  }
}
function openInventoryRecipeModal(menuId=null) {
  if(!inventoryCanEdit())return;if(!state.inventoryItems.length||!inventorySql.menus.length){showToast('Add stock items and menu items first.');return;}
  const select=document.getElementById('inventoryRecipeMenu');select.innerHTML=inventorySql.menus.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  if(menuId)select.value=String(menuId);fillInventoryRecipeMaterials(select.value);
  document.getElementById('inventoryRecipeError').textContent='';document.getElementById('inventoryRecipeModal').classList.remove('hidden');updateInventoryControls();
}
function inventoryRecipeUnits(stockUnit) {
  const code=String(stockUnit).trim().toLowerCase();
  const groups=[
    [{code:'L',label:'Liters (L)',scale:1000,aliases:['l','liter','liters','litre','litres']},{code:'ml',label:'Milliliters (ml)',scale:1,aliases:['ml','milliliter','milliliters','millilitre','millilitres']}],
    [{code:'kg',label:'Kilograms (kg)',scale:1000,aliases:['kg','kilogram','kilograms']},{code:'g',label:'Grams (g)',scale:1,aliases:['g','gram','grams']}],
    [{code:'pcs',label:'Pieces (pcs)',scale:1,aliases:['pc','pcs','piece','pieces']}]
  ];
  for(const choices of groups){const stock=choices.find(unit=>unit.aliases.includes(code));if(stock)return {stock,choices};}
  const stock={code:String(stockUnit),label:String(stockUnit),scale:1};return {stock,choices:[stock]};
}
function inventoryRecipeConvertedQuantity(quantity,from,to) {
  if(!/^(?:[0-9]{1,9}(?:\.[0-9]{1,3})?|\.[0-9]{1,3})$/.test(quantity))throw new Error('Enter zero or a positive quantity with at most three decimal places.');
  const [whole,fraction='']=quantity.split('.');
  const amount=(BigInt(whole||'0')*1000n+BigInt(fraction.padEnd(3,'0')))*BigInt(from.scale),divisor=BigInt(to.scale);
  if(amount%divisor!==0n)throw new Error('Use an amount that converts exactly to 0.001 '+to.code+' increments.');
  const converted=amount/divisor;
  if(converted>999999999999n)throw new Error('The converted quantity cannot exceed 999999999.999 '+to.code+'.');
  return String(converted/1000n)+'.'+String(converted%1000n).padStart(3,'0');
}
function inventoryRecipeStockQuantity(item,quantity,unitCode) {
  const units=inventoryRecipeUnits(item.unit),selected=units.choices.find(unit=>unit.code===unitCode);
  if(!selected)throw new Error('Choose a compatible unit for '+item.name+'.');
  return inventoryRecipeConvertedQuantity(quantity,selected,units.stock);
}
function updateInventoryRecipeAmount(itemId) {
  const item=state.inventoryItems.find(item=>String(item.id)===String(itemId));if(!item)return;
  const field=document.getElementById('inventoryRecipeQty'+itemId),unit=document.getElementById('inventoryRecipeUnit'+itemId),hint=document.getElementById('inventoryRecipeAmount'+itemId);
  try {
    if(field.validity.badInput)throw new Error('Enter a valid quantity.');
    const quantity=field.value.trim(),converted=quantity?inventoryRecipeStockQuantity(item,quantity,unit.value):'0.000';
    hint.textContent=Number(converted)>0?'Deducts '+inventoryQty(converted)+' '+inventoryRecipeUnits(item.unit).stock.code+' from stock per menu item.':'Leave blank or enter 0 if this material is not used.';
    hint.classList.remove('inventory-danger');field.removeAttribute('aria-invalid');
  } catch(error){hint.textContent=error.message;hint.classList.add('inventory-danger');}
}
function fillInventoryRecipeMaterials(menuId) {
  const recipe=state.inventoryRecipes.find(r=>String(r.menuId)===String(menuId));inventorySql.recipeId=recipe?.id||null;
  const quantities=new Map((recipe?.ingredients||[]).map(line=>[String(line.item_id),line.qty]));
  const e=value=>escapeHtml(value).replaceAll('"','&quot;').replaceAll("'",'&#39;');
  document.getElementById('inventoryRecipeMaterials').innerHTML=state.inventoryItems.map(item=>{
    const id='inventoryRecipeQty'+item.id,unitId='inventoryRecipeUnit'+item.id,hintId='inventoryRecipeAmount'+item.id,units=inventoryRecipeUnits(item.unit);
    return `<div class="inventory-recipe-material-row"><div class="inventory-recipe-material-name"><b>${e(item.name)}</b><span>Stock unit: ${e(units.stock.code)}</span></div><div class="inventory-recipe-amount-controls"><label for="${e(id)}">Quantity<input id="${e(id)}" data-inventory-recipe-item="${e(item.id)}" aria-label="Quantity for ${e(item.name)}" aria-describedby="${e(hintId)} inventoryRecipeHelp" type="number" inputmode="decimal" min="0" max="999999999.999" step="0.001" placeholder="0" value="${e(quantities.get(String(item.id))??'')}" /></label><label for="${e(unitId)}">Unit<select id="${e(unitId)}" data-inventory-recipe-unit="${e(item.id)}" aria-label="Quantity unit for ${e(item.name)}" aria-describedby="${e(hintId)}">${units.choices.map(unit=>`<option value="${e(unit.code)}"${unit.code===units.stock.code?' selected':''}>${e(unit.label)}</option>`).join('')}</select></label></div><p id="${e(hintId)}" class="inventory-recipe-stock-amount"></p></div>`;
  }).join('');
  state.inventoryItems.forEach(item=>updateInventoryRecipeAmount(item.id));
  document.getElementById('inventoryRecipeError').textContent='';
}
function closeInventoryRecipeModal() {if(!inventorySql.busy)document.getElementById('inventoryRecipeModal').classList.add('hidden');}
function readInventoryRecipeMaterials() {
  const ingredients=[],seen=new Set(),items=new Map(state.inventoryItems.map(item=>[String(item.id),item]));
  for(const field of document.querySelectorAll('#inventoryRecipeMaterials [data-inventory-recipe-item]')) {
    const quantity=field.value.trim(),item=items.get(field.dataset.inventoryRecipeItem);
    if(!item||seen.has(String(item.id)))throw new Error('Stock items changed. Close this form and open it again.');
    seen.add(String(item.id));
    if(field.validity.badInput||(quantity&&!/^(?:[0-9]{1,9}(?:\.[0-9]{1,3})?|\.[0-9]{1,3})$/.test(quantity))) {
      const error=new Error(item.name+': enter zero or a positive quantity with at most three decimal places.');error.fieldId=field.id;throw error;
    }
    if(quantity&&Number(quantity)>0) {
      try {ingredients.push({item_id:item.id,quantity:inventoryRecipeStockQuantity(item,quantity,document.getElementById('inventoryRecipeUnit'+item.id).value)});}
      catch(error){error.message=item.name+': '+error.message;error.fieldId=field.id;throw error;}
    }
  }
  if(!ingredients.length)throw new Error('Enter a quantity greater than zero for at least one material.');
  if(ingredients.length>50)throw new Error('Use no more than 50 materials for one menu item.');
  return ingredients;
}
function saveInventoryRecipe() {
  if(!inventoryCanEdit())return;
  document.querySelectorAll('#inventoryRecipeMaterials [aria-invalid]').forEach(field=>field.removeAttribute('aria-invalid'));
  try {return submitInventoryChange({action:'save_recipe',menu_id:document.getElementById('inventoryRecipeMenu').value,recipe_id:inventorySql.recipeId,ingredients:readInventoryRecipeMaterials()},'inventoryRecipeError');}
  catch(error){
    document.getElementById('inventoryRecipeError').textContent=error.message;
    if(error.fieldId){const field=document.getElementById(error.fieldId);field?.setAttribute('aria-invalid','true');field?.focus();}
  }
}
async function submitInventoryChange(payload=null,errorId=null) {
  if(inventorySql.busy||!inventoryAllowed())return;
  if(!inventorySql.pending) {
    if(!payload)return;
    try {inventoryStorePending({payload:{...payload,submission_key:inventoryKey()},errorId});}
    catch(error){inventoryFeedback(errorId,'Could not save retry information. No change was sent. '+error.message);return;}
  }
  const pending=inventorySql.pending;errorId=pending.errorId;
  let failure=null;
  inventorySql.busy=true;inventorySql.request++;inventorySql.loading=false;inventorySql.error='';renderInventory();
  try {
    const response=await fetch(quvoPath('api/inventory/index.php'),{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF||''},signal:AbortSignal.timeout(15000),body:JSON.stringify(pending.payload)});
    const result=await response.json();if(!response.ok||!result.ok){const error=new Error(result.error||'Could not save inventory.');error.status=response.status;error.code=result.code;throw error;}
    try {inventoryStorePending(null);} catch {inventorySql.pending=null;}
    installInventorySnapshot(result.snapshot);inventorySql.busy=false;
    closeInventoryStockModal();closeInventoryMovementModal();closeInventoryRecipeModal();showToast(result.message);loadMenuItems();
  } catch(error) {
    failure=error;
    inventorySql.error=error.message;if(errorId)document.getElementById(errorId).textContent=error.message;
    if([400,404,413,422].includes(error.status)||['stock_changed','recipe_changed'].includes(error.code)) {
      try {inventoryStorePending(null);} catch {inventorySql.pending=null;}
      if(['stock_changed','recipe_changed'].includes(error.code)) {
        inventorySql.busy=false;closeInventoryStockModal();closeInventoryRecipeModal();await loadInventory();showToast(error.message+' Open the form again to review the latest values.');
      }
    } else inventorySql.error+=' Use Retry saved change to confirm the result.';
  } finally {
    inventorySql.busy=false;renderInventory();
    if(failure&&errorId&&!['stock_changed','recipe_changed'].includes(failure.code)) {
      const fields={stock_name:'inventoryItemName',stock_category:'inventoryCategory',stock_unit:'inventoryUnit',stock_current:'inventoryCurrent',stock_reorder:'inventoryReorder',stock_note:'inventoryNote'};
      inventoryFeedback(errorId,inventorySql.error,fields[failure.code]||null);
    }
  }
}
