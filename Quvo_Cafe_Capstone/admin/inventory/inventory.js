// SQL owns stock balances, recipes, availability and the movement log.
const inventorySql = {loaded:false, loading:false, busy:false, pending:null, request:0, error:'', menus:[], impact:[], nextOffset:null, editVersion:null, editCurrent:null, recipeId:null};
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
  document.getElementById('inventorySearch').addEventListener('input',renderInventoryRows);
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
  document.getElementById('inventoryRecipeMenu').addEventListener('change',event=>fillInventoryRecipeLines(event.target.value));
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
    const canRetry=kind==='Stock'&&inventorySql.pending?.payload.action==='save_item';
    document.getElementById('inventory'+kind+'Save').disabled=inventorySql.busy||unready||(Boolean(inventorySql.pending)&&!canRetry);
    document.getElementById('inventory'+kind+'Close').disabled=inventorySql.busy;
    document.getElementById('inventory'+kind+'Cancel').disabled=inventorySql.busy;
  }
  document.getElementById('inventoryLinkedMenu').disabled=true;
  document.getElementById('inventoryUnit').disabled=locked||Boolean(state.editingInventoryItemId);
  document.getElementById('inventoryStockSave').textContent=inventorySql.busy?'Saving…':inventorySql.pending?.payload.action==='save_item'?'Retry saved change':'Save stock';
}
function renderInventory() {
  if(!document.getElementById('inventoryRows'))return;
  document.getElementById('inventorySqlStatus').textContent=inventorySql.error||(inventorySql.busy?'Saving inventory change…':inventorySql.loading?'Loading stock records…':inventorySql.loaded?'Stock records are up to date. Ingredients are deducted when the cashier approves payment.':'Inventory has not loaded.');
  renderInventoryStats();renderInventoryRows();renderInventoryImpact();renderInventoryMovements();renderInventoryRecipes();updateInventoryControls();
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
    return `<div class="inventory-row"><div class="inventory-item-name">${e(item.name)}</div><span>${e(item.category)}</span><span><b>${inventoryQty(item.current)}</b> ${e(item.unit)}</span><span>${inventoryQty(item.reorder)} ${e(item.unit)}</span><span><span class="inventory-status ${status}">${getInventoryStatusLabel(status)}</span></span><span>${e(item.linkedMenu||'Not linked')}</span><span class="inventory-row-actions"><button class="btn light" onclick="openInventoryStockModal('${item.id}')">Edit</button><button class="btn dark" onclick="quickInventoryRestock('${item.id}')">Restock</button></span></div>`;
  }).join(''):`<div class="inventory-row"><span>${inventoryEmpty()}</span></div>`;
}
function renderInventoryImpact() {
  const e=escapeHtml;
  document.getElementById('inventoryImpactList').innerHTML=inventorySql.impact.length?inventorySql.impact.map(menu=>`<article class="inventory-impact-card"><b>${e(menu.name)}</b><p class="inventory-danger">Unavailable: insufficient ingredients for one serving. Restock the linked stock items.</p></article>`).join(''):`<article class="inventory-impact-card"><b>${inventorySql.loaded?'No menu items blocked by stock.':'Inventory not loaded.'}</b><p>Menu availability follows the quantities in each active Bill of Materials.</p></article>`;
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
function quickInventoryRestock(itemId) {addManualStockMovement(itemId);}
function addManualStockMovement(itemId=null) {
  if(!inventoryCanEdit())return;if(!state.inventoryItems.length){showToast('Add a stock item first.');return;}
  const select=document.getElementById('inventoryMovementItem');
  select.innerHTML=state.inventoryItems.map(i=>`<option value="${i.id}">${escapeHtml(i.name)} (${inventoryQty(i.current)} ${escapeHtml(i.unit)})</option>`).join('');
  if(itemId)select.value=String(itemId);
  document.getElementById('inventoryMovementType').value='restock';document.getElementById('inventoryMovementQty').value='';document.getElementById('inventoryMovementNote').value='';document.getElementById('inventoryMovementError').textContent='';
  document.getElementById('inventoryMovementModal').classList.remove('hidden');updateInventoryControls();
}
function closeInventoryMovementModal() {if(!inventorySql.busy)document.getElementById('inventoryMovementModal').classList.add('hidden');}
function saveInventoryMovement() {
  if(!inventoryCanEdit())return;
  const type=document.getElementById('inventoryMovementType').value;let quantity=document.getElementById('inventoryMovementQty').value.trim();
  if(type==='waste') {if(!/^[0-9]+(?:\.[0-9]{1,3})?$/.test(quantity)||Number(quantity)<=0){document.getElementById('inventoryMovementError').textContent='Enter a positive waste quantity.';return;}quantity='-'+quantity;}
  return submitInventoryChange({action:'movement',id:document.getElementById('inventoryMovementItem').value,type,quantity,note:document.getElementById('inventoryMovementNote').value.trim()},'inventoryMovementError');
}
function openInventoryRecipeModal(menuId=null) {
  if(!inventoryCanEdit())return;if(!state.inventoryItems.length||!inventorySql.menus.length){showToast('Add stock items and menu items first.');return;}
  const select=document.getElementById('inventoryRecipeMenu');select.innerHTML=inventorySql.menus.map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');
  if(menuId)select.value=String(menuId);fillInventoryRecipeLines(select.value);
  document.getElementById('inventoryRecipeError').textContent='';document.getElementById('inventoryRecipeModal').classList.remove('hidden');updateInventoryControls();
}
function fillInventoryRecipeLines(menuId) {
  const recipe=state.inventoryRecipes.find(r=>String(r.menuId)===String(menuId));inventorySql.recipeId=recipe?.id||null;
  document.getElementById('inventoryRecipeLines').value=recipe?recipe.ingredients.map(i=>i.item+' | '+Number(i.qty).toFixed(3)).join('\n'):'';
}
function closeInventoryRecipeModal() {if(!inventorySql.busy)document.getElementById('inventoryRecipeModal').classList.add('hidden');}
function parseInventoryRecipeLines(text) {
  const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(Boolean),seen=new Set();
  if(!lines.length||lines.length>50)throw new Error('Use between 1 and 50 ingredient lines.');
  return lines.map((line,index)=>{
    const parts=line.split('|').map(v=>v.trim());const item=state.inventoryItems.find(i=>i.name.toLowerCase()===parts[0].toLowerCase());
    if(parts.length!==2||!item||!/^[0-9]{1,9}(?:\.[0-9]{1,3})?$/.test(parts[1])||Number(parts[1])<=0)throw new Error('Line '+(index+1)+': use an existing stock item name | positive quantity, with at most three decimal places.');
    if(seen.has(item.id))throw new Error('Each stock item must appear only once.');seen.add(item.id);return {item_id:item.id,quantity:parts[1]};
  });
}
function saveInventoryRecipe() {
  if(!inventoryCanEdit())return;
  try {return submitInventoryChange({action:'save_recipe',menu_id:document.getElementById('inventoryRecipeMenu').value,recipe_id:inventorySql.recipeId,ingredients:parseInventoryRecipeLines(document.getElementById('inventoryRecipeLines').value)},'inventoryRecipeError');}
  catch(error){document.getElementById('inventoryRecipeError').textContent=error.message;}
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
