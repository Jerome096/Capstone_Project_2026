// Two receipt images can exceed localStorage's quota. Keep exact retry photos in
// IndexedDB and a small account-scoped pointer beside the existing pending cart.
(() => {
  let database;
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      if(!window.indexedDB)return reject(new Error('Image recovery storage is unavailable.'));
      const request=indexedDB.open('quvo-online-submission-proofs',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('submissions');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('Close older ordering tabs and try again.'));
    });return database;
  }
  async function store(mode,key,value){
    const db=await open();return new Promise((resolve,reject)=>{
      const transaction=db.transaction('submissions',mode==='get'?'readonly':'readwrite');
      const table=transaction.objectStore('submissions');
      const request=mode==='get'?table.get(key):mode==='put'?table.put(value,key):table.delete(key);
      transaction.oncomplete=()=>resolve(request.result);transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
    });
  }
  async function persist(value){
    if(!value.payload.booking_image){saveOnlinePending(value,value.customerId);return;}
    const key=String(value.customerId)+':'+value.payload.submission_key;
    try {await store('put',key,value);} catch {
      // Small images still work in browsers without IndexedDB; the existing
      // localStorage guard prevents submission if neither store can retain them.
      saveOnlinePending(value,value.customerId);return;
    }
    const marker={...value,proof_key:key,payload:{...value.payload}};
    delete marker.payload.receipt_image;delete marker.payload.booking_image;
    try {saveOnlinePending(marker,value.customerId);} catch(error){await store('delete',key).catch(()=>{});throw error;}
    if(String(state.onlineCustomer?.id)===String(value.customerId))online.pending={...value,proof_key:key};
  }
  async function restore(){
    const marker=online.pending;if(!marker?.proof_key)return;
    const owner=String(state.onlineCustomer.id),generation=online.generation;
    try {
      const saved=await store('get',marker.proof_key);
      if(!saved||String(saved.customerId)!==owner||saved.payload?.submission_key!==marker.payload.submission_key||
          !saved.payload.receipt_image||!saved.payload.booking_image)throw new Error('Saved photos are unavailable.');
      if(generation!==online.generation||String(state.onlineCustomer?.id)!==owner)return;
      online.pending={...saved,proof_key:marker.proof_key};state.cart=saved.cart;
    }catch{
      if(generation!==online.generation||String(state.onlineCustomer?.id)!==owner)return;
      marker.proofsMissing=true;
      showToast('Your saved submission photos could not be restored. Contact Quvo before starting another order.');
    }
  }
  async function clear(owner,key){if(key)await store('delete',String(owner)+':'+key).catch(()=>{});}
  const ready=()=>!online.pending?.proof_key||Boolean(!online.pending.proofsMissing&&online.pending.payload.receipt_image&&online.pending.payload.booking_image);
  window.QuvoPendingProofs={persist,restore,clear,ready};
})();
