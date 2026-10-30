const CACHE_KEY='lepraPanelCache';
const BADGE_KEY='lepraBadgeMode';
const SITE_MATCHES=['https://leprosorium.ru/*','https://*.leprosorium.ru/*','http://leprosorium.ru/*','http://*.leprosorium.ru/*'];

async function getOwnLogin(tabId){
  try{
    const results=await chrome.scripting.executeScript({
      target:{tabId}, world:'MAIN',
      func:()=>{
        const g=window.globals;
        if(g && g.user && typeof g.user.login==='string') return g.user.login;
        if(g && typeof g.current_user==='string') return g.current_user;
        return '';
      }
    });
    const value=results?.[0]?.result;
    return typeof value==='string' ? value.trim() : '';
  }catch(_){ return ''; }
}


async function fetchFromSiteTabs(){
  const tabs=await chrome.tabs.query({url:SITE_MATCHES});
  let lastError='';
  for(const tab of tabs){
    if(!tab.id) continue;
    try{
      const selfLogin=await getOwnLogin(tab.id);
      const result=await chrome.tabs.sendMessage(tab.id,{type:'LEPRA_FETCH_PANEL_FROM_PAGE',selfLogin});
      if(result?.ok) return result.data;
      if(result?.error) lastError=result.error;
    }catch(e){
      const message=String(e?.message||e);
      // Newly reloaded extensions cannot message an already-open tab until its content script is injected.
      lastError=/Could not establish connection|Receiving end does not exist|message port closed/i.test(message)
        ? 'Не удалось получить данные. Откройте leprosorium.ru, обновите страницу и повторите.'
        : message;
    }
  }
  throw new Error(lastError||'Откройте leprosorium.ru и обновите страницу.');
}

async function readPanelCache(){
  const stored=await chrome.storage.local.get(CACHE_KEY);
  return stored[CACHE_KEY]||null;
}

let panelRefreshPromise=null;
async function refreshPanel(){
  if(panelRefreshPromise) return panelRefreshPromise;
  panelRefreshPromise=(async()=>{
    try{
      const data=await fetchFromSiteTabs();
      const clean={login:data.login,karma:data.karma,rating:data.rating,myunreadposts:data.myunreadposts,myunreadcomms:data.myunreadcomms,inboxunreadposts:data.inboxunreadposts,inboxunreadcomms:data.inboxunreadcomms};
      const record={time:Date.now(),data:clean};
      await chrome.storage.local.set({[CACHE_KEY]:record});
      await updateBadge(clean);
      // Notify an open popup that fresh data has arrived.
      try{await chrome.runtime.sendMessage({type:'LEPRA_PANEL_UPDATED',data:clean});}catch(_){}
      return clean;
    }catch(error){
      const cached=await readPanelCache();
      if(cached?.data){
        const fallback={...cached.data,_cached:true,_cacheTime:cached.time,_refreshError:String(error?.message||error)};
        try{await chrome.runtime.sendMessage({type:'LEPRA_PANEL_UPDATED',data:fallback});}catch(_){}
        return fallback;
      }
      throw error;
    }finally{panelRefreshPromise=null;}
  })();
  return panelRefreshPromise;
}

async function getPanelCacheFirst(){
  const cached=await readPanelCache();
  if(cached?.data){
    // Return the last successful snapshot immediately; refresh independently.
    refreshPanel().catch(e=>console.warn('Lepra+ panel refresh failed:',e));
    return {...cached.data,_cached:true,_cacheTime:cached.time};
  }
  return await refreshPanel();
}

async function updateBadge(data){
  const setting=await chrome.storage.local.get(BADGE_KEY); let mode=Number(setting[BADGE_KEY]||0);
  // Migrate legacy separate inbox counters to the combined inbox display.
  if(mode===5||mode===6){mode=4;await chrome.storage.local.set({[BADGE_KEY]:mode});}
  const fields={1:['karma','Карма'],2:['rating','Рейтинг комментариев'],3:['myunreadposts','Мои вещи'],4:['inboxunreadposts','Инбокс']};
  if(!mode||!fields[mode]){await chrome.action.setBadgeText({text:''});await chrome.action.setTitle({title:'Lepra+'});return;}
  const [key,label]=fields[mode];
  let value='';
  if(mode===3) value=`${Number(data.myunreadposts)||0}/${Number(data.myunreadcomms)||0}`;
  else if(mode===4) value=`${Number(data.inboxunreadposts)||0}/${Number(data.inboxunreadcomms)||0}`;
  else {const n=Number(data[key]);value=Number.isFinite(n)?String(n):'';}
  await chrome.action.setBadgeBackgroundColor({color:'#315fbd'});
  await chrome.action.setBadgeText({text:value.length>4?value.slice(0,4):value});
  await chrome.action.setTitle({title:`Lepra+ · ${label}: ${value||'—'}`});
}
async function refreshBadge(){try{await refreshPanel();}catch(e){console.warn('Lepra+ panel refresh failed:',e);}}
chrome.runtime.onInstalled.addListener(()=>{chrome.alarms.create('lepra-panel-refresh',{periodInMinutes:1});refreshBadge();});
chrome.runtime.onStartup.addListener(()=>{chrome.alarms.create('lepra-panel-refresh',{periodInMinutes:1});refreshBadge();});
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='lepra-panel-refresh')refreshBadge();});
// Refresh when navigation changes, so unread totals/badge follow site activity without opening the popup.
let refreshRunning=false; let lastTabRefresh=0;
async function refreshBadgeSoon(){
  const now=Date.now();
  if(refreshRunning || now-lastTabRefresh<12000) return;
  refreshRunning=true; lastTabRefresh=now;
  try{await refreshBadge();}finally{refreshRunning=false;}
}
chrome.tabs.onActivated.addListener(()=>refreshBadgeSoon());
chrome.tabs.onUpdated.addListener((tabId,info,tab)=>{
  if(info.status==='complete' && tab.url && /https?:\/\/(?:[^/]+\.)?leprosorium\.(?:ru|com)\//i.test(tab.url)) refreshBadgeSoon();
});
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes[BADGE_KEY]){chrome.storage.local.get(CACHE_KEY).then(v=>{if(v[CACHE_KEY])updateBadge(v[CACHE_KEY].data);});}});
chrome.runtime.onMessage.addListener((message,sender,sendResponse)=>{
  if(message?.type==='LEPRA_GET_PANEL'){
    getPanelCacheFirst().then(data=>sendResponse({ok:true,data})).catch(e=>sendResponse({ok:false,error:String(e?.message||e)}));
    return true;
  }
});
