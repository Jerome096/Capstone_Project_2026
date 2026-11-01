(() => {
  'use strict';
  const api='../api/sales-audit/index.php', $=id=>document.getElementById(id), e=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const form=$('auditFilters'), money=v=>v===null?'Not recorded':new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(v||0));
  const time=v=>v?new Date(v.replace(' ','T')+'Z').toLocaleString('en-PH',{timeZone:'Asia/Manila'}):'—';
  let report=null,offset=0,request=0,draft=null,exportKey=null,loading=false;
  const uuid=()=>{if(typeof crypto.randomUUID==='function')return crypto.randomUUID();const a=crypto.getRandomValues(new Uint8Array(16));a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;const s=[...a].map(b=>b.toString(16).padStart(2,'0')).join('');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20);};
  const filters=()=>Object.fromEntries([...new FormData(form)].filter(([,v])=>v!==''));
  function notice(message,error=false){$('auditNotice').textContent=message;$('auditNotice').className=error?'error':'';}
  function busy(value){loading=value;$('auditExport').disabled=value||!report;$('auditPrevious').disabled=value||!offset;$('auditNext').disabled=value||!report||offset+25>=report.counts.orders;}
  async function post(input){const response=await fetch(api,{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(45000),headers:{'Content-Type':'application/json','X-CSRF-Token':window.QUVO_CSRF},body:JSON.stringify(input)});return response;}
  async function load(){
    const id=++request;report=null;exportKey=null;busy(true);$('auditStatus').textContent='Loading a consistent sales snapshot…';$('auditMetrics').replaceChildren();$('auditMethods').replaceChildren();
    for(const name of ['auditOrders','auditCash','auditDigital','auditExports','auditMethodEvents','auditCashOperations','auditCashOperations'])$(name).innerHTML='<tr><td colspan="9">Loading…</td></tr>';$('auditExceptions').replaceChildren();
    try{const response=await fetch(api+'?'+new URLSearchParams({...filters(),offset:String(offset)}),{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000)}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Could not load Sales Audit.');if(id!==request)return;report=data.report;form.elements.from.value=report.filters.from;form.elements.to.value=report.filters.to;render();}
    catch(error){if(id!==request)return;notice(error.message,true);$('auditStatus').textContent='Sales Audit could not load. Apply filters to retry.';for(const name of ['auditOrders','auditCash','auditDigital','auditExports','auditMethodEvents'])$(name).innerHTML='<tr><td colspan="9">No records loaded.</td></tr>';$('auditPopulation').textContent='';$('auditPage').textContent='';}
    finally{if(id===request)busy(false);}
  }
  function render(){
    const r=report,s=r.summary,chosen=form.elements.method.value;
    form.elements.method.innerHTML='<option value="all">All payment methods</option>'+r.methods.map(m=>'<option value="'+e(m.code)+'">'+e(m.label)+(Number(m.active)?'':' (inactive)')+'</option>').join('');form.elements.method.value=chosen||'all';
    $('auditStatus').textContent='Business dates '+r.filters.from+' to '+r.filters.to+' · Philippine time · Ledger cutoff '+time(r.window.cutoff)+' · '+r.counts.orders+' matching orders';
    $('auditMetrics').innerHTML=[['Confirmed collections',money(s.collections),s.paidOrders+' approved payments'],['Paid and served',money(s.paidServed),'Status at ledger cutoff'],['Paid / fulfillment review',money(s.awaitingFulfillment),'Check completion and accounting cutoff'],['Open review items',r.exceptions.filter(x=>x.reviewStatus==='open').length,r.exceptions.length+' total findings; amounts can overlap']].map(([label,value,note])=>'<article class="audit-metric"><span>'+e(label)+'</span><strong>'+e(value)+'</strong><small>'+e(note)+'</small></article>').join('');
    $('auditMethods').innerHTML=r.breakdown.map(b=>'<span>'+e(b.label)+' · '+e(money(b.amount))+' · '+e(b.count)+' payments</span>').join('');
    $('auditPopulation').textContent=r.counts.orders+' orders · '+r.counts.items+' item lines';
    $('auditOrders').innerHTML=r.orders.length?r.orders.map(o=>'<tr><td><strong>'+e(o.order_number)+'</strong><small>Payment ID: '+e(o.payment_id||'Unpaid')+'</small><small>EOD: '+e(o.closure_id||'Not closed')+'</small></td><td>'+e(o.business_date)+'<small>'+e(time(o.paid_at))+'</small></td><td>'+e(o.order_source)+'<small>'+e(o.audit_status)+' · '+e(o.status_basis)+'</small></td><td>'+e(o.method_label||'Unpaid')+'<small>'+e(o.payment_reference||'No reference')+'</small><small>Label: '+e(o.label_basis)+'</small></td><td class="audit-number">'+e(money(o.total_amount))+'</td><td class="audit-number">'+e(money(o.amount_applied))+'</td><td>'+e(o.approved_by||'—')+'</td><td>'+(o.payment_id&&o.payment_method!=='Cash'?'<button type="button" data-payment="'+e(o.payment_id)+'">Add / edit evidence</button>':'—')+'</td></tr>').join(''):'<tr><td colspan="8">No orders match these filters.</td></tr>';
    $('auditPage').textContent=r.counts.orders?'Showing '+(offset+1)+'–'+Math.min(offset+25,r.counts.orders)+' of '+r.counts.orders:'No orders';
    $('auditCash').innerHTML=r.cash.length?r.cash.map(c=>c.viaEod?'<tr><td>'+e(c.date)+'</td><td>'+e(money(c.collection))+'</td><td colspan=4>Counted through shared-drawer EOD; see the operation records below.</td><td><a href="index.php?screen=salesHistory">View closings</a></td></tr>':'<tr><td>'+e(c.date)+(c.comparable?'':'<small>Store-wide; filters differ</small>')+'</td><td>'+e(money(c.collection))+'</td><td>'+e(money(c.expected))+'</td><td>'+e(money(c.entry?.payload.counted??null))+'</td><td class="'+(Number(c.variance)<0?'audit-negative':'')+'">'+e(money(c.variance))+'</td><td>'+e(c.entry?.actor||'Not recorded')+'<small>'+e(c.entry?.payload.evidence||'')+'</small></td><td><button type="button" data-cash="'+e(c.date)+'">'+(c.entry?'Amend count':'Record count')+'</button></td></tr>').join(''):'<tr><td colspan="7">No cash sales or saved cash counts in this period.</td></tr>';
    $('auditDigital').innerHTML=r.digital.length?r.digital.map(d=>{const p=d.payload;return '<tr><td>'+(d.voided?'<strong>Voided evidence</strong><br>':'')+e(label(p.method))+'<small>'+e(p.account)+'</small></td><td>'+e(p.reference)+'<small>'+e(d.orderNumber||'Unmatched credit')+'</small></td>'+[p.gross,p.fee,p.settled,p.pending,d.grossDifference,d.settlementDifference].map(v=>'<td class="audit-number '+(Number(v)<0?'audit-negative':'')+'">'+e(v===null?'Unmatched':money(v))+'</td>').join('')+'<td><button type="button" data-provider="'+e(d.record_key)+'">Amend evidence</button></td></tr>';}).join(''):'<tr><td colspan="9">No provider evidence saved. Record verified credits, including unmatched credits.</td></tr>';
    $('auditCashOperations').innerHTML=(r.cashOperations||[]).length?r.cashOperations.map(o=>'<tr><td>OP-'+e(o.operationId)+'<small>'+e(o.businessDate)+'</small></td>'+['openingCash','cashSales','expectedCash','actualCash','cashDifference'].map(k=>'<td class="audit-number">'+e(money(o[k]))+'</td>').join('')+'<td>'+e(o.cashStatus)+'</td><td>'+e(o.closedBy)+'<small>'+e(time(o.closedAt))+'</small></td></tr>').join(''):'<tr><td colspan="8">No closed drawer operations in these opening business dates. Existing legacy counts remain above.</td></tr>';
    $('auditExceptionCount').textContent=r.exceptions.length+' findings';
    $('auditExceptions').innerHTML=r.exceptions.length?r.exceptions.map(x=>'<article class="audit-exception"><div><span class="audit-review-state '+(x.reviewStatus==='reviewed'?'reviewed':'')+'">'+e(x.reviewStatus)+'</span><p><strong>'+e(x.label)+'</strong> · '+e(money(x.amount))+'</p><small>'+e(x.date)+' · '+e(x.record)+'</small><p>'+e(x.detail)+'</p>'+(x.review?'<small>Latest review: '+e(x.review.actor)+' · '+e(x.review.payload.note)+'</small>':'')+'</div><button type="button" data-review="'+e(x.id)+'">Record review</button></article>').join(''):'<p class="audit-empty">No automatic exceptions for this population. This does not establish completeness of all café sales.</p>';
    $('auditExports').innerHTML=r.exports.length?r.exports.map(x=>{const f=JSON.parse(x.filters_json);return '<tr><td>'+e(x.id)+'<span class="audit-hash">SHA-256: '+e(x.file_hash)+'</span></td><td>'+e(f.from)+' – '+e(f.to)+'<small>'+e(f.method)+' · '+e(f.source)+' · '+e(f.search||'No search filter')+'</small></td><td>'+e(x.actor)+'<small>'+e(time(x.created_at))+'</small></td><td><a class="audit-download" href="'+api+'?download='+encodeURIComponent(x.id)+'">Download Excel</a></td></tr>';}).join(''):'<tr><td colspan="4">No saved exports yet. Use Export Excel to create one.</td></tr>';
    $('auditCautions').innerHTML=r.cautions.map(note=>'<p>'+e(note)+'</p>').join('');
    $('auditMethodEvents').innerHTML=r.methodEvents.length?r.methodEvents.map(x=>'<tr><td>'+e(x.method_label)+'<small>'+e(x.method_code)+'</small></td><td>'+e(x.action)+'</td><td>'+e(x.qr_version||'—')+'</td><td>'+e(x.actor)+'</td><td>'+e(time(x.occurred_at))+'</td></tr>').join(''):'<tr><td colspan="5">No payment-method changes were recorded in this period. Tracking starts when Sales Audit is installed.</td></tr>';
  }
  function label(code){return report?.methods.find(m=>m.code===code)?.label||code;}
  function field(name,text,value='',type='text',extra=''){return '<label>'+e(text)+'<input name="'+name+'" type="'+type+'" value="'+e(value)+'" '+extra+' required></label>';}
  function amount(name,text,value='0.00'){return field(name,text,value,'number','min="0" max="9999999999.99" step="0.01" inputmode="decimal"');}
  function openEntry(type,entry=null,order=null,finding=null,date=null){
    if(!report)return;const p=entry?.payload||{};draft={type,revision:Number(entry?.revision||0),requestKey:uuid(),finding};
    const businessDate=p.date||date||order?.business_date||report.filters.from;
    let html=field('date','Business date',businessDate,'date');
    if(type==='cash'){
      $('auditEntryTitle').textContent=entry?'Amend cash reconciliation':'Record cash reconciliation';
      html+=amount('opening','Opening float PHP',p.opening)+amount('cashIn','Other authorized cash in PHP',p.cashIn)+amount('cashOut','Other authorized cash out PHP',p.cashOut)+amount('drops','Cash drops / bank deposits PHP',p.drops)+amount('counted','Physical closing cash PHP',p.counted);
      html+='<p class="audit-entry-meta">Covers all cash sales and cashiers for this business day. Record a physical count; do not enter the expected balance as an assumed count.</p>';
    }else if(type==='provider'){
      $('auditEntryTitle').textContent=entry?'Amend provider evidence':'Record verified provider credit';
      html+='<label>Payment method<select name="method" required>'+report.methods.filter(m=>m.code!=='Cash').map(m=>'<option value="'+e(m.code)+'" '+((p.method||order?.payment_method)===m.code?'selected':'')+'>'+e(m.label)+(Number(m.active)?'':' (inactive)')+'</option>').join('')+'</select></label>';
      html+=field('account','Merchant account identifier',p.account||'','text','maxlength="100"')+field('reference','Verified provider reference',p.reference||order?.payment_reference||'','text','maxlength="100"');
      html+='<label>Linked payment ID (optional)<input name="paymentId" type="number" min="1" step="1" value="'+e(p.paymentId||order?.payment_id||'')+'" placeholder="Leave blank for an unmatched credit"></label>';
      html+=amount('gross','Provider gross PHP',p.gross||order?.amount_applied||'0.00')+amount('fee','Provider fee PHP',p.fee)+amount('settled','Net already settled PHP',p.settled)+amount('pending','Net pending transfer PHP',p.pending);
      if(entry)html+='<label class="audit-check audit-form-wide"><input type="checkbox" name="void" '+(p.void?'checked':'')+'>Void this evidence entry (history is retained)</label>';
      html+='<p class="audit-entry-meta">Use the payment business date for linked credits. Put a later bank-settlement date in the evidence reference. The method, merchant account, reference and business date identify this record and remain fixed on amendment.</p>';
    }else{
      $('auditEntryTitle').textContent='Record exception review';html+='<label>Review status<select name="status"><option value="reviewed">Reviewed with explanation</option><option value="open">Keep open</option></select></label><p class="audit-entry-meta">'+e(finding.label)+' · '+e(finding.record)+'. A review does not delete the finding or change a payment.</p>';
    }
    html+=field('evidence','Evidence reference / statement, count sheet or document ID',p.evidence||'','text','maxlength="300"')+'<label>Explanation / reason for this revision<textarea name="note" maxlength="1000" required>'+e(p.note||'')+'</textarea></label>';
    if(entry)html+='<p class="audit-entry-meta">Latest revision '+e(entry.revision)+' · '+e(entry.actor)+' · '+e(time(entry.created_at))+'. Saving adds a new revision.</p>';
    $('auditEntryFields').innerHTML=html;$('auditEntryError').textContent='';
    if(type==='cash'&&entry)$('auditEntryForm').elements.date.readOnly=true;
    if(type==='provider'&&entry)for(const name of ['date','method','account','reference'])$('auditEntryForm').elements[name].disabled=true;
    if(type==='review')$('auditEntryForm').elements.date.readOnly=true;
    $('auditEntryDialog').showModal();
  }
  form.addEventListener('submit',event=>{event.preventDefault();offset=0;notice('');load();});
  form.addEventListener('input',()=>{if(loading){request++;loading=false;} $('auditExport').disabled=true;$('auditPrevious').disabled=true;$('auditNext').disabled=true;exportKey=null;notice('Filters changed. Apply filters before exporting.');});
  $('auditPrevious').addEventListener('click',()=>{offset=Math.max(0,offset-25);load();});$('auditNext').addEventListener('click',()=>{offset+=25;load();});
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.querySelectorAll('[data-panel]').forEach(p=>p.hidden=p.dataset.panel!==button.dataset.tab);}));
  $('auditAddCash').addEventListener('click',()=>{const date=report?.filters.from;openEntry('cash',report?.cash.find(c=>c.date===date)?.entry,null,null,date);});
  $('auditAddProvider').addEventListener('click',()=>openEntry('provider'));
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||!report)return;
    if(button.dataset.cash){const c=report.cash.find(c=>c.date===button.dataset.cash);openEntry('cash',c.entry,null,null,c.date);}
    if(button.dataset.provider)openEntry('provider',report.digital.find(d=>d.record_key===button.dataset.provider));
    if(button.dataset.payment){const o=report.orders.find(o=>o.payment_id===button.dataset.payment),d=report.digital.find(d=>String(d.payload.paymentId)===o.payment_id);openEntry('provider',d||null,o);}
    if(button.dataset.review){const finding=report.exceptions.find(e=>e.id===button.dataset.review);openEntry('review',finding.review,null,finding,finding.date);}
  });
  $('auditEntryForm').addEventListener('input',()=>{if(draft)draft.requestKey=uuid();});
  $('auditEntryForm').addEventListener('submit',async event=>{
    event.preventDefault();if(!draft)return;const input=Object.fromEntries(new FormData(event.target));let payload={...input};
    if(draft.type==='cash')payload.refunds='0.00';
    if(draft.type==='provider'){payload.void=event.target.elements.void?.checked||false;for(const name of ['date','method','account','reference'])payload[name]=event.target.elements[name].value;}
    if(draft.type==='review')payload={...payload,exceptionId:draft.finding.id,fingerprint:draft.finding.fingerprint};
    $('auditEntrySave').disabled=true;$('auditEntryError').textContent='';
    try{const response=await post({action:'save',type:draft.type,payload,revision:draft.revision,requestKey:draft.requestKey}),data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Evidence could not be saved.');$('auditEntryDialog').close();draft=null;notice('Audit evidence saved. Previous revisions are retained.');await load();}
    catch(error){$('auditEntryError').textContent=error.message;}finally{$('auditEntrySave').disabled=false;}
  });
  $('auditExport').addEventListener('click',async()=>{
    if(!report||loading)return;exportKey??=uuid();$('auditExport').disabled=true;notice('Building the complete filtered workbook…');
    try{const response=await post({action:'export',...report.filters,requestKey:exportKey});if(!response.ok){const data=await response.json();throw Error(data.error||'Export failed.');}const blob=await response.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Quvo-Sales-Audit-'+response.headers.get('X-Export-Id')+'.xlsx';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notice('Excel exported and saved. You can download the same file again from Saved exports.');await load();}
    catch(error){notice(error.message,true);}finally{$('auditExport').disabled=!report;}
  });
  load();
})();
