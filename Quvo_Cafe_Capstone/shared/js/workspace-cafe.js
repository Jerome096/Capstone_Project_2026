/* Presentation only: all figures, orders and visit clocks retain their server sources. */
(() => {
  'use strict';
  const e = value => escapeHtml(String(value ?? ''));
  const money = value => new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value)||0);
  function initShell() {
    const main=document.querySelector('body.quvo-cafe-ui > .main'),topbar=main?.querySelector('.topbar');
    if(!main||!topbar)return;
    const copy=document.getElementById('screenTitle')?.parentElement;
    if(!copy)return;
    const heading=document.createElement('section');heading.className='cafe-page-heading';
    heading.setAttribute('aria-labelledby','screenTitle');heading.append(copy);topbar.after(heading);
    const breadcrumb=document.createElement('div');breadcrumb.className='cafe-breadcrumb';
    breadcrumb.innerHTML='<span>'+ (window.QUVO_CONFIG?.portal==='admin'?'Administration':'Operations') +'</span><span aria-hidden="true">/</span><span class="cafe-breadcrumb-current"></span>';
    const toggle=topbar.querySelector('.workspace-menu-toggle');
    if(toggle)toggle.after(breadcrumb);else topbar.prepend(breadcrumb);
    const update=()=>{
      const active=document.querySelector('.sidebar .nav-item.active');
      breadcrumb.lastElementChild.textContent=active?.querySelector('span')?.textContent||'Workspace';
    };
    const nav=document.querySelector('.sidebar .nav');
    if(nav)new MutationObserver(update).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
    update();
    const footer=document.createElement('footer');footer.className='cafe-workspace-footer';
    footer.innerHTML='<span>Quvo Café</span><span>Good coffee. Better company.</span>';main.append(footer);
  }
  function renderReportOverview(model) {
    const metrics=document.getElementById('cafeReportMetrics'),chart=document.getElementById('cafeReportChart'),favorites=document.getElementById('cafeReportFavorites');
    if(!metrics||!chart||!favorites)return;
    const data=model.data,s=data?.summary;
    const entries=[['Total sales','totalRevenue',true,'Approved payments in this period'],['Paid orders','paidOrders',false,'Across dine-in, online and counter'],['Average paid order','averageOrderValue',true,'Revenue divided by paid orders'],['Completed orders','completedOrders',false,'Paid orders marked served']];
    metrics.innerHTML=entries.map(([label,key,currency,note])=>{
      const value=!s?'—':currency?money(s[key]):new Intl.NumberFormat('en-PH').format(Number(s[key])||0);
      return '<article class="cafe-report-metric"><label>'+label+'</label><strong'+(value.length>11?' data-wide-value':'')+'>'+e(value)+'</strong><small>'+(!s?model.loading?'Loading report…':'No report loaded':note)+'</small></article>';
    }).join('');
    if(!data){
      chart.innerHTML=favorites.innerHTML='<p class="cafe-empty">'+e(model.loading?'Loading saved report…':model.error?'Report unavailable. Use Refresh to retry.':'Choose a period to view sales.')+'</p>';return;
    }
    const activity=(data.activity||[]).map(row=>({value:Math.max(0,Number(row.revenue)||0),label:String(row.label||row.bucket||'')}));
    if(!activity.length||!activity.some(row=>row.value>0))chart.innerHTML='<p class="cafe-empty">No paid sales recorded for this period.</p>';
    else {
      const max=Math.max(1,...activity.map(row=>row.value)),left=68,right=570,top=25,bottom=190;
      const point=(row,i)=>[left+(right-left)*(activity.length===1?.5:i/(activity.length-1)),bottom-(bottom-top)*row.value/max];
      const points=activity.map(point),line=points.map(([x,y])=>x.toFixed(2)+','+y.toFixed(2)).join(' ');
      const ticks=[0,.5,1].map(fraction=>{const y=bottom-(bottom-top)*fraction;return '<path d="M'+left+' '+y+'H'+right+'" stroke="#e4e7dc" stroke-dasharray="3 5"/><text x="1" y="'+(y+4)+'">'+e(new Intl.NumberFormat('en-PH',{notation:'compact',maximumFractionDigits:1}).format(max*fraction))+'</text>';}).join('');
      const labels=[...new Set([0,Math.floor((activity.length-1)/2),activity.length-1])].map(i=>'<text x="'+point(activity[i],i)[0]+'" y="218" text-anchor="middle">'+e(activity[i].label)+'</text>').join('');
      chart.innerHTML='<svg class="cafe-report-chart" viewBox="0 0 600 235" role="img" aria-label="Paid revenue by time block, in Philippine pesos. Full values are in the report tables below."><defs><linearGradient id="cafeReportFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#a8bb94" stop-opacity=".35"/><stop offset="1" stop-color="#a8bb94" stop-opacity=".03"/></linearGradient></defs>'+ticks+'<polygon points="'+points[0][0]+','+bottom+' '+line+' '+points[points.length-1][0]+','+bottom+'" fill="url(#cafeReportFill)"/><polyline points="'+line+'" fill="none" stroke="#7b906b" stroke-width="2.5" stroke-linejoin="round"/>'+labels+'</svg><p class="helper-text">Paid revenue · Philippine pesos · selected business period</p>';
    }
    favorites.innerHTML=(data.topItems||[]).slice(0,4).map((item,index)=>'<div class="cafe-report-favorite"><div>'+e(item.name)+'<small>#'+(index+1)+' in this report period</small></div><b>'+e(new Intl.NumberFormat('en-PH').format(Number(item.units)||0))+'</b></div>').join('')||'<p class="cafe-empty">No paid item sales for this period.</p>';
  }
  function initOrderFilters() {
    document.getElementById('cafeOrderSearch')?.addEventListener('input',event=>{
      cafeOrderView.search=event.target.value.trim().toLowerCase();renderOrders();
    });
  }
  window.QuvoCafeWorkspace={renderReportOverview};
  initShell();initOrderFilters();
})();
