const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',innerHTML:'',hidden:false,disabled:false,setAttribute(){},classList:{contains:()=>true}});return nodes.get(id);};
const ctx=vm.createContext({Intl,Date,Number,String,Object,console,window:{QUVO_CONFIG:{allowedScreens:['reports']}},document:{getElementById:el},receiptDateLabel:value=>value,escapeHtml:value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../admin/reports/reports.js'),'utf8'),ctx);
const run=code=>vm.runInContext(code,ctx);let checks=0;
const check=(value,label)=>{assert.ok(value,label);checks++;};
for(const [current,previous,currency,lowerBetter,tone,direction] of [
 ['10000.00','8000.00',true,false,'positive','higher'],['6000.00','8000.00',true,false,'negative','lower'],['8000.00','8000.00',true,false,'neutral','equal'],
 [1,3,false,true,'positive','lower'],[5,3,false,true,'negative','higher'],[3,3,false,true,'neutral','equal'],[12,10,false,false,'positive','higher'],
 ['5.00','0.00',true,false,'positive','higher'],['0.00','5.00',true,false,'negative','lower'],['0.00','0.00',true,false,'neutral','equal']]){
 const result=run(`reportMetricChange(${JSON.stringify(current)},${JSON.stringify(previous)},${currency},${lowerBetter})`);
 check(result.tone===tone&&result.direction===direction,'correct direction/color for '+current+' versus '+previous);
}
check(run('reportMetricChange("10000.00","8000.00",true).percentage')===25,'25 percent revenue growth');
check(run('reportMetricChange("6000.00","8000.00",true).percentage')===-25,'25 percent revenue decline');
check(run('reportMetricChange("0.11","0.10",true).amount')===.01,'one-cent comparison uses integer cents');
check(run('reportMetricChange("10.00","0.00",true).percentage')===null,'zero baseline does not divide by zero');
check(run('reportMetricChange("10.00",null,true).direction')==='unavailable','missing previous amount is unavailable');
check(run('reportMetricChange("NaN","10.00",true).direction')==='unavailable','invalid values cannot produce a performance color');
check(run('reportMetricChange("9007199254740992","10.00",true).direction')==='unavailable','unsupported integer precision is not colored');
const summary={totalRevenue:'10000.00',paidOrders:20,averageOrderValue:'500.00',ordersPlaced:25,completedOrders:18,voidedOrders:1,unpaidOrders:3,outsideHoursOrders:0};
const before={totalRevenue:'8000.00',paidOrders:16,averageOrderValue:'500.00',ordersPlaced:20,completedOrders:16,voidedOrders:3,unpaidOrders:1,outsideHoursOrders:1};
function render(comparison,period='daily'){
 const date={daily:'2026-10-25',monthly:'2026-10',yearly:'2026'}[period];
 run('reportsSql.period='+JSON.stringify(period)+';reportsSql.data='+JSON.stringify({period,date,summary,comparison,operatingHours:{legacy:false,windowStart:'2026-10-25 07:00:00',windowEnd:'2026-10-26 07:00:00'},activity:[],topItems:[],breakdown:[]})+';renderReports()');
 return el('reportSummaryRows').innerHTML;
}
const comparison={period:'daily',date:'2026-10-24',summary:before,hasActivity:true,selectedStatus:'complete',outsideHoursComparable:true};
let html=render(comparison);
check(/totalRevenue[^]*?report-metric-value--positive/.test(html),'selected revenue is green for higher sales');
check(html.includes('Higher by ₱2,000.00 (+25%)')&&html.includes('Previous: ₱8,000.00'),'revenue comparison shows the prior amount, difference and percentage');
check(/voidedOrders[^]*?report-metric-value--positive/.test(html),'fewer voids are green');
check(/unpaidOrders[^]*?report-metric-value--negative/.test(html),'more unpaid orders are red');
check(/averageOrderValue[^]*?report-metric-value--neutral/.test(html),'unchanged average order is neutral');
check(el('reportComparisonStatus').textContent.includes('previous business day: 2026-10-24'),'daily comparison identifies its business date');
render({...comparison,selectedStatus:'in_progress'});check(el('reportComparisonStatus').textContent.includes('still in progress; previous totals cover the full period'),'partial reports identify the full prior-period baseline');
html=render({...comparison,selectedStatus:'upcoming'});check(!/report-metric-value--(?:positive|negative)/.test(html)&&html.includes('Period has not started'),'future reports have neutral comparisons');
html=render({...comparison,hasActivity:false});check(!/report-metric-value--(?:positive|negative)/.test(html)&&html.includes('No previous transactions'),'missing previous records use neutral comparisons');
html=render(null);check(html.includes('Comparison unavailable')&&!html.includes('NaN'),'older/missing comparison responses have a neutral fallback');
html=render({...comparison,outsideHoursComparable:false});check(/outsideHoursOrders[^]*?No comparable schedule/.test(html),'legacy closing metric is not compared as an artificial zero');
render({...comparison,period:'monthly',date:'2026-09'},'monthly');check(el('reportComparisonStatus').textContent.includes('previous month: September 2026'),'monthly uses the previous calendar month');
render({...comparison,period:'yearly',date:'2025'},'yearly');check(el('reportComparisonStatus').textContent.includes('previous year: 2025'),'yearly uses the previous year');
const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(value);
ctx.testMoney=money;ctx.testComparison={...comparison,summary:{...before,totalRevenue:'0.00'}};
const zeroCell=run('reportComparisonCell("totalRevenue","10.00",true,false,testComparison,testMoney)');
check(zeroCell.includes('from zero')&&!zeroCell.includes('%')&&!zeroCell.includes('Infinity'),'a real zero baseline uses a readable non-percentage label');
console.log(checks+' report comparison checks passed.');
