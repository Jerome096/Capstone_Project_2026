(() => {
  'use strict';
  const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  function defaults(category){
    if(!['coffee','non-coffee'].includes(String(category).toLowerCase()))return [];
    return [
      {id:'sugar-level',label:'Sugar level',type:'select',required:true,default:'sugar-100',choices:[100,75,50,25,0].map(n=>({id:'sugar-'+n,label:n+'%'}))},
      {id:'ice-level',label:'Ice level',type:'select',required:true,default:'ice-regular',choices:[{id:'ice-regular',label:'Regular ice'},{id:'ice-less',label:'Less ice'},{id:'ice-none',label:'No ice'},{id:'ice-hot',label:'Hot'}]},
    ];
  }
  const groups=item=>Array.isArray(item?.optionGroups)?item.optionGroups:defaults(item?.category);
  function render(root,item,selected={}){
    root.replaceChildren();
    if(root.tagName==='FIELDSET'){const legend=document.createElement('legend');legend.textContent='Customize your item';root.append(legend);}
    for(const group of groups(item)){
      const field=document.createElement('fieldset');field.className='menu-option-field';
      const legend=document.createElement('legend');legend.textContent=group.label+(group.required?' (required)':' (optional)');field.append(legend);
      const value=Object.hasOwn(selected,group.id)?selected[group.id]:(group.default||'');
      if(group.type==='radio'){
        const choices=document.createElement('div');choices.className='menu-radio-choices';
        const options=group.required?group.choices:[{id:'',label:'No preference'},...group.choices];
        for(const option of options){const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=root.id+'-'+group.id;input.value=option.id;input.dataset.menuOption=group.id;input.checked=option.id===value;input.required=group.required;label.append(input,document.createTextNode(option.label));choices.append(label);}
        field.append(choices);
      }else{
        const select=document.createElement('select');select.dataset.menuOption=group.id;select.name=root.id+'-'+group.id;select.required=group.required;select.setAttribute('aria-label',group.label);
        if(group.id==='sugar-level')select.id='sugarLevel';if(group.id==='ice-level')select.id='iceLevel';
        select.add(new Option(group.required?'Choose '+group.label:'No preference',''));
        for(const option of group.choices)select.add(new Option(option.label,option.id));
        select.value=value;field.append(select);
      }
      root.append(field);
    }
  }
  function values(root){
    const result=Object.create(null);for(const input of root.querySelectorAll('[data-menu-option]'))if(input.type!=='radio'||input.checked)result[input.dataset.menuOption]=input.value;
    return result;
  }
  function read(root,item){const options=values(root);return {options,optionsVersion:item.optionVersion||'',optionLabels:groups(item).flatMap(group=>{const choice=group.choices.find(option=>option.id===options[group.id]);return choice?[{label:group.label,value:choice.label}]:[];})};}
  function valid(root){for(const input of root.querySelectorAll('input,select'))if(!input.checkValidity()){input.reportValidity();return false;}return true;}
  function savedSelections(item,custom){
    if(Array.isArray(custom?.options))return Object.fromEntries(custom.options.map(option=>[option.id,option.choiceId]));
    if(custom?.options&&typeof custom.options==='object')return custom.options;
    const result={};for(const group of groups(item)){const old=group.id==='sugar-level'?custom?.sugarLevel:group.id==='ice-level'?custom?.iceLevel:null;const choice=group.choices.find(option=>option.label===old);if(choice)result[group.id]=choice.id;}
    return result;
  }
  function summary(custom){
    const snapshots=Array.isArray(custom?.options)?custom.options:custom?.optionLabels;
    if(Array.isArray(snapshots))return snapshots.map(option=>option.label+': '+option.value);
    return [custom?.size,custom?.sugarLevel,custom?.iceLevel].filter(value=>value&&value!=='Not applicable');
  }
  function photoHTML(item){return item?.imageUrl?'<img class="menu-photo" data-menu-photo src="'+escape(item.imageUrl)+'" alt="'+escape(item.name)+'" loading="lazy" decoding="async">':escape(item?.icon||'\u2615');}
  function bindPhotos(root=document){for(const image of root.querySelectorAll('img[data-menu-photo]'))image.addEventListener('error',()=>image.replaceWith(document.createTextNode('\u2615')),{once:true});}
  function photo(root,item){root.innerHTML=photoHTML(item);bindPhotos(root);}
  window.QuvoMenuOptions={defaults,groups,render,read,values,valid,savedSelections,summary,photoHTML,photo,bindPhotos};
})();
