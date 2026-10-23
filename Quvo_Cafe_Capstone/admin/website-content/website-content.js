(() => {
  'use strict';
  const fields={headline:'siteHeadline',accent:'siteAccent',intro:'siteIntro',story:'siteStory',address:'siteAddress',hours:'siteHours',phone:'sitePhone',email:'siteEmail',social:'siteSocial'};
  let version=null,dirty=false,busy=false,saved=null,bound=false;
  const node=id=>document.getElementById(id);
  const read=()=>Object.fromEntries(Object.entries(fields).map(([key,id])=>[key,node(id).value.trim()]));
  function controls(){node('saveWebsiteContent').disabled=busy||!version||!dirty;node('reloadWebsiteContent').disabled=busy;node('previewWebsiteContent').disabled=busy||!version;}
  function fill(data){for(const [key,id] of Object.entries(fields))node(id).value=data[key]||'';dirty=false;node('websiteContentDraft').textContent='Saved content';node('websiteContentDraft').classList.remove('dirty');controls();}
  async function api(input){
    const response=await fetch(quvoPath('api/website-content/index.php'),{method:input?'POST':'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF||''},...(input?{body:JSON.stringify(input)}:{})});
    let data;try{data=await response.json();}catch{throw Error('Website content could not connect. Please try again.');}
    if(!response.ok||!data.ok){const error=Error(data.error||'Website content could not be saved.');error.code=data.code;throw error;}return data;
  }
  async function load(force=false){
    if(busy||(dirty&&!force))return;
    busy=true;controls();node('websiteContentStatus').textContent='Loading website content…';node('websiteContentError').textContent='';
    try{const data=await api();version=data.version;saved=data.content;fill(saved);node('websiteContentStatus').textContent=data.setupRequired?'Website content storage is not ready. Complete the website update before saving.':'Changes saved here appear on the customer About page.';}
    catch(error){node('websiteContentError').textContent=error.message;node('websiteContentStatus').textContent='Website content is unavailable.';}
    finally{busy=false;controls();}
  }
  function preview(){
    if(!node('websiteContentForm').reportValidity())return;const data=read();
    node('websitePreviewTitle').textContent=[data.headline,data.accent].filter(Boolean).join('\n');node('websitePreviewIntro').textContent=data.intro;
    node('websitePreviewStory').replaceChildren(...data.story.split(/\n\s*\n/).filter(Boolean).map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
    node('websitePreviewDetails').textContent=[data.address,data.hours,data.phone,data.email,data.social].filter(Boolean).join('\n\n');node('websiteContentPreview').showModal();
  }
  function bind(){
    if(bound)return;bound=true;controls();
    node('websiteContentForm').addEventListener('input',()=>{dirty=true;node('websiteContentDraft').textContent='Unsaved changes';node('websiteContentDraft').classList.add('dirty');controls();});
    node('websiteContentForm').addEventListener('submit',async event=>{
      event.preventDefault();if(busy||!version||!dirty||!event.currentTarget.reportValidity())return;
      const draft=read();busy=true;controls();node('websiteContentError').textContent='';
      try{const data=await api({action:'save',version,content:draft});version=data.version;saved=data.content;fill(saved);node('websiteContentStatus').textContent='About page updated for customers.';showToast('Website content saved.');}
      catch(error){node('websiteContentError').textContent=error.message;node('websiteContentStatus').textContent=error.code==='content_changed'?'Your unsaved draft is kept. Reload the current saved page when you are ready.':'Your changes were not saved. Please try again.';}
      finally{busy=false;controls();}
    });
    node('reloadWebsiteContent').addEventListener('click',()=>{if(!dirty||window.confirm('Discard unsaved About changes and reload the saved page?'))load(true);});
    node('previewWebsiteContent').addEventListener('click',preview);node('closeWebsitePreview').addEventListener('click',()=>node('websiteContentPreview').close());
  }
  window.QuvoWebsiteContent={bind,load};
})();
