const $=id=>document.getElementById(id);
function show(data){
  $('karma').textContent=data.karma??'—';
  $('my').textContent=`${data.myunreadposts??'—'} / ${data.myunreadcomms??'—'}`;
  $('inbox').textContent=`${data.inboxunreadposts??'—'} / ${data.inboxunreadcomms??'—'}`;
  if(data._refreshError){
    $('status').textContent='Не удалось обновить данные. Показан последний сохранённый результат.';
    $('status').className='muted error';
  }else{
    // Cached values are shown immediately; background refresh is intentionally quiet.
    $('status').textContent='';
    $('status').className='muted';
  }
  $('karmaRow').dataset.login=data.login||'';
}
async function load(){
  $('status').textContent='Загрузка данных…';$('status').className='muted';
  try{
    const result=await chrome.runtime.sendMessage({type:'LEPRA_GET_PANEL'});
    if(!result||!result.ok)throw new Error(result?.error||'Не удалось получить данные');
    show(result.data);
  }catch(e){
    let message=String(e?.message||e);
    if(message.includes('Не удалось получить данные.')||message.includes('Не удалось найти CSRF-токен')) message='Не удалось получить данные. Откройте leprosorium.ru, обновите страницу и повторите.';
    $('status').textContent=message.startsWith('Не удалось получить данные')?message:'Не удалось получить данные: '+message;
    $('status').className='muted error';
  }
}
chrome.runtime.onMessage.addListener(message=>{
  if(message?.type==='LEPRA_PANEL_UPDATED' && message.data) show(message.data);
});
$('settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('karmaRow').addEventListener('click',()=>{
  const login=$('karmaRow').dataset.login;
  chrome.tabs.create({url:login?`https://leprosorium.ru/users/${encodeURIComponent(login)}/`:'https://leprosorium.ru/'});
});
$('myRow').addEventListener('click',()=>chrome.tabs.create({url:'https://leprosorium.ru/my/'}));
$('inboxRow').addEventListener('click',()=>chrome.tabs.create({url:'https://leprosorium.ru/my/inbox/'}));
load();
