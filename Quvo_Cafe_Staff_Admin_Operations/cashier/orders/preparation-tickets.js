// A confirmed payment releases an order to preparation; printing does not change it.
const preparationTickets = {order:null, frame:null};
function preparationCashier() {
  return window.QUVO_SESSION?.full_name || window.QUVO_SESSION?.username || "Cashier";
}
function recordPreparationApproval(order) {
  order.approvedBy=preparationCashier();
  order.approvedAt=new Date().toLocaleString("en-PH");
  order.approvedDate=receiptDay();
}
function preparationApprovalMarkup(order) {
  if(!isOrderPaymentConfirmed(order))return "";
  const name=order.approvedBy||"Cashier",time=order.approvedAt||"";
  return '<p class="preparation-approval">Approved for preparation · '+escapeHtml(name)+
    (time?' <span>'+escapeHtml(time)+'</span>':'')+'</p>';
}
function preparationReprintMarkup(order) {
  if(!isOrderPaymentConfirmed(order)||!['preparing','ready'].includes(order.stage)||!/^(?:sql)?[0-9]+$/.test(String(order.id)))return "";
  return '<button class="btn light preparation-reprint" onclick="openPreparationTicketsForOrder(\''+order.id+'\')">Print staff tickets</button>';
}
function splitPreparationItems(order) {
  const drinks=getBeverageItems(order),food=getFoodItems(order);
  return [{name:'DRINKS',items:drinks},{name:'KITCHEN',items:food}].filter(ticket=>ticket.items.length);
}
function preparationTicketMarkup(order,ticket) {
  const e=escapeHtml,source=order.source==='manual'?'Walk-in / POS':order.source==='online'?'Online order':'Dine-in';
  const line=(label,value)=>'<div class="prep-ticket-meta"><span>'+e(label)+'</span><b>'+e(value||'—')+'</b></div>';
  return '<section class="prep-ticket"><header><h3>Quvo Café</h3><h4>'+ticket.name+' TICKET</h4><strong class="prep-ticket-number">'+e(order.number)+'</strong></header>'+
    line('Source',source)+line('Customer',order.customerName||'Guest')+line('Location',order.table||'Counter')+
    (order.source==='online'?line('Fulfillment',order.fulfillment):'')+
    line('Approved by',order.approvedBy||'Cashier')+line('Approved at',order.approvedAt||order.time)+
    '<div class="prep-ticket-items">'+ticket.items.map(item=>{
      const notes=[...(item.customizations||[]),item.drinkOptions?formatDrinkOptions(item.drinkOptions):'',item.note,item.notes].filter(Boolean);
      return '<div class="prep-ticket-item"><strong>'+e(item.qty)+' × '+e(item.name)+'</strong>'+
        (notes.length?'<p>'+e([...new Set(notes)].join(' · '))+'</p>':'')+'</div>';
    }).join('')+'</div><footer>Approved for preparation</footer></section>';
}
function buildPreparationTicketsDocument(order,department=null) {
  const tickets=splitPreparationItems(order).filter(ticket=>!department||ticket.name===department);
  return buildThermalPrintDocument(order.number+' staff tickets',tickets.map(ticket=>preparationTicketMarkup(order,ticket)).join(''));
}
function openPreparationTickets(order) {
  if(!isOrderPaymentConfirmed(order)||order.stage!=='preparing'&&order.stage!=='ready')return;
  preparationTickets.order=JSON.parse(JSON.stringify(order));
  const tickets=splitPreparationItems(order);
  document.getElementById('preparationTicketsTitle').textContent='Print staff tickets · '+order.number;
  document.getElementById('preparationTicketsSummary').textContent=tickets.length===2?'Payment approved. Print one ticket for drinks and one for food.':
    tickets.length?'Payment approved. Only the '+tickets[0].name.toLowerCase()+' ticket is needed for this order.':'This order has no preparation items.';
  document.getElementById('preparationTicketsPreview').innerHTML=tickets.map(ticket=>preparationTicketMarkup(order,ticket)).join('');
  document.getElementById('preparationTicketsPrint').disabled=!tickets.length;
  document.getElementById('preparationTicketsPrint').textContent=tickets.length===2?'Print both tickets':'Print ticket';
  ['DRINKS','KITCHEN'].forEach(department=>{
    const button=document.getElementById('preparationTickets'+department);
    if(button)button.hidden=tickets.length!==2;
  });
  document.getElementById('preparationTicketsModal').showModal();
}
function openPreparationTicketsForOrder(id) {
  const order=state.orders.find(entry=>String(entry.id)===String(id));if(order)openPreparationTickets(order);
}
function printPreparationTickets(department=null) {
  const order=preparationTickets.order;if(!order||!splitPreparationItems(order).some(ticket=>!department||ticket.name===department))return;
  const frame=printThermalDocument(buildPreparationTicketsDocument(order,department),'Printable staff tickets',()=>{preparationTickets.frame=null;});
  preparationTickets.frame=frame?.isConnected?frame:null;
}
function bindPreparationTickets() {
  document.getElementById('preparationTicketsPrint').addEventListener('click',()=>printPreparationTickets());
  ['DRINKS','KITCHEN'].forEach(department=>document.getElementById('preparationTickets'+department).addEventListener('click',()=>printPreparationTickets(department)));
  document.getElementById('preparationTicketsLater').addEventListener('click',()=>document.getElementById('preparationTicketsModal').close());
  document.getElementById('preparationTicketsModal').addEventListener('close',()=>{preparationTickets.order=null;});
}
