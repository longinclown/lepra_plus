// Compatibility bridge for the legacy feature scripts. All persistent state is stored via MV3 chrome.storage.
(function(){
  const api = {};
  function storageKey(key){ return String(key); }
  api.invokeAsync = function(method, key, value, callback){
    // Legacy calls use (method, key, callback) for get and (method, key, value) for set.
    if (typeof value === 'function') { callback=value; value=undefined; }
    if (method === 'kango.storage.getItem') {
      chrome.storage.local.get(storageKey(key)).then(obj => callback && callback(Object.prototype.hasOwnProperty.call(obj,key) ? obj[key] : null));
    } else if (method === 'kango.storage.setItem') {
      chrome.storage.local.set({[storageKey(key)]:value}).then(() => callback && callback());
    } else if (method === 'kango.storage.removeItem') {
      chrome.storage.local.remove(storageKey(key)).then(() => callback && callback());
    } else if (callback) callback(null);
  };
  api.storage={getItem:(key,cb)=>api.invokeAsync('kango.storage.getItem',key,cb),setItem:(key,val,cb)=>api.invokeAsync('kango.storage.setItem',key,val,cb),removeItem:(key,cb)=>api.invokeAsync('kango.storage.removeItem',key,cb)};
  api.xhr={send:(details,callback)=>{
    chrome.runtime.sendMessage({type:'LEPRO_XHR',details:{url:details.url,method:details.method||'GET',contentType:details.contentType||'json',data:details.data||null}}, response=>{
      if(chrome.runtime.lastError){callback && callback({status:0,response:null,error:chrome.runtime.lastError.message});return;}
      callback && callback(response || {status:0,response:null});
    });
  }};
  api.console=console;
  window.kango=api;
})();
