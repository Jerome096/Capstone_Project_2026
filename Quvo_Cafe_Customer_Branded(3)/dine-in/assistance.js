const guestAssistance = { request:null, deadline:0, busy:false, loading:false, revision:0, error:"" };
function resetGuestAssistance() {
  guestAssistance.revision++;
  guestAssistance.request=null; guestAssistance.deadline=0; guestAssistance.error="";
  const dialog=document.getElementById("staffAssistanceDialog");
  if(dialog.open) dialog.close();
  document.getElementById("staffConcern").value="";
  renderGuestAssistance();
}
async function guestAssistanceApi(input) {
  const response=await fetch("api/assistance.php?table="+encodeURIComponent(guestTableCode),{
    method:input ? "POST":"GET",credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json","X-CSRF-Token":guestCsrf},signal:AbortSignal.timeout(15000),
    ...(input?{body:JSON.stringify(input)}:{}),
  });
  let data;
  try { data=await response.json(); }
  catch { throw new Error("The staff request service could not be reached. Refresh this page and try again."); }
  if(!response.ok || !data.ok) throw new Error(data.error||"Could not contact staff. Please try again.");
  return data;
}
function applyGuestAssistance(request) {
  guestAssistance.request=request;
  guestAssistance.deadline=Date.now()+Number(request?.remaining_seconds||0)*1000;
  guestAssistance.error=""; renderGuestAssistance();
}
function renderGuestAssistance() {
  const remaining=Math.max(0,Math.ceil((guestAssistance.deadline-Date.now())/1000));
  const approved=state.accessMode==="dineIn" && state.sessionApproved;
  const button=document.getElementById("staffBtnHeader");
  button.disabled=!approved || guestAssistance.busy || remaining>0;
  button.textContent=remaining>0 ? `Call Staff (${remaining}s)` : "Call Staff";
  document.getElementById("sendStaffAssistance").disabled=!approved || guestAssistance.busy || remaining>0;
  document.getElementById("staffConcern").disabled=guestAssistance.busy || remaining>0;
  document.getElementById("staffAssistanceStatus").textContent=guestAssistance.error ||
    (remaining>0 ? (guestAssistance.request?.status==="resolved"
      ? `Staff marked your request resolved. You can call again in ${remaining}s.`
      : `Request sent to staff. You can call again in ${remaining}s.`)
      : guestAssistance.request ? "The minute has ended. You can send another request." : "");
}
function requestStaffAssistance() {
  if(state.accessMode!=="dineIn" || !state.sessionApproved) return;
  renderGuestAssistance();
  const dialog=document.getElementById("staffAssistanceDialog");
  if(!dialog.open) dialog.showModal();
}
async function refreshGuestAssistance() {
  if(guestAssistance.loading || guestAssistance.busy || !state.sessionApproved || state.accessMode!=="dineIn") return;
  guestAssistance.loading=true; const revision=guestAssistance.revision;
  try {
    const data=await guestAssistanceApi();
    if(revision===guestAssistance.revision && state.sessionApproved) applyGuestAssistance(data.request);
  } catch(error) {
    if(revision===guestAssistance.revision) {guestAssistance.error=error.message;renderGuestAssistance();}
  } finally {guestAssistance.loading=false;}
}
document.getElementById("staffAssistanceForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(guestAssistance.busy || guestAssistance.deadline>Date.now() || !state.sessionApproved) return;
  guestAssistance.busy=true; const revision=++guestAssistance.revision;
  renderGuestAssistance();
  try {
    const data=await guestAssistanceApi({concern:document.getElementById("staffConcern").value.trim()});
    if(revision===guestAssistance.revision && state.sessionApproved) applyGuestAssistance(data.request);
  } catch(error) {
    if(revision===guestAssistance.revision) guestAssistance.error=error.message;
  } finally {guestAssistance.busy=false;renderGuestAssistance();}
});
document.getElementById("closeStaffAssistance").addEventListener("click",()=>document.getElementById("staffAssistanceDialog").close());
setInterval(renderGuestAssistance,1000);
