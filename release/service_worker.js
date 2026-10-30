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



// Direct background access: works even when no Leprosorium tab is open.
// Session cookies are read only for this request and are never stored by Lepra+.
async function fetchDirectFromBackground(){
  const base='https://leprosorium.ru';
  const getCookie=async name=>{
    const c=await chrome.cookies.get({url:base+'/',name});
    return c?.value||'';
  };
  const [uid,sid]=await Promise.all([getCookie('uid'),getCookie('sid')]);
  if(!uid||!sid) throw new Error('Нет активной авторизации Leprosorium (cookies uid/sid не найдены).');

  // Fetch a lightweight authenticated page to obtain the current CSRF token and login.
  const pageResponse=await fetch(base+'/my/',{credentials:'include',cache:'no-store',redirect:'follow',headers:{'Accept':'text/html,application/xhtml+xml'}});
  const html=await pageResponse.text();
  if(!pageResponse.ok) throw new Error(`Leprosorium: HTTP ${pageResponse.status} при запросе страницы профиля.`);
  if(/name=["']password["']|Войти в Leprosorium/i.test(html) && !/csrf_token/i.test(html)) throw new Error('Сессия Leprosorium не подтверждена.');

  const tokenPatterns=[
    /name=["']csrf_token["'][^>]*value=["']([^"']{12,})["']/i,
    /value=["']([^"']{12,})["'][^>]*name=["']csrf_token["']/i,
    /["']csrf_token["']\s*[:=]\s*["']([^"']{12,})["']/i,
    /\bcsrf_token=([^&"'\s;]+)/i,
    /\bcsrfToken\s*[:=]\s*["']([^"']{12,})["']/i,
    /\bCSRF_TOKEN\s*[:=]\s*["']([^"']{12,})["']/i
  ];
  let csrf='';
  for(const re of tokenPatterns){const m=html.match(re);if(m){try{csrf=decodeURIComponent(m[1]);}catch(_){csrf=m[1];}if(csrf)break;}}
  if(!csrf) throw new Error('Не удалось извлечь CSRF-токен из страницы Leprosorium.');

  let login='';
  const loginPatterns=[
    /globals\.user\s*=\s*\{[\s\S]{0,1500}?\blogin\s*:\s*["']([^"']+)["']/i,
    /globals\.user\.login\s*=\s*["']([^"']+)["']/i,
    /(?:window\.)?globals\s*=\s*\{[\s\S]{0,2500}?\buser\s*:\s*\{[\s\S]{0,1200}?\blogin\s*:\s*["']([^"']+)["']/i,
    /["']current_user["']\s*:\s*["']([^"']+)["']/i,
    /data-current-user-login=["']([^"']+)["']/i,
    /<a[^>]+href=["']\/users\/([^/?#"']+)\/?["'][^>]*>(?:\s*<[^>]+>)*\s*(?:Мой профиль|Профиль|Моя страница)/i
  ];
  for(const re of loginPatterns){const m=html.match(re);if(m){login=m[1];break;}}
  if(!login) throw new Error('Не удалось определить логин текущего пользователя по странице Leprosorium.');

  const postJson=async(path,params)=>{
    const body=new URLSearchParams({...params,csrf_token:csrf});
    const r=await fetch(base+path,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8','Accept':'application/json, text/plain, */*','X-Futuware-UID':uid,'X-Futuware-SID':sid},body});
    const t=await r.text();
    if(!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    try{return t?JSON.parse(t):null;}catch(_){throw new Error(`${path}: сервер вернул не JSON.`);}
  };
  const fetchCounter=async type=>{
    try{return await postJson(`/ajax/${type}/unread_count/`,{});}catch(e){
      if(!String(e?.message||e).includes('HTTP 404'))throw e;
      const params=type==='interest'?{sort:'0',period:'30',unread:'1'}:{sort:'3',unread:'1',filter_owner:'all'};
      return postJson(`/ajax/${type}/moar/`,params);
    }
  };
  const [interest,inbox,profileResponse]=await Promise.all([
    fetchCounter('interest'),fetchCounter('inbox'),
    fetch(base+`/api/users/${encodeURIComponent(login)}/info/?page=1`,{credentials:'include',cache:'no-store',headers:{'Accept':'application/json','X-Futuware-UID':uid,'X-Futuware-SID':sid}}).then(async r=>{const t=await r.text();if(!r.ok)throw new Error(`Профиль: HTTP ${r.status}`);try{return JSON.parse(t);}catch(_){throw new Error('API профиля вернул не JSON.');}})
  ]);
  const readCount=(obj,label)=>{const a=obj?.unread_count;if(!Array.isArray(a)||a.length<2||!Number.isFinite(Number(a[0]))||!Number.isFinite(Number(a[1])))throw new Error(`${label}: сервер не вернул корректный unread_count.`);return {posts:Number(a[0]),comments:Number(a[1])};};
  const my=readCount(interest,'Мои вещи'), ib=readCount(inbox,'Инбокс');
  const info=profileResponse?.user_info;
  if(!info||info.karma===undefined)throw new Error('API профиля не вернул карму.');
  return {login:info.login||login,karma:info.karma,rating:info.documents_rating??null,myunreadposts:my.posts,myunreadcomms:my.comments,inboxunreadposts:ib.posts,inboxunreadcomms:ib.comments};
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
      let data;
      try{
        // Preferred path: authenticated background requests continue working with all site tabs closed.
        data=await fetchDirectFromBackground();
      }catch(directError){
        // Fallback for site versions where session/CSRF details can only be read from the live page.
        try{data=await fetchFromSiteTabs();}
        catch(tabError){throw new Error(`${String(directError?.message||directError)}; ${String(tabError?.message||tabError)}`);}
      }
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
