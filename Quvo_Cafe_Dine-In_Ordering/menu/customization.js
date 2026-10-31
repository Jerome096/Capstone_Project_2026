const itemModal=document.getElementById('itemModal'),customizeForm=document.getElementById('customizeForm');
const modalItemIcon=document.getElementById('modalItemIcon'),modalItemCategory=document.getElementById('modalItemCategory'),modalItemName=document.getElementById('modalItemName'),modalItemDesc=document.getElementById('modalItemDesc');
const modalQty=document.getElementById('modalQty'),decreaseQty=document.getElementById('decreaseQty'),increaseQty=document.getElementById('increaseQty'),drinkOptions=document.getElementById('drinkOptions'),addToCartBtn=document.getElementById('addToCartBtn');
function openItemModal(itemId){
  if(dineCartLocked())return showToast('Retry your pending order before changing the cart.');
  const item=CUSTOMER_DATA.menuItems.find(entry=>entry.id===itemId);if(!item)return showToast('This item is no longer available.');
  state.selectedItem=item;state.editingCartId=null;state.modalQuantity=1;customizeForm.reset();modalQty.textContent='1';
  QuvoMenuOptions.photo(modalItemIcon,item);modalItemCategory.textContent=QuvoMenuCategories.label(item.category);modalItemName.textContent=item.name;modalItemDesc.textContent=item.description;
  QuvoMenuOptions.render(drinkOptions,item);drinkOptions.style.display=QuvoMenuOptions.groups(item).length?'grid':'none';
  itemModal.classList.add('open');itemModal.setAttribute('aria-hidden','false');updateModalPrice();
}
function closeItemModal(){itemModal.classList.remove('open');itemModal.setAttribute('aria-hidden','true');state.editingCartId=null;}
function openCartItemEditor(cartId){
  if(dineCartLocked())return showToast('Retry your pending order before changing the cart.');
  const line=state.cart.find(item=>item.cartId===cartId);if(!line)return;
  if(!CUSTOMER_DATA.menuItems.some(item=>item.id===line.itemId))return showToast('This item is no longer available in the menu.');
  openItemModal(line.itemId);state.editingCartId=cartId;state.selectedItem={...state.selectedItem,price:QuvoMenuOptions.hasPricing(state.selectedItem)||line.pricedOptions?state.selectedItem.price:line.unitPrice};state.modalQuantity=line.quantity;
  QuvoMenuOptions.render(drinkOptions,state.selectedItem,QuvoMenuOptions.savedSelections(state.selectedItem,line.customization));
  document.getElementById('itemNotes').value=line.customization.notes||'';updateModalPrice();
}
function getCustomizationSummary(){return {size:'Not applicable',sugarLevel:'Not applicable',iceLevel:'Not applicable',addons:[],notes:document.getElementById('itemNotes').value.trim(),...QuvoMenuOptions.read(drinkOptions,state.selectedItem)};}
function calculateModalUnitPrice(){return state.selectedItem?QuvoMenuOptions.price(state.selectedItem,QuvoMenuOptions.values(drinkOptions)):0;}
function modalQuantityLimit(){return state.selectedItem?QuvoCartLimits.remaining(state.selectedItem.id,state.editingCartId):QuvoCartLimits.max;}
function updateModalPrice(){modalQty.textContent=state.modalQuantity;increaseQty.disabled=state.modalQuantity>=modalQuantityLimit();decreaseQty.disabled=state.modalQuantity<=1;addToCartBtn.disabled=!state.selectedItem||!QuvoCartLimits.allowed(state.selectedItem.id,state.modalQuantity,state.editingCartId);addToCartBtn.textContent=state.selectedItem?(state.editingCartId?'Save changes':'Add to cart')+' \u00b7 '+formatCurrency(calculateModalUnitPrice()*state.modalQuantity):'Add to cart';}
function handleAddToCart(event){
  event.preventDefault();if(dineCartLocked())return showToast('Retry your pending order before changing the cart.');
  if(!state.selectedItem||!QuvoMenuOptions.valid(drinkOptions))return;
  if(!state.editingCartId&&state.cart.length>=50)return showToast('An order can contain up to 50 item lines.');
  if(!QuvoCartLimits.allowed(state.selectedItem.id,state.modalQuantity,state.editingCartId))return showToast(QuvoCartLimits.message);
  const customization=getCustomizationSummary();
  if(state.editingCartId){const existing=state.cart.find(item=>item.cartId===state.editingCartId);if(!existing){closeItemModal();return;}existing.quantity=state.modalQuantity;existing.unitPrice=calculateModalUnitPrice();existing.pricedOptions=QuvoMenuOptions.hasPricing(state.selectedItem);existing.customization=customization;window.QuvoDineCart?.save();closeItemModal();renderCart();showToast('Cart item updated.');return;}
  state.cart.push({cartId:state.selectedItem.id+'-'+Date.now()+'-'+Math.random().toString(36).slice(2),itemId:state.selectedItem.id,name:state.selectedItem.name,category:state.selectedItem.category,icon:state.selectedItem.icon,imageUrl:state.selectedItem.imageUrl,quantity:state.modalQuantity,unitPrice:calculateModalUnitPrice(),pricedOptions:QuvoMenuOptions.hasPricing(state.selectedItem),customization});
  window.QuvoDineCart?.save();
  closeItemModal();renderCart();showToast('Item added to cart.');
}
function bindCustomizationEvents(){
  document.querySelectorAll('[data-close-modal]').forEach(element=>element.addEventListener('click',closeItemModal));
  decreaseQty.addEventListener('click',()=>{state.modalQuantity=Math.max(1,state.modalQuantity-1);updateModalPrice();});
  increaseQty.addEventListener('click',()=>{if(state.modalQuantity>=modalQuantityLimit())return showToast(QuvoCartLimits.message);state.modalQuantity++;updateModalPrice();});
  customizeForm.addEventListener('change',updateModalPrice);customizeForm.addEventListener('submit',handleAddToCart);
}
