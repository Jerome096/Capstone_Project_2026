const categoryTabs=document.getElementById('categoryTabs'),menuList=document.getElementById('menuList'),menuSearch=document.getElementById('menuSearch'),menuCount=document.getElementById('menuCount');
const accessModeLabel=document.getElementById('accessModeLabel'),menuCustomerName=document.getElementById('menuCustomerName'),menuContextLabel=document.getElementById('menuContextLabel');
function configureMenuHeader(){
 accessModeLabel.textContent='Online order';menuCustomerName.textContent=state.customerName||'Guest';menuContextLabel.textContent='Pickup or delivery request';
 paymentNote.textContent='Your selected payment method will be confirmed by Quvo Café staff before preparation begins.';fulfillmentCard.classList.remove('hidden');
}
function renderCategories(){
 categoryTabs.innerHTML=CUSTOMER_DATA.categories.map(category=>'<button class="category category-btn '+(category===state.selectedCategory?'active':'')+'" type="button" data-category="'+escapeCustomerHtml(category)+'" aria-pressed="'+(category===state.selectedCategory)+'">'+escapeCustomerHtml(category==='All'?'All items':QuvoMenuCategories.label(category))+'</button>').join('');
 categoryTabs.querySelectorAll('[data-category]').forEach(button=>button.addEventListener('click',()=>{state.selectedCategory=button.dataset.category;renderCategories();renderMenu();}));
}
function getFilteredMenuItems(){
 const rows=CUSTOMER_DATA.menuItems.filter(item=>(state.selectedCategory==='All'||item.category===state.selectedCategory)&&[item.name,QuvoMenuCategories.label(item.category),item.description||''].join(' ').toLowerCase().includes(state.searchTerm));
 const sort=document.getElementById('menuSort').value;if(sort==='price-low')rows.sort((a,b)=>a.price-b.price);if(sort==='price-high')rows.sort((a,b)=>b.price-a.price);return rows;
}
function renderMenu(){
 const items=getFilteredMenuItems();menuCount.textContent=items.length+' item'+(items.length===1?'':'s')+' to explore';
 const rows=state.selectedCategory==='All'?QuvoMenuCategories.filters(items).filter(category=>category!=='All'&&items.some(item=>item.category===category)).flatMap(category=>[category,...items.filter(item=>item.category===category)]):items;
 menuList.innerHTML=items.length?rows.map(item=>typeof item==='string'?'<h2 class="menu-category-heading" data-menu-category-heading="'+escapeCustomerHtml(item)+'">'+escapeCustomerHtml(QuvoMenuCategories.label(item))+'</h2>':QuvoStorefront.card(item)).join(''):'<div class="empty-card"><h3>'+(!CUSTOMER_DATA.menuItems.length?'No menu items available':'No matching items')+'</h3><p>'+(!CUSTOMER_DATA.menuItems.length?'Please refresh the menu or check back shortly.':'Try another category or search term.')+'</p></div>';
 QuvoMenuOptions.bindPhotos(menuList);QuvoStorefront.renderFeatured();
}
function bindMenuEvents(){menuSearch.addEventListener('input',event=>{state.searchTerm=event.target.value.trim().toLowerCase();renderMenu();});}
