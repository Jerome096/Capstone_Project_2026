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
    const metrics=document.getElementById('cafeReportMetrics'),favorites=document.getElementById('cafeReportFavorites');
    if(!metrics||!favorites)return;
    const data=model.data,s=data?.summary;
    const entries=[['Total sales','totalRevenue',true,'Approved payments in this period'],['Paid orders','paidOrders',false,'Across dine-in, online and counter'],['Average paid order','averageOrderValue',true,'Revenue divided by paid orders'],['Completed orders','completedOrders',false,'Paid orders marked served']];
    metrics.innerHTML=entries.map(([label,key,currency,note])=>{
      const value=!s?'—':currency?money(s[key]):new Intl.NumberFormat('en-PH').format(Number(s[key])||0);
      return '<article class="cafe-report-metric"><label>'+label+'</label><strong'+(value.length>11?' data-wide-value':'')+'>'+e(value)+'</strong><small>'+(!s?model.loading?'Loading report…':'No report loaded':note)+'</small></article>';
    }).join('');
    if(!data){
      favorites.innerHTML='<p class="cafe-empty">'+e(model.loading?'Loading saved report…':model.error?'Report unavailable. Use Refresh to retry.':'Choose a period to view sales.')+'</p>';return;
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
