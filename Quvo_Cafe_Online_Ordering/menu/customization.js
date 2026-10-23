const itemModal=document.getElementById('itemModal'),customizeForm=document.getElementById('customizeForm');
const modalItemIcon=document.getElementById('modalItemIcon'),modalItemCategory=document.getElementById('modalItemCategory'),modalItemName=document.getElementById('modalItemName'),modalItemDesc=document.getElementById('modalItemDesc');
const modalQty=document.getElementById('modalQty'),decreaseQty=document.getElementById('decreaseQty'),increaseQty=document.getElementById('increaseQty'),drinkOptions=document.getElementById('drinkOptions'),addToCartBtn=document.getElementById('addToCartBtn');
let onlineItemReturnFocus=null;
function openItemModal(itemId){
  if(onlineCartLocked())return showToast('Retry your pending order before changing the cart.');
  const item=CUSTOMER_DATA.menuItems.find(entry=>entry.id===itemId);if(!item)return showToast('This item is no longer available.');
  onlineItemReturnFocus=document.activeElement;
  state.selectedItem=item;state.editingCartId=null;state.modalQuantity=1;customizeForm.reset();modalQty.textContent='1';
  QuvoMenuOptions.photo(modalItemIcon,item);modalItemCategory.textContent=item.category;modalItemName.textContent=item.name;modalItemDesc.textContent=item.description;
  QuvoMenuOptions.render(drinkOptions,item);drinkOptions.style.display=QuvoMenuOptions.groups(item).length?'grid':'none';
  itemModal.classList.add('open');itemModal.setAttribute('aria-hidden','false');document.body.classList.add('storefront-item-open');updateModalPrice();
  itemModal.querySelector('.close-btn')?.focus({preventScroll:true});
}
function closeItemModal(){itemModal.classList.remove('open');itemModal.setAttribute('aria-hidden','true');document.body.classList.remove('storefront-item-open');state.editingCartId=null;if(onlineItemReturnFocus?.isConnected&&onlineItemReturnFocus.getClientRects().length)onlineItemReturnFocus.focus({preventScroll:true});onlineItemReturnFocus=null;}
function openCartItemEditor(cartId){
  if(onlineCartLocked())return showToast('Retry your pending order before changing the cart.');
  const line=state.cart.find(item=>item.cartId===cartId);if(!line)return;
  if(!CUSTOMER_DATA.menuItems.some(item=>item.id===line.itemId))return showToast('This item is no longer available in the menu.');
  openItemModal(line.itemId);state.editingCartId=cartId;state.selectedItem={...state.selectedItem,price:line.unitPrice};state.modalQuantity=line.quantity;
  QuvoMenuOptions.render(drinkOptions,state.selectedItem,QuvoMenuOptions.savedSelections(state.selectedItem,line.customization));
  document.getElementById('itemNotes').value=line.customization.notes||'';updateModalPrice();
}
function getCustomizationSummary(){return {size:'Not applicable',sugarLevel:'Not applicable',iceLevel:'Not applicable',addons:[],notes:document.getElementById('itemNotes').value.trim(),...QuvoMenuOptions.read(drinkOptions,state.selectedItem)};}
function calculateModalUnitPrice(){return state.selectedItem?Number(state.selectedItem.price):0;}
function updateModalPrice(){modalQty.textContent=state.modalQuantity;addToCartBtn.textContent=state.selectedItem?(state.editingCartId?'Save changes':'Add to cart')+' \u00b7 '+formatCurrency(calculateModalUnitPrice()*state.modalQuantity):'Add to cart';}
function handleAddToCart(event){
  event.preventDefault();if(onlineCartLocked())return showToast('Retry your pending order before changing the cart.');
  if(!state.selectedItem||!QuvoMenuOptions.valid(drinkOptions))return;
  if(!state.editingCartId&&state.cart.length>=50)return showToast('An order can contain up to 50 item lines.');
  const customization=getCustomizationSummary();
  if(!state.onlineCustomer){
    QuvoStorefront.rememberSelection({itemId:state.selectedItem.id,quantity:state.modalQuantity,options:QuvoMenuOptions.values(drinkOptions),notes:customization.notes,optionVersion:state.selectedItem.optionVersion,price:Number(state.selectedItem.price)});
    closeItemModal();QuvoStorefront.requestLogin();return;
  }
  if(state.editingCartId){const existing=state.cart.find(item=>item.cartId===state.editingCartId);if(!existing){closeItemModal();return;}existing.quantity=state.modalQuantity;existing.customization=customization;closeItemModal();renderCart();showToast('Cart item updated.');return;}
  state.cart.push({cartId:state.selectedItem.id+'-'+Date.now()+'-'+Math.random().toString(36).slice(2),itemId:state.selectedItem.id,name:state.selectedItem.name,category:state.selectedItem.category,icon:state.selectedItem.icon,imageUrl:state.selectedItem.imageUrl,quantity:state.modalQuantity,unitPrice:calculateModalUnitPrice(),customization});
  closeItemModal();renderCart();showToast('Item added to cart.');
}
function bindCustomizationEvents(){
  document.querySelectorAll('[data-close-modal]').forEach(element=>element.addEventListener('click',closeItemModal));
  decreaseQty.addEventListener('click',()=>{state.modalQuantity=Math.max(1,state.modalQuantity-1);updateModalPrice();});
  increaseQty.addEventListener('click',()=>{state.modalQuantity=Math.min(999,state.modalQuantity+1);updateModalPrice();});
  customizeForm.addEventListener('change',updateModalPrice);customizeForm.addEventListener('submit',handleAddToCart);
  document.addEventListener('keydown',event=>{
    if(!itemModal.classList.contains('open'))return;
    if(event.key==='Escape'){closeItemModal();return;}
    if(event.key==='Tab'){
      const controls=[...itemModal.querySelectorAll('button,input,select,textarea,a[href]')].filter(element=>!element.disabled&&element.getClientRects().length);
      const first=controls[0],last=controls[controls.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
    }
  });
}
