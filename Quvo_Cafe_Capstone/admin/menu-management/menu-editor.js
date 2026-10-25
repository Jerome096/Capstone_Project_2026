(() => {
  'use strict';
  const drafts=new Map();let current=null;
  const id=prefix=>prefix+'_'+Array.from(crypto.getRandomValues(new Uint8Array(8)),value=>value.toString(16).padStart(2,'0')).join('');
  const e=value=>escapeAttribute(value);
  function capture(){
    if(!current||!document.getElementById('adminItemName'))return;
    const draft=drafts.get(current);if(!draft)return;
    for(const [key,field] of [['name','adminItemName'],['category','adminItemCategory'],['price','adminItemPrice']])draft[key]=document.getElementById(field).value;
    draft.manualAvailable=document.getElementById('adminItemAvailable').value==='true';draft.optionGroups=readGroups();
    draft.sizeEnabled=document.getElementById('adminUseSizePricing')?.checked||false;
    const size=readSizeGroup();if(size)draft.sizeDraft=size;
  }
  function item(item){capture();current=item.id;if(!drafts.has(item.id)){const groups=structuredClone(QuvoMenuOptions.groups(item)),size=groups.find(group=>group.pricing==='size');drafts.set(item.id,{...structuredClone(item),optionGroups:groups,sizeDraft:size||null,sizeEnabled:Boolean(size),imageChanged:false,imageBusy:false});}return drafts.get(item.id);}
  function forget(itemId){drafts.delete(itemId);if(current===itemId)current=null;}
  function readCard(card){return {id:card.dataset.groupId,label:card.querySelector('[data-group-label]').value.trim(),type:card.querySelector('[data-group-type]').value,required:card.querySelector('[data-group-required]').checked,default:card.querySelector('[data-group-default]').value,pricing:card.querySelector('[data-group-pricing]').value,choices:[...card.querySelectorAll('[data-choice-id]')].map(row=>({id:row.dataset.choiceId,label:row.querySelector('[data-choice-label]').value.trim(),...(row.querySelector('[data-choice-price]')?{price:row.querySelector('[data-choice-price]').value}:{})}))};}
  function readSizeGroup(){const root=document.getElementById('adminSizePriceRows');return document.getElementById('adminUseSizePricing')?.checked&&root?.querySelector('[data-group-id]')?readCard(root.querySelector('[data-group-id]')):null;}
  function readGroups(){
    const root=document.getElementById('adminOptionGroups');if(!root)return drafts.get(current)?.optionGroups||[];
    const size=readSizeGroup();return [...(size?[size]:[]),...[...root.querySelectorAll('.admin-option-card')].map(readCard)];
  }
  function syncPricingMode(){
    const enabled=document.getElementById('adminUseSizePricing')?.checked||false;
    const required=document.querySelector('#adminSizePriceRows [data-group-required]')?.checked||false;
    const field=document.getElementById('adminSinglePriceField'),input=document.getElementById('adminItemPrice');
    if(!field||!input)return;
    field.hidden=enabled&&required;input.disabled=enabled&&required;
    document.getElementById('adminSinglePriceLabel').textContent=enabled?'Price without a size (₱)':'Item price (₱)';
    document.getElementById('adminPriceHelp').textContent=enabled?(required?'Customers choose one size. Each size has its own full price; add-on charges are added afterward.':'Price without a size applies only if the customer skips choosing a size. Add-on charges are added afterward.'):'Set the item price here. Add-on charges are added to this price.';
  }
  function itemPrice(groups){
    const size=groups.find(group=>group.pricing==='size');
    if(!size||!size.required)return document.getElementById('adminItemPrice').value;
    const amounts=size.choices.map(choice=>String(choice.price).replace(/^\./,'0.'));
    if(!amounts.length||amounts.some(value=>!/^\d{1,10}(\.\d{1,2})?$/.test(value)||Math.round(Number(value)*100)>9999999999))throw Error('Enter a valid price for every size.');
    return (Math.min(...amounts.map(value=>Math.round(Number(value)*100)))/100).toFixed(2);
  }
  function renderSizePricing(draft){
    const root=document.getElementById('adminSizePricing');if(!root)return;
    const group=draft.sizeDraft;
    root.innerHTML=`<label class="admin-option-required admin-size-toggle"><input id="adminUseSizePricing" type="checkbox" ${draft.sizeEnabled?'checked':''}>This item has size prices</label><p class="helper-text">${draft.sizeEnabled?'Enter the full selling price for each size below.':'Turn on if this item is sold in different sizes.'}</p><div id="adminSizePriceRows" ${draft.sizeEnabled?'':'hidden'}></div>`;
    const rows=root.querySelector('#adminSizePriceRows');
    if(draft.sizeEnabled&&group){
      rows.innerHTML=`<fieldset class="admin-option-card admin-size-card" data-group-id="${e(group.id)}"><legend>Sizes and prices</legend>
        <input type="hidden" data-group-label value="${e(group.label)}"><input type="hidden" data-group-pricing value="size">
        <label>Size selector<select data-group-type><option value="select" ${group.type==='select'?'selected':''}>Dropdown</option><option value="radio" ${group.type==='radio'?'selected':''}>Radio buttons</option></select></label>
        <label class="admin-option-required"><input type="checkbox" data-group-required ${group.required?'checked':''}>Customer must choose a size</label>
        <div>${group.choices.map(choice=>`<div class="admin-option-choice admin-size-choice" data-choice-id="${e(choice.id)}"><input data-choice-label aria-label="Size name" maxlength="80" required placeholder="Example: Large" value="${e(choice.label)}"><button type="button" class="btn light" data-remove-size ${group.choices.length===1?'disabled':''}>Remove</button><label class="admin-choice-price">Size price (₱)<input data-choice-price aria-label="Size price" type="number" min="0" max="99999999.99" step="0.01" inputmode="decimal" required value="${e(choice.price??'')}"></label></div>`).join('')}</div>
        <button type="button" class="btn light" id="adminAddSize" ${group.choices.length>=20?'disabled':''}>Add size</button>
        <label>Default size<select data-group-default><option value="">No default</option>${group.choices.map((choice,index)=>`<option value="${e(choice.id)}" ${group.default===choice.id?'selected':''}>${escapeHtml(choice.label||'Size '+(index+1))}</option>`).join('')}</select></label>
        <p class="helper-text">The selected size sets the item price. Add-on charges are added afterward.</p></fieldset>`;
      rows.querySelector('#adminAddSize').onclick=()=>{changeSize(size=>size.choices.push({id:id('s'),label:'',price:''}));window.QUVO_WORKSPACE?.revealPanel(document.querySelector('#adminSizePriceRows .admin-size-choice:last-child'));};
      rows.querySelector('[data-group-required]').onchange=syncPricingMode;
      for(const row of rows.querySelectorAll('[data-choice-id]')){
        row.querySelector('[data-remove-size]').onclick=()=>changeSize(size=>{size.choices=size.choices.filter(choice=>choice.id!==row.dataset.choiceId);if(size.default===row.dataset.choiceId)size.default='';});
        row.querySelector('[data-choice-label]').oninput=()=>{const option=[...rows.querySelector('[data-group-default]').options].find(option=>option.value===row.dataset.choiceId);if(option)option.textContent=row.querySelector('[data-choice-label]').value||'Unnamed size';};
      }
    }
    root.querySelector('#adminUseSizePricing').onchange=event=>{
      const existing=rows.querySelector('[data-group-id]');if(existing)draft.sizeDraft=readCard(existing);
      const custom=[...document.querySelectorAll('#adminOptionGroups .admin-option-card')].map(readCard);
      draft.sizeEnabled=event.target.checked;
      if(draft.sizeEnabled&&custom.length>=10){draft.sizeEnabled=false;showToast('Remove an option group before enabling size prices. An item supports up to 10 groups including sizes.');}
      if(draft.sizeEnabled&&!draft.sizeDraft){const choices=[{id:id('s'),label:'Regular',price:document.getElementById('adminItemPrice').value},{id:id('s'),label:'Large',price:document.getElementById('adminItemPrice').value}];draft.sizeDraft={id:id('size'),label:'Size',type:'select',required:true,default:choices[0].id,pricing:'size',choices};}
      draft.optionGroups=[...(draft.sizeEnabled?[draft.sizeDraft]:[]),...custom];renderSizePricing(draft);renderGroups(draft.optionGroups);
    };
    syncPricingMode();
  }
  function changeSize(callback){capture();const draft=drafts.get(current);callback(draft.sizeDraft);draft.optionGroups=[draft.sizeDraft,...draft.optionGroups.filter(group=>group.pricing!=='size')];renderSizePricing(draft);renderGroups(draft.optionGroups);}
  function sizeCount(){return document.getElementById('adminUseSizePricing')?.checked?1:0;}
  function updateGroupLimit(){document.getElementById('adminAddOption').disabled=document.querySelectorAll('#adminOptionGroups .admin-option-card').length+sizeCount()>=10;}
  function renderGroups(groups){
    const root=document.getElementById('adminOptionGroups');
    const custom=groups.filter(group=>group.pricing!=='size');
    root.innerHTML=custom.length?custom.map((group,index)=>`<fieldset class="admin-option-card" data-group-id="${e(group.id)}"><legend>Option ${index+1}</legend>
      <label>Option name<input data-group-label maxlength="80" required placeholder="Example: Milk" value="${e(group.label)}"></label>
      <label>Customer control<select data-group-type><option value="select" ${group.type==='select'?'selected':''}>Dropdown</option><option value="radio" ${group.type==='radio'?'selected':''}>Radio buttons</option><option value="checkbox" ${group.type==='checkbox'?'selected':''}>Checkboxes (multiple choices)</option></select></label>
      <label>Choice pricing<select data-group-pricing><option value="included" ${!group.pricing||group.pricing==='included'?'selected':''}>Same price for all choices</option><option value="extra" ${group.pricing==='extra'?'selected':''}>Add an extra charge</option></select></label>
      <p class="helper-text">${group.pricing==='extra'?'Enter the extra charge per item for each selected choice. Use 0 for a free choice.':'These choices do not change the item price.'}${group.type==='checkbox'?' Customers can select multiple add-ons.':''}</p>
      <label class="admin-option-required"><input type="checkbox" data-group-required ${group.required?'checked':''}>${group.type==='checkbox'?'Customer must choose at least one':'Customer must choose'}</label>
      <div class="admin-option-choices">${group.choices.map(choice=>`<div class="admin-option-choice" data-choice-id="${e(choice.id)}"><input data-choice-label aria-label="Choice" maxlength="80" required placeholder="Example: Oat milk" value="${e(choice.label)}"><button class="btn light" type="button" data-remove-choice aria-label="Remove choice" ${group.choices.length===1?'disabled':''}>Remove</button>${['size','extra'].includes(group.pricing)?`<label class="admin-choice-price">${group.pricing==='size'?'Item price':'Extra charge'} (₱)<input data-choice-price type="number" min="0" max="99999999.99" step="0.01" inputmode="decimal" required aria-label="${group.pricing==='size'?'Price':'Extra charge'} for ${e(choice.label||'choice')}" value="${e(choice.price??'')}"></label>`:''}</div>`).join('')}</div>
      <button class="btn light" type="button" data-add-choice ${group.choices.length>=20?'disabled':''}>Add choice</button>
      <label>Default choice<select data-group-default><option value="">No default</option>${group.choices.map((choice,i)=>`<option value="${e(choice.id)}" ${group.default===choice.id?'selected':''}>${escapeHtml(choice.label||'Choice '+(i+1))}</option>`).join('')}</select></label>
      <button class="btn light" type="button" data-remove-group>Remove option</button></fieldset>`).join(''):'<p class="helper-text">No options. Customers can order this item without making a selection.</p>';
    for(const card of root.querySelectorAll('.admin-option-card')){
      card.querySelector('[data-add-choice]').onclick=()=>{
        const groupId=card.dataset.groupId;
        change(groups=>{const group=groups.find(group=>group.id===groupId);group.choices.push({id:id('c'),label:'',...(['size','extra'].includes(group.pricing)?{price:group.pricing==='size'?document.getElementById('adminItemPrice').value:'0.00'}:{})});});
        const updated=[...root.querySelectorAll('.admin-option-card')].find(group=>group.dataset.groupId===groupId);
        window.QUVO_WORKSPACE?.revealPanel(updated?.querySelector('.admin-option-choice:last-child'));
      };
      card.querySelector('[data-remove-group]').onclick=()=>change(groups=>groups.splice(groups.findIndex(group=>group.id===card.dataset.groupId),1));
      card.querySelector('[data-group-type]').onchange=()=>change(()=>{});
      card.querySelector('[data-group-pricing]').onchange=()=>change(groups=>{const group=groups.find(group=>group.id===card.dataset.groupId);for(const choice of group.choices)choice.price=group.pricing==='size'?document.getElementById('adminItemPrice').value:'0.00';});
      for(const row of card.querySelectorAll('[data-choice-id]')){
        row.querySelector('button').onclick=()=>change(groups=>{const group=groups.find(group=>group.id===card.dataset.groupId);group.choices=group.choices.filter(choice=>choice.id!==row.dataset.choiceId);if(group.default===row.dataset.choiceId)group.default='';});
        row.querySelector('[data-choice-label]').addEventListener('input',()=>{const option=[...card.querySelector('[data-group-default]').options].find(option=>option.value===row.dataset.choiceId);if(option)option.textContent=row.querySelector('[data-choice-label]').value||'Unnamed choice';});
      }
    }
    updateGroupLimit();
  }
  function change(callback){const groups=readGroups();callback(groups);drafts.get(current).optionGroups=groups;renderGroups(groups);}
  function mount(form,draft){
    renderSizePricing(draft);
    const options=document.createElement('section');options.className='admin-option-editor';
    options.innerHTML='<h3>Customer options and add-ons</h3><p class="helper-text">Add choices such as Milk or Add-ons. Use Checkboxes for multiple selections, or Dropdown and Radio buttons for a single selection. Configure sizes in the Pricing section above.</p><div id="adminOptionGroups"></div><button class="btn light" type="button" id="adminAddOption">Add option group</button>';
    const photo=document.createElement('section');photo.className='admin-photo-editor';
    photo.innerHTML='<h3>Menu photo</h3><div class="admin-photo-preview" id="adminPhotoPreview"></div><label>Add or replace photo<input id="adminItemPhoto" type="file" accept="image/*,.heic,.heif,.hif,.tif,.tiff"></label><p class="helper-text">JPG, PNG, WebP, GIF, AVIF, BMP, SVG, HEIC or TIFF, up to 25 MB. Photos are optimized automatically.</p><p class="helper-text" id="adminPhotoStatus" role="status"></p><button class="btn light" type="button" id="adminRemovePhoto">Remove photo</button>';
    const save=form.querySelector('button[type=submit]');form.insertBefore(photo,save);form.insertBefore(options,save);renderGroups(draft.optionGroups);
    const preview=photo.querySelector('#adminPhotoPreview'),status=photo.querySelector('#adminPhotoStatus');
    function photoNodes(){return document.getElementById('adminEditPanel')?.dataset.itemId===String(draft.id)?{preview:document.getElementById('adminPhotoPreview'),status:document.getElementById('adminPhotoStatus'),remove:document.getElementById('adminRemovePhoto'),save:document.querySelector('#adminEditPanel button[type=submit]')}:{preview,status,remove:photo.querySelector('#adminRemovePhoto'),save};}
    function setStatus(message){draft.photoStatus=message;photoNodes().status.textContent=message;}
    function renderPhoto(){const url=draft.imageChanged?draft.image:draft.imageUrl,nodes=photoNodes();nodes.preview.innerHTML=url?'<img class="menu-photo" src="'+e(url)+'" alt="Menu photo preview">':'<span>No photo selected</span>';nodes.remove.disabled=!url;}
    renderPhoto();
    status.textContent=draft.photoStatus||'';save.disabled=draft.imageBusy;
    photo.querySelector('#adminItemPhoto').addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file)return;
      const request=(draft.photoRequest||0)+1;draft.photoRequest=request;draft.imageBusy=true;setStatus('Preparing photo...');save.disabled=true;
      try{const image=await QuvoMenuPhoto.prepare(file);if(request===draft.photoRequest){draft.image=image;draft.imageChanged=true;renderPhoto();setStatus('Photo ready. Save changes to publish it.');}}
      catch(error){if(request===draft.photoRequest)setStatus(error.message);}
      finally{if(request===draft.photoRequest){draft.imageBusy=false;photoNodes().save.disabled=false;}event.target.value='';}
    });
    photo.querySelector('#adminRemovePhoto').onclick=()=>{draft.photoRequest=(draft.photoRequest||0)+1;draft.imageBusy=false;draft.image=null;draft.imageChanged=true;save.disabled=false;renderPhoto();setStatus('Save changes to remove the photo.');};
    options.querySelector('#adminAddOption').onclick=()=>{
      change(groups=>groups.push({id:id('g'),label:'',type:'select',required:true,default:'',choices:[{id:id('c'),label:''},{id:id('c'),label:''}]}));
      window.QUVO_WORKSPACE?.revealPanel(document.querySelector('#adminOptionGroups .admin-option-card:last-child'));
    };
  }
  function payload(itemId){const draft=drafts.get(itemId);if(!draft)throw Error('Choose a menu item first.');if(draft.imageBusy)throw Error('Wait until the photo is ready.');capture();return {price:itemPrice(draft.optionGroups),optionGroups:draft.optionGroups,checkboxOptionsSupported:true,...(draft.optionVersion?{optionVersion:draft.optionVersion}:{}),...(draft.imageChanged?{image:draft.image}:{})};}
  window.QuvoMenuEditor={capture,item,mount,payload,forget};
})();
