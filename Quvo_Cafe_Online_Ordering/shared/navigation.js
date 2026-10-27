const screens=document.querySelectorAll('.screen');
const bottomNav=document.querySelector('.bottom-nav');
const onlinePublicScreens=['screenHome','screenMenu','screenAbout'];
function canNavigateTo(screenId){
 if(screenId==='screenOnlineAuth'||onlinePublicScreens.includes(screenId)||state.onlineCustomer)return true;
 QuvoStorefront.requestLogin(screenId);return false;
}
function showScreen(screenId){
 if(screenId==='screenOnlineAuth'){QuvoStorefront.requestLogin();return;}
 if(!canNavigateTo(screenId))return;
 if(!document.getElementById(screenId)?.classList.contains('screen'))return;
 const changed=state.currentScreen!==screenId;
 if(changed&&document.activeElement?.closest('.screen'))document.activeElement.blur();
 document.querySelector('.app-frame').scrollLeft=0;state.currentScreen=screenId;
 screens.forEach(screen=>{const active=screen.id===screenId;screen.classList.toggle('screen-active',active);screen.inert=!active;});
 bottomNav.style.display='grid';bottomNav.classList.toggle('online-mode',Boolean(state.onlineCustomer));
 configureMenuHeader();updateNavState(screenId);updateFloatingCart();QuvoStorefront.screenChanged(screenId);
 if(screenId==='screenHistory')renderHistory();if(screenId==='screenAccount')renderAccount();if(screenId==='screenCart')refreshOnlinePayment();
 if(changed)window.scrollTo({top:0,behavior:'instant'});
}
function updateNavState(screenId){document.querySelectorAll('.nav-btn').forEach(button=>{const active=button.dataset.nav===screenId;button.classList.toggle('active',active);if(active)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');});}
function bindNavigationEvents(){document.querySelectorAll('[data-nav]').forEach(button=>button.addEventListener('click',()=>showScreen(button.dataset.nav)));}
