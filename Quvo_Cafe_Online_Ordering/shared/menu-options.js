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
  const mode=group=>group.pricing||'included';
  const cents=value=>Math.round(Number(value||0)*100);
  const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value));
  const hasPricing=item=>groups(item).some(group=>['size','extra'].includes(mode(group)));
  function priceCents(item,selected={}){
    let base=cents(item?.price),extra=0;
    for(const group of groups(item)){
      const value=Object.hasOwn(selected,group.id)?selected[group.id]:(group.default||'');
      const chosen=group.type==='checkbox'?(Array.isArray(value)?value:value?[value]:[]):[value];
      for(const choice of group.choices.filter(choice=>chosen.includes(choice.id))){
        if(mode(group)==='size')base=cents(choice.price);
        if(mode(group)==='extra')extra+=cents(choice.price);
      }
    }
    return base+extra;
  }
  const price=(item,selected={})=>priceCents(item,selected)/100;
  function startingPrice(item){
    let base=cents(item.price),extra=0;
    for(const group of groups(item)){
      if(!['size','extra'].includes(mode(group)))continue;
      const lowest=Math.min(...group.choices.map(choice=>cents(choice.price)));
      if(mode(group)==='size')base=group.required?lowest:Math.min(base,lowest);
      else extra+=group.required?lowest:0;
    }
    return (base+extra)/100;
  }
  const priceLabel=item=>(hasPricing(item)?'From ':'')+money(startingPrice(item));
  function choiceLabel(group,choice){
    return choice.label+(mode(group)==='size'?' ('+money(choice.price)+')':mode(group)==='extra'&&cents(choice.price)>0?' (+'+money(choice.price)+')':'');
  }
  function render(root,item,selected={}){
    root.replaceChildren();
    if(root.tagName==='FIELDSET'){const legend=document.createElement('legend');legend.textContent='Customize your item';root.append(legend);}
    for(const group of groups(item)){
      const field=document.createElement('fieldset');field.className='menu-option-field';
      const legend=document.createElement('legend');legend.textContent=group.label+(group.required?' (required)':' (optional)');field.append(legend);
      const value=Object.hasOwn(selected,group.id)?selected[group.id]:(group.default||'');
      if(group.type==='checkbox'){
        const choices=document.createElement('div');choices.className='menu-radio-choices menu-checkbox-choices';
        field.dataset.menuCheckboxGroup=group.id;field.dataset.checkboxRequired=String(group.required);field.dataset.checkboxLabel=group.label;
        const chosen=Array.isArray(value)?value:value?[value]:[];
        for(const option of group.choices){const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.name=root.id+'-'+group.id+'[]';input.value=option.id;input.dataset.menuOption=group.id;input.checked=chosen.includes(option.id);label.append(input,document.createTextNode(choiceLabel(group,option)));choices.append(label);}
        field.append(choices);
      }else if(group.type==='radio'){
        const choices=document.createElement('div');choices.className='menu-radio-choices';
        const options=group.required?group.choices:[{id:'',label:'No preference'},...group.choices];
        for(const option of options){const label=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=root.id+'-'+group.id;input.value=option.id;input.dataset.menuOption=group.id;input.checked=option.id===value;input.required=group.required;label.append(input,document.createTextNode(option.id?choiceLabel(group,option):option.label));choices.append(label);}
        field.append(choices);
      }else{
        const select=document.createElement('select');select.dataset.menuOption=group.id;select.name=root.id+'-'+group.id;select.required=group.required;select.setAttribute('aria-label',group.label);
        if(group.id==='sugar-level')select.id='sugarLevel';if(group.id==='ice-level')select.id='iceLevel';
        select.add(new Option(group.required?'Choose '+group.label:'No preference',''));
        for(const option of group.choices)select.add(new Option(choiceLabel(group,option),option.id));
        select.value=value;field.append(select);
      }
      root.append(field);
    }
    let total=null;
    if(hasPricing(item)){total=document.createElement('p');total.className='menu-option-price';total.setAttribute('role','status');total.setAttribute('aria-live','polite');root.append(total);}
    const update=()=>{checkboxValidity(root);if(total)total.textContent='Item price: '+money(price(item,values(root)))+' each';};root.onchange=update;update();
  }
  function values(root){
    const result=Object.create(null);
    for(const input of root.querySelectorAll('[data-menu-option]')){
      const id=input.dataset.menuOption;
      if(input.type==='checkbox'){if(!result[id])result[id]=[];if(input.checked)result[id].push(input.value);}
      else if(input.type!=='radio'||input.checked)result[id]=input.value;
    }
    return result;
  }
  function read(root,item){const options=values(root);return {options,optionsVersion:item.optionVersion||'',optionLabels:groups(item).flatMap(group=>{const selected=group.type==='checkbox'?(options[group.id]||[]):[options[group.id]];return group.choices.filter(choice=>selected.includes(choice.id)).map(choice=>({label:group.label,value:choice.label,...(mode(group)!=='included'?{pricing:mode(group),price:choice.price}:{})}));})};}
  function checkboxValidity(root){for(const field of root.querySelectorAll('[data-menu-checkbox-group]')){const first=field.querySelector('input[type=checkbox]');if(first)first.setCustomValidity(field.dataset.checkboxRequired==='true'&&!field.querySelector('input:checked')?'Choose at least one '+field.dataset.checkboxLabel+'.':'');}}
  function valid(root){checkboxValidity(root);for(const input of root.querySelectorAll('input,select'))if(!input.checkValidity()){input.reportValidity();return false;}return true;}
  function savedSelections(item,custom){
    if(Array.isArray(custom?.options)){const result={};for(const option of custom.options){if(groups(item).find(group=>group.id===option.id)?.type==='checkbox'){if(!result[option.id])result[option.id]=[];result[option.id].push(option.choiceId);}else result[option.id]=option.choiceId;}return result;}
    if(custom?.options&&typeof custom.options==='object')return custom.options;
    const result={};for(const group of groups(item)){const old=group.id==='sugar-level'?custom?.sugarLevel:group.id==='ice-level'?custom?.iceLevel:null;const choice=group.choices.find(option=>option.label===old);if(choice)result[group.id]=choice.id;}
    return result;
  }
  function summary(custom){
    const snapshots=Array.isArray(custom?.options)?custom.options:custom?.optionLabels;
    if(Array.isArray(snapshots))return snapshots.map(option=>option.label+': '+choiceLabel({pricing:option.pricing},{label:option.value,price:option.price}));
    return [custom?.size,custom?.sugarLevel,custom?.iceLevel].filter(value=>value&&value!=='Not applicable');
  }
  function photoHTML(item){return item?.imageUrl?'<img class="menu-photo" data-menu-photo src="'+escape(item.imageUrl)+'" alt="'+escape(item.name)+'" loading="lazy" decoding="async">':escape(item?.icon||'\u2615');}
  function bindPhotos(root=document){for(const image of root.querySelectorAll('img[data-menu-photo]'))image.addEventListener('error',()=>image.replaceWith(document.createTextNode('\u2615')),{once:true});}
  function photo(root,item){root.innerHTML=photoHTML(item);bindPhotos(root);}
  window.QuvoMenuOptions={defaults,groups,render,read,values,valid,savedSelections,summary,photoHTML,photo,bindPhotos,hasPricing,price,priceCents,startingPrice,priceLabel,formatPrice:money};
})();
