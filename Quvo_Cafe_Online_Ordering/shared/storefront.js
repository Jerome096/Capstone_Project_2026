(() => {
  "use strict";
  const $=selector=>document.querySelector(selector);
  let artSequence=0;
  const icons = {
    arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>', 'arrow-up':'<path d="M6 18 18 6M7 6h11v11"/>',
    cup:'<path d="M5 8h12v7a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8Z"/><path d="M17 9h2a3 3 0 0 1 0 6h-2M8 2v3m4-3v3m4-3v3M3 22h16"/>',
    bag:'<path d="m5 7-1 14h16L19 7H5Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
    user:'<circle cx="12" cy="7" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    heart:'<path d="M20.8 4.6a5.3 5.3 0 0 0-7.5 0L12 5.9l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.9a5.3 5.3 0 0 0 0-7.5Z"/>',
    spark:'<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3Z"/><path d="m20 1 .9 2.1L23 4l-2.1.9L20 7l-.9-2.1L17 4l2.1-.9L20 1Z"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    eye:'<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>',
    leaf:'<path d="M20 3S7 1 4 10c-3 9 10 14 14 4 2-4 2-11 2-11Z"/><path d="M3 22 16 8"/>',
    home:'<path d="m3 11 9-8 9 8M5 10v11h14V10M9 21v-7h6v7"/>',
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 1v2m0 18v2M1 12h2m18 0h2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
    flower:'<path d="M12 12C-1-4 12-6 12 12 12-6 25-4 12 12 30-1 32 12 12 12c20 0 18 13 0 0 13 16 0 18 0 0 0 18-13 16 0 0-18 13-20 0 0 0-20 0-18-13 0 0Z"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    chat:'<path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.8L3 21l1.8-5A9 9 0 1 1 21 11Z"/><path d="M8 9h8m-8 4h5"/>',
    edit:'<path d="m14 4 6 6M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15l-1 5Z"/>',
    check:'<path d="m5 12 4 4L19 6"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.cup}</svg>`;
  const paintIcons = (root = document) => root.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  function art(item) {
    const id='art-'+(++artSequence), color=item.tone;
    const defs=`<defs><linearGradient id="${id}-glass" x1="0" x2="1"><stop stop-color="#fff" stop-opacity=".75"/><stop offset=".4" stop-color="#fff" stop-opacity=".1"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></linearGradient><linearGradient id="${id}-drink" x1="0" y1="0" x2=".3" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="${item.id==='matcha'?'#b3c68b':'#ecdbc1'}"/></linearGradient><filter id="${id}-shadow" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="7"/></filter><clipPath id="${id}-clip"><path d="m139 67 11 171q0 11 13 11h75q13 0 13-11l11-171Z"/></clipPath></defs>`;
    const background='<ellipse cx="201" cy="249" rx="92" ry="12" fill="#554e3621" filter="url(#'+id+'-shadow)"/>';
    let drawing;
    if(item.art==='iced') drawing=`<path d="m139 67 11 171q0 11 13 11h75q13 0 13-11l11-171Z" fill="#f7f2e7" stroke="#8d846f" stroke-opacity=".4" stroke-width="1.3"/><g clip-path="url(#${id}-clip)"><rect x="136" y="83" width="130" height="170" fill="url(#${id}-drink)"/><path d="M135 122q25-15 51 1t49 0 39-3v-37H135Z" fill="${item.id==='matcha'?'#6b833e':'#9e6d42'}" opacity=".75"/><path d="M138 169q31-13 59 4t65-4v60H138Z" fill="#fff9e2" opacity=".28"/><g fill="#fffcf0" fill-opacity=".57" stroke="#fff" stroke-opacity=".48" stroke-width="2"><rect x="151" y="87" width="28" height="25" rx="5" transform="rotate(-12 165 99)"/><rect x="186" y="78" width="31" height="29" rx="5" transform="rotate(12 200 92)"/><rect x="224" y="89" width="25" height="26" rx="4" transform="rotate(-15 236 102)"/><rect x="172" y="120" width="27" height="24" rx="4" transform="rotate(14 185 132)"/><rect x="214" y="124" width="27" height="25" rx="4" transform="rotate(-8 227 136)"/></g><path d="M151 84 160 230q1 8 8 8" fill="none" stroke="white" stroke-opacity=".45" stroke-width="4"/><path d="m248 83-7 149" stroke="#fff" stroke-opacity=".2" stroke-width="2"/></g><ellipse cx="200" cy="68" rx="61" ry="10" fill="#e4d9c0" stroke="#aaa18e" stroke-width="1"/><ellipse cx="200" cy="68" rx="54" ry="6" fill="${item.id==='matcha'?'#82974e':'#9d7049'}"/><path d="m218 117 18-90q1-6 7-6h20" fill="none" stroke="#9b946f" stroke-width="7" stroke-linecap="round"/><path d="m217 115 18-89q1-6 7-6h20" fill="none" stroke="#f7f1d8" stroke-width="2" stroke-linecap="round"/><ellipse cx="200" cy="246" rx="40" ry="3" fill="#ddd8c9"/>`;
    else if(item.art==='hot') drawing=`<ellipse cx="200" cy="232" rx="107" ry="23" fill="#d4d4c6"/><ellipse cx="200" cy="227" rx="105" ry="21" fill="#faf9f3" stroke="#d1d2c6"/><path d="M267 119h11c48 0 40 61 0 63h-12" fill="none" stroke="#f9f8f1" stroke-width="14"/><path d="M125 105h144l-8 82q-5 33-61 33t-64-33Z" fill="#fdfcf7" stroke="#d4d3c6" stroke-width="1.5"/><ellipse cx="197" cy="107" rx="72" ry="24" fill="#f8f5e9" stroke="#d4d3c6"/><ellipse cx="197" cy="108" rx="62" ry="17" fill="#b9824d"/><path d="M197 122c-35-12-30-25-17-22 6 0 11 7 17 12 6-5 11-12 17-12 13-3 18 10-17 22Z" fill="#f2e3c8"/><path d="M148 140v33q0 19 18 24" fill="none" stroke="white" stroke-width="5"/><g stroke="#b0aa93" stroke-width="2" fill="none" opacity=".6"><path d="M177 71c-13-16 13-19 0-35"/><path d="M204 66c-13-16 13-19 0-35"/><path d="M229 72c-13-16 13-19 0-35"/></g>`;
    else if(item.art==='toast') drawing=`<ellipse cx="201" cy="191" rx="126" ry="66" fill="#f9f8f1" stroke="#d6d5c8" stroke-width="2"/><ellipse cx="201" cy="189" rx="103" ry="48" fill="#e9e6da"/><g transform="rotate(-14 200 165)"><rect x="120" y="111" width="103" height="104" rx="20" fill="#a46c30"/><rect x="126" y="115" width="91" height="90" rx="17" fill="#e0b66d"/><rect x="181" y="96" width="103" height="103" rx="19" fill="#ab7032"/><rect x="187" y="101" width="91" height="89" rx="16" fill="#e5bb76"/><path d="m198 115 61 59m-45-65 53 51m-71-22 50 48" stroke="#b08043" stroke-width="4" opacity=".45"/><rect x="210" y="123" width="31" height="26" rx="3" fill="#f1d48a"/></g><g fill="#aa4d37"><ellipse cx="130" cy="196" rx="13" ry="15"/><ellipse cx="151" cy="210" rx="11" ry="13"/></g><g fill="#73864e"><path d="m125 181 8-14 5 15Z"/><path d="m147 198 7-12 5 12Z"/></g>`;
    else if(item.art==='plate') drawing=`<ellipse cx="200" cy="175" rx="126" ry="86" fill="#f9f8f1" stroke="#d2d2c4" stroke-width="2"/><ellipse cx="200" cy="174" rx="104" ry="67" fill="#edecdf"/><path d="M118 168c-26-35 19-66 55-46 38-31 66 16 43 41 9 35-27 55-50 32-18 19-55 3-48-27Z" fill="#fffef2" stroke="#dddaca"/><ellipse cx="168" cy="153" rx="25" ry="20" fill="#e8b53f"/><ellipse cx="160" cy="147" rx="9" ry="6" fill="#f8cf62"/><g fill="#758555"><path d="M232 190c-31-33-10-60 3-47 12-32 30-8 17 12 34 4 17 36-20 35Z"/><path d="M258 206c-23-24 0-41 14-24 10-16 24 4-14 24Z"/></g><g fill="#b36148"><ellipse cx="224" cy="211" rx="20" ry="11" transform="rotate(15 224 211)"/><ellipse cx="257" cy="123" rx="17" ry="13"/></g>`;
    else drawing=`<ellipse cx="200" cy="229" rx="112" ry="24" fill="#f7f6ed" stroke="#d4d3c5"/><path d="M104 139q10 91 96 91t96-91Z" fill="#eeece1" stroke="#c5c5b6" stroke-width="1.5"/><ellipse cx="200" cy="139" rx="97" ry="42" fill="#fffef6" stroke="#d2d0bf"/><ellipse cx="200" cy="139" rx="84" ry="33" fill="#ba934b"/><g fill="#edd9a7"><ellipse cx="165" cy="131" rx="21" ry="10" transform="rotate(-20 165 131)"/><ellipse cx="226" cy="147" rx="25" ry="11" transform="rotate(11 226 147)"/></g><g fill="#7b8c4a"><ellipse cx="211" cy="119" rx="14" ry="5" transform="rotate(-15 211 119)"/><ellipse cx="177" cy="151" rx="11" ry="4" transform="rotate(22 177 151)"/></g><path d="M171 83c-12-15 13-18 0-33m30 29c-12-15 13-18 0-33m28 37c-12-15 13-18 0-33" fill="none" stroke="#a49b80" stroke-width="2" opacity=".5"/>`;
    return `<svg viewBox="0 0 400 300" aria-hidden="true">${defs}${background}${drawing}</svg>`;
  }
  const publicScreens={home:'screenHome',menu:'screenMenu',about:'screenAbout'};
  let pendingSelection=null,aboutRequest=0;
  function productArt(item){
    if(item.imageUrl)return QuvoMenuOptions.photoHTML(item);
    const food=QuvoMenuCategories.isFood(item.category),matcha=/matcha/i.test(item.name);
    return art({...item,id:matcha?'matcha':item.id,art:food?'plate':item.category==='hot-coffee'||/hot|espresso|cappuccino/i.test(item.name)?'hot':'iced',tone:matcha?'#829b53':food?'#d9a52f':'#bc9369'});
  }
  function card(item){
    const e=escapeCustomerHtml,bg=QuvoMenuCategories.isFood(item.category)?'#ebe7dc':/matcha/i.test(item.name)?'#e8ecdf':'#eee7da';
    return `<article class="menu-card" data-card-item-id="${e(item.id)}" style="--art-bg:${bg}"><button type="button" class="product-image" data-open-item="${e(item.id)}" aria-label="View ${e(item.name)}">${productArt(item)}</button><div class="product-info"><p class="product-category">${e(QuvoMenuCategories.label(item.category))}</p><button type="button" class="product-title" data-open-item="${e(item.id)}">${e(item.name)}</button><p class="product-description">${e(item.description||'Make it your own. View available options.')}</p><div class="product-bottom"><strong class="product-price">${QuvoMenuOptions.priceLabel(item)}</strong><button type="button" class="add-item" data-open-item="${e(item.id)}" aria-label="Customize ${e(item.name)}">${icon('plus')}</button></div></div></article>`;
  }
  function renderFeatured(){
    const root=$('#storefrontFeaturedList');if(!root)return;
    root.innerHTML=CUSTOMER_DATA.menuItems.length?CUSTOMER_DATA.menuItems.slice(0,4).map(card).join(''):'<div class="empty-card"><h3>Our menu will be here soon.</h3><p>Check the menu for the latest availability.</p><a class="text-link" href="#menu">Explore the menu '+icon('arrow')+'</a></div>';
    QuvoMenuOptions.bindPhotos(root);
  }
  function renderEditableHeading(selector,headline,accent){
    const target=$(selector);if(!target||typeof headline!=='string')return;
    const ending=typeof accent==='string'?accent:(target.querySelector('em')?.textContent||'');
    target.replaceChildren();headline.split(/\r?\n/).forEach((line,index)=>{if(index)target.append(document.createElement('br'));target.append(document.createTextNode(line));});
    if(ending){const highlight=document.createElement('em');highlight.textContent=ending;target.append(document.createTextNode(' '),highlight);}
  }
  function renderAbout(data){
    renderEditableHeading('#home-headline',data?.home_headline,data?.home_accent);
    renderEditableHeading('#about-story-heading',data?.story_headline,data?.story_accent);
    if(typeof data?.home_eyebrow==='string'){$('#home-eyebrow-text').textContent=data.home_eyebrow;$('#home-eyebrow').hidden=!data.home_eyebrow.trim();}
    if(typeof data?.home_intro==='string'){$('#home-introduction').textContent=data.home_intro;$('#home-introduction').hidden=!data.home_intro.trim();}

    const text=key=>typeof data?.[key]==='string'?data[key]:'';
    const heading=$('#about-headline');heading.replaceChildren(document.createTextNode(text('headline')));
    if(text('accent')){const accent=document.createElement('em');accent.textContent=text('accent');heading.append(document.createElement('br'),accent);}
    $('#about-introduction').textContent=text('intro');
    $('#about-story-copy').replaceChildren(...text('story').split(/\n\s*\n/).filter(Boolean).map(value=>{const node=document.createElement('p');node.textContent=value;return node;}));
    $('#visit-address').hidden=!text('address');$('#visit-address-text').textContent=text('address');$('#visit-hours').hidden=!text('hours');$('#visit-hours-text').textContent=text('hours');
    for(const key of ['phone','email']){$('#visit-'+key).textContent=text(key);$('#visit-'+key).hidden=!text(key);}
    let social='';try{const url=new URL(text('social'));if(['https:','http:'].includes(url.protocol))social=url.href;}catch{}
    $('#visit-social').hidden=!social;if(social)$('#visit-social').href=social;else $('#visit-social').removeAttribute('href');
    $('#visit-contact').hidden=!(text('phone')||text('email')||social);$('#about-visit').hidden=!(text('address')||text('hours')||text('phone')||text('email')||social);
  }
  async function loadAbout(){
    const request=++aboutRequest,status=$('#aboutLoadStatus');
    try{const result=await onlineApi(null,'about');if(request!==aboutRequest)return;if(!result.content||typeof result.content!=='object')throw Error('Cafe details could not be loaded.');renderAbout(result.content);status.hidden=true;}
    catch{if(request===aboutRequest){status.textContent='Cafe details could not be updated. Try opening this page again shortly.';status.hidden=false;}}
  }
  function syncAccount(){
    document.body.classList.toggle('customer-signed-in',Boolean(state.onlineCustomer));
    const name=$('#headerCustomerName');if(name)name.textContent=state.onlineCustomer?.name?.trim().split(/\s+/)[0]||'Account';
    const note=$('#menuGuestNote');if(note){note.replaceChildren(document.createTextNode(state.onlineCustomer?'Make a little room for your favorites.':'Have a look around. Sign in only when you order.'));}
    updateCart();
  }
  function updateCart(){const badge=$('#headerCartCount');if(badge){const count=state.cart.reduce((sum,row)=>sum+row.quantity,0);badge.textContent=count;badge.hidden=count===0;}}
  function requestLogin(){
    const dialog=$('#onlineAuthDialog');if(!dialog)return;
    $('#onlineAuthContext').textContent=pendingSelection?'Sign in to add your selected item to your order.':'Sign in to order your favorites.';
    if(!dialog.open)dialog.showModal();document.body.classList.add('storefront-auth-open');
  }
  function rememberSelection(selection){pendingSelection=selection;}
  function cancelSelection(){pendingSelection=null;}
  async function finishSignIn(){
    const selection=pendingSelection;pendingSelection=null;
    $('#onlineAuthDialog')?.close();document.body.classList.remove('storefront-auth-open');syncAccount();
    if(!selection)return false;
    const item=CUSTOMER_DATA.menuItems.find(row=>row.id===selection.itemId);
    if(!item){showToast('Your selected item is no longer available. Please choose another.');return true;}
    if(onlineCartLocked()){showToast('Retry your saved order before adding another item.');return true;}
    openItemModal(item.id);state.modalQuantity=selection.quantity;
    QuvoMenuOptions.render(drinkOptions,item,selection.options);$('#itemNotes').value=selection.notes;updateModalPrice();
    if(item.optionVersion!==selection.optionVersion||Number(item.price)!==selection.price){showToast('This item changed while you signed in. Review the current options and price.');return true;}
    handleAddToCart({preventDefault(){}});
    return true;
  }
  function screenChanged(screenId){
    syncAccount();document.querySelectorAll('[data-site-page]').forEach(link=>{const active=link.dataset.sitePage===screenId;link.classList.toggle('active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    const route=Object.keys(publicScreens).find(key=>publicScreens[key]===screenId);
    if(route&&location.hash!=='#'+route)history.replaceState(null,'','#'+route);
    document.querySelectorAll('.storefront-account[open]').forEach(details=>details.removeAttribute('open'));
    if(['screenHome','screenAbout'].includes(screenId))loadAbout();
  }
  function bind(){
    paintIcons();$('#storefrontYear').textContent=new Date().getFullYear();
    const dialog=$('#onlineAuthDialog');
    for(const id of ['closeOnlineAuth','browseWithoutLogin'])$('#'+id).addEventListener('click',()=>{pendingSelection=null;dialog.close();});
    dialog.addEventListener('close',()=>{pendingSelection=null;document.body.classList.remove('storefront-auth-open');});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const box=dialog.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)dialog.close();}});
    $('#headerSignOut').addEventListener('click',()=>logoutOnlineCustomer());
    document.addEventListener('click',event=>{const cardNode=event.target.closest('[data-card-item-id]');if(cardNode)openItemModal(cardNode.dataset.cardItemId);});
    window.addEventListener('hashchange',()=>{const next=publicScreens[location.hash.slice(1)];if(next)showScreen(next);});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&['screenHome','screenAbout'].includes(state.currentScreen))loadAbout();});
    $('#menuSort').addEventListener('change',renderMenu);
    document.querySelectorAll('[data-auth-tab]').forEach(button=>button.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const tab=state.authMode==='login'?'register':'login';switchAuthTab(tab);document.getElementById(tab==='login'?'loginTabBtn':'registerTabBtn').focus();}}));
  }
  window.QuvoStorefront={card,renderFeatured,loadAbout,syncAccount,updateCart,requestLogin,rememberSelection,cancelSelection,finishSignIn,screenChanged,bind,publicScreen:()=>publicScreens[location.hash.slice(1)]||'screenHome'};

})();
