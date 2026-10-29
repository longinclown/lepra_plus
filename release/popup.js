const $=id=>document.getElementById(id);
function show(data){
  $('karma').textContent=data.karma??'—';
  $('my').textContent=`${data.myunreadposts??'—'} / ${data.myunreadcomms??'—'}`;
  $('inbox').textContent=`${data.inboxunreadposts??'—'} / ${data.inboxunreadcomms??'—'}`;
  if(data._cached){
    const time=data._cacheTime?new Date(data._cacheTime).toLocaleString():'неизвестно когда';
    $('status').textContent=`Показаны последние сохранённые данные (${time}). Откройте leprosorium.ru, чтобы обновить.`;
    $('status').className='muted';
  }else{
    $('status').textContent='';
    $('status').className='muted';
  }
  $('karmaRow').dataset.login=data.login||'';
}
async function load(force=true){
  $('status').textContent='Загрузка данных…';$('status').className='muted';
  try{
    const result=await chrome.runtime.sendMessage({type:'LEPRA_GET_PANEL',force});
    if(!result||!result.ok)throw new Error(result?.error||'Не удалось получить данные');
    show(result.data);
  }catch(e){
    let message=String(e?.message||e);
    if(message.includes('Не удалось получить данные.')||message.includes('Не удалось найти CSRF-токен')) message='Не удалось получить данные. Откройте leprosorium.ru, обновите страницу и повторите.';
    $('status').textContent=message.startsWith('Не удалось получить данные')?message:'Не удалось получить данные: '+message;
    $('status').className='muted error';
  }
}
$('settings').addEventListener('click',()=>chrome.runtime.openOptionsPage());
$('karmaRow').addEventListener('click',()=>{
  const login=$('karmaRow').dataset.login;
  chrome.tabs.create({url:login?`https://leprosorium.ru/users/${encodeURIComponent(login)}/`:'https://leprosorium.ru/'});
});
$('myRow').addEventListener('click',()=>chrome.tabs.create({url:'https://leprosorium.ru/my/'}));
$('inboxRow').addEventListener('click',()=>chrome.tabs.create({url:'https://leprosorium.ru/my/inbox/'}));
load(true);
