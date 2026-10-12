const accountAvatar = document.getElementById("accountAvatar");

const accountDisplayName = document.getElementById("accountDisplayName");

const accountDisplayEmail = document.getElementById("accountDisplayEmail");

const profileForm = document.getElementById("profileForm");

const profileName = document.getElementById("profileName");

const profileEmail = document.getElementById("profileEmail");

const profileContact = document.getElementById("profileContact");

const profileAddress = document.getElementById("profileAddress");

const profileError = document.getElementById("profileError");

const profileSuccess = document.getElementById("profileSuccess");

const passwordForm = document.getElementById("passwordForm");

const currentPassword = document.getElementById("currentPassword");

const newPassword = document.getElementById("newPassword");

const confirmNewPassword = document.getElementById("confirmNewPassword");

const passwordError = document.getElementById("passwordError");

const passwordSuccess = document.getElementById("passwordSuccess");

const accountOrdersBtn = document.getElementById("accountOrdersBtn");

const logoutBtn = document.getElementById("logoutBtn");

function renderAccount() {
  if (state.accessMode !== "online" || !state.onlineCustomer) {
    return;
  }

  const customer = state.onlineCustomer;
  const initials =
    String(customer.name || "Quvo Customer")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "QC";

  accountAvatar.textContent = initials;
  accountDisplayName.textContent = customer.name || "Customer";
  accountDisplayEmail.textContent = customer.email || "";
  profileName.value = customer.name || "";
  profileEmail.value = customer.email || "";
  profileContact.value = customer.contact || "";
  profileAddress.value = customer.address || "";

  profileError.textContent = "";
  profileSuccess.textContent = "";
  passwordError.textContent = "";
  passwordSuccess.textContent = "";
}

async function handleProfileUpdate(event){
  event.preventDefault();if(!state.onlineCustomer)return;
  await onlineForm(profileForm,profileError,async()=>{
    const result=await onlineApi({action:"profile",name:profileName.value.trim(),email:profileEmail.value.trim(),contact:profileContact.value.trim(),address:profileAddress.value.trim()});
    state.onlineCustomer=result.account;state.customerName=result.account.name;
    configureMenuHeader();renderAccount();prefillDeliveryDetails(true);profileSuccess.textContent="Profile changes saved.";
  });
}
async function handlePasswordUpdate(event){
  event.preventDefault();if(!state.onlineCustomer)return;
  await onlineForm(passwordForm,passwordError,async()=>{
    if(newPassword.value!==confirmNewPassword.value)throw new Error("New passwords do not match.");
    await onlineApi({action:"password",current_password:currentPassword.value,password:newPassword.value});
    passwordForm.reset();passwordSuccess.textContent="Password updated.";
  });
}
async function logoutOnlineCustomer(){
  if(online.busy)return showToast("Please wait for your order submission to finish.");
  logoutBtn.disabled=true;
  try{await onlineApi({action:"logout"});resetOnlineView();loginForm.reset();registerForm.reset();profileForm.reset();passwordForm.reset();switchAuthTab("login");}
  catch(error){showToast(error.message);}finally{logoutBtn.disabled=false;}
}
function bindAccountEvents(){
  profileForm.addEventListener("submit",handleProfileUpdate);passwordForm.addEventListener("submit",handlePasswordUpdate);
  accountOrdersBtn.addEventListener("click",()=>showScreen("screenHistory"));logoutBtn.addEventListener("click",logoutOnlineCustomer);
}
