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
  }
  function item(item){capture();current=item.id;if(!drafts.has(item.id))drafts.set(item.id,{...structuredClone(item),optionGroups:structuredClone(QuvoMenuOptions.groups(item)),imageChanged:false,imageBusy:false});return drafts.get(item.id);}
  function forget(itemId){drafts.delete(itemId);if(current===itemId)current=null;}
  function readGroups(){
    const root=document.getElementById('adminOptionGroups');if(!root)return drafts.get(current)?.optionGroups||[];
    return [...root.querySelectorAll('.admin-option-card')].map(card=>({id:card.dataset.groupId,label:card.querySelector('[data-group-label]').value.trim(),type:card.querySelector('[data-group-type]').value,required:card.querySelector('[data-group-required]').checked,default:card.querySelector('[data-group-default]').value,choices:[...card.querySelectorAll('[data-choice-id]')].map(row=>({id:row.dataset.choiceId,label:row.querySelector('input').value.trim()}))}));
  }
  function renderGroups(groups){
    const root=document.getElementById('adminOptionGroups');
    root.innerHTML=groups.length?groups.map((group,index)=>`<fieldset class="admin-option-card" data-group-id="${e(group.id)}"><legend>Option ${index+1}</legend>
      <label>Option name<input data-group-label maxlength="80" required placeholder="Example: Milk" value="${e(group.label)}"></label>
      <label>Customer control<select data-group-type><option value="select" ${group.type==='select'?'selected':''}>Dropdown</option><option value="radio" ${group.type==='radio'?'selected':''}>Radio buttons</option></select></label>
      <label class="admin-option-required"><input type="checkbox" data-group-required ${group.required?'checked':''}>Customer must choose</label>
      <div class="admin-option-choices">${group.choices.map(choice=>`<div class="admin-option-choice" data-choice-id="${e(choice.id)}"><input aria-label="Choice" maxlength="80" required placeholder="Example: Oat milk" value="${e(choice.label)}"><button class="btn light" type="button" data-remove-choice aria-label="Remove choice" ${group.choices.length===1?'disabled':''}>Remove</button></div>`).join('')}</div>
      <button class="btn light" type="button" data-add-choice ${group.choices.length>=20?'disabled':''}>Add choice</button>
      <label>Default choice<select data-group-default><option value="">No default</option>${group.choices.map((choice,i)=>`<option value="${e(choice.id)}" ${group.default===choice.id?'selected':''}>${escapeHtml(choice.label||'Choice '+(i+1))}</option>`).join('')}</select></label>
      <button class="btn light" type="button" data-remove-group>Remove option</button></fieldset>`).join(''):'<p class="helper-text">No options. Customers can order this item without making a selection.</p>';
    for(const card of root.querySelectorAll('.admin-option-card')){
      card.querySelector('[data-add-choice]').onclick=()=>change(groups=>{groups.find(group=>group.id===card.dataset.groupId).choices.push({id:id('c'),label:''});});
      card.querySelector('[data-remove-group]').onclick=()=>change(groups=>groups.splice(groups.findIndex(group=>group.id===card.dataset.groupId),1));
      for(const row of card.querySelectorAll('[data-choice-id]')){
        row.querySelector('button').onclick=()=>change(groups=>{const group=groups.find(group=>group.id===card.dataset.groupId);group.choices=group.choices.filter(choice=>choice.id!==row.dataset.choiceId);if(group.default===row.dataset.choiceId)group.default='';});
        row.querySelector('input').addEventListener('input',()=>{const option=[...card.querySelector('[data-group-default]').options].find(option=>option.value===row.dataset.choiceId);if(option)option.textContent=row.querySelector('input').value||'Unnamed choice';});
      }
    }
    document.getElementById('adminAddOption').disabled=groups.length>=10;
  }
  function change(callback){const groups=readGroups();callback(groups);drafts.get(current).optionGroups=groups;renderGroups(groups);}
  function mount(form,draft){
    const options=document.createElement('section');options.className='admin-option-editor';
    options.innerHTML='<h3>Customer options</h3><p class="helper-text">Add a group such as Milk or Serving type, then add its choices. Choices use the item\'s listed price.</p><div id="adminOptionGroups"></div><button class="btn light" type="button" id="adminAddOption">Add option group</button>';
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
    options.querySelector('#adminAddOption').onclick=()=>change(groups=>groups.push({id:id('g'),label:'',type:'select',required:true,default:'',choices:[{id:id('c'),label:''},{id:id('c'),label:''}]}));
  }
  function payload(itemId){const draft=drafts.get(itemId);if(!draft)throw Error('Choose a menu item first.');if(draft.imageBusy)throw Error('Wait until the photo is ready.');capture();return {optionGroups:draft.optionGroups,...(draft.imageChanged?{image:draft.image}:{})};}
  window.QuvoMenuEditor={capture,item,mount,payload,forget};
})();
