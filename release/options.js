const DEFAULTS={commentsratings:true,usernumber:false,commentsgender:false,leprotitles:false,preview:false};
document.addEventListener('DOMContentLoaded',async()=>{
 const stored=await chrome.storage.local.get('plugins');
 const plugins={...DEFAULTS,...(stored.plugins||{})};
 for(const [key] of Object.entries(DEFAULTS)){
  const el=document.getElementById(key); if(!el)continue;
  el.checked=Boolean(plugins[key]);
  el.addEventListener('change',async()=>{
   plugins[key]=el.checked?1:0;
   await chrome.storage.local.set({plugins});
   await chrome.storage.local.set({[key]:el.checked?1:0});
   const status=document.getElementById('status'); status.textContent='Настройка сохранена';
   setTimeout(()=>{if(status.textContent==='Настройка сохранена')status.textContent=''},1400);
  });
 }
 if(!stored.plugins) await chrome.storage.local.set({plugins});
});

document.addEventListener('DOMContentLoaded',async()=>{const el=document.getElementById('badgeMode');if(!el)return;const key='lepraBadgeMode';const stored=await chrome.storage.local.get(key);el.value=String(stored[key]??0);el.addEventListener('change',async()=>{await chrome.storage.local.set({[key]:Number(el.value)});const status=document.getElementById('status');status.textContent='Настройка сохранена';setTimeout(()=>{if(status.textContent==='Настройка сохранена')status.textContent=''},1400);});});
