function bindKitchenNavigation(){
  document.querySelectorAll(".nav-item[data-section]").forEach(button=>button.addEventListener("click",()=>{
    document.querySelectorAll(".nav-item").forEach(item=>item.classList.toggle("active",item===button));
    document.querySelectorAll(".view-section").forEach(section=>section.classList.toggle("hidden",section.id!==button.dataset.section));
  }));
}
