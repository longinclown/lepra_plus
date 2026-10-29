/* Lepra+: compatibility-preserving feature bundle. */
(function(){
(function(){
  const KEY='commentsratings';
  const LIMIT=300;
  function hex(n){ n=Math.max(0,Math.min(255,Math.round(n))); return n.toString(16).padStart(2,'0'); }
  function colorFor(raw){
    const n=Number.parseInt(String(raw).trim().replace(/\s/g,''),10);
    if(!Number.isFinite(n)) return null;
    if(n===0) return '#ffffff';
    if(n<0) return Math.abs(n)>LIMIT ? '#ff0000' : '#'+hex(255*Math.min(1,Math.abs(n)/LIMIT))+'0000';
    if(n<=LIMIT) return '#00'+hex(255*n/LIMIT)+'00';
    if(n<=LIMIT*2) return '#00'+hex(255*(2*LIMIT-n)/LIMIT)+hex(255*(n-LIMIT)/LIMIT);
    return '#0000'+hex(255*Math.min(1,(n-LIMIT*2)/LIMIT));
  }
  function paint(root){
    const nodes=[];
    if(root && root.nodeType===1 && root.matches && root.matches('.vote_result')) nodes.push(root);
    if(root && root.querySelectorAll) nodes.push(...root.querySelectorAll('.vote_result'));
    for(const el of nodes){
      const n=Number.parseInt((el.textContent||'').trim(),10);
      if(!Number.isFinite(n)) continue;
      const c=colorFor(n); if(!c) continue;
      el.style.setProperty('color',c,'important');
      el.style.setProperty('font-size',Math.min(16,9+2*Math.log(Math.abs(n)+1))+'px','important');
      if(n>LIMIT*2) el.style.setProperty('padding-right','10px','important');
      else el.style.removeProperty('padding-right');
    }
  }
  chrome.storage.local.get('plugins').then(data=>{
    if(!(data.plugins && data.plugins[KEY])) return;
    const start=()=>paint(document);
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
    const observer=new MutationObserver(records=>{ for(const r of records){ if(r.type==='childList') r.addedNodes.forEach(n=>{if(n.nodeType===1)paint(n)}); else if(r.type==='characterData') paint(r.target.parentElement); } });
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  });
})();

})();

/* feature: comments_gender.js */
(function(){
  const KEY='commentsgender';
  const STYLE_ID='lpm-gender-style';
  function genderFor(el){
    // Prefer the metadata row, but also inspect the immediate comment container
    // because the site uses slightly different markup on feed and post pages.
    const candidates=[];
    const ddi=el.closest('.ddi'); if(ddi) candidates.push(ddi);
    let p=el.parentElement, depth=0;
    while(p && depth<5){
      if(p.matches('li, .comment, .c_comment, .b-comment, [class*="comment"]')) candidates.push(p);
      p=p.parentElement; depth++;
    }
    for(const c of candidates){
      const t=(c.textContent||'');
      if(/Написала/i.test(t)) return 'female';
      if(/Написал/i.test(t)) return 'male';
    }
    // Last resort: search a short parent chain; useful on older post templates.
    p=el.parentElement; depth=0;
    while(p && depth<3){
      const t=(p.textContent||'');
      if(/Написала/i.test(t)) return 'female';
      if(/Написал/i.test(t)) return 'male';
      p=p.parentElement; depth++;
    }
    return null;
  }
  function paint(root){
    const users=[];
    if(root && root.nodeType===1 && root.matches && root.matches('.c_user')) users.push(root);
    if(root && root.querySelectorAll) users.push(...root.querySelectorAll('.c_user'));
    for(const user of users){
      const g=genderFor(user); if(!g) continue;
      user.classList.toggle('gender_female',g==='female');
      user.classList.toggle('gender_male',g==='male');
    }
  }
  chrome.storage.local.get('plugins').then(data=>{
    if(!(data.plugins && data.plugins[KEY])) return;
    if(!document.getElementById(STYLE_ID)){
      const style=document.createElement('style'); style.id=STYLE_ID;
      style.textContent='.gender_male{color:#3A3AC4!important}.gender_female{color:#DD2B2B!important}';
      (document.head||document.documentElement).appendChild(style);
    }
    paint(document);
    const observer=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)paint(n)})));
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  });
})();

/* feature: lepro_titles.js */
(function(){ try {
// ==UserScript==
// @name          LeproNamesAndPages
// @namespace	leprosorium++leprotitles
// @author     ACTPOHABT (8110), Omen (12643), Vizzy (27480)
// @description   Заменяет скучное "Лепрозорий / Убежище" на номер страницы или юзернэйм.
// @include		*.leprosorium.ru/*
// @include		*leprosorium.ru/*
// @include		*.leprosorium.com/*
// @include		*leprosorium.com/*
// ==/UserScript==

function main() {

    var currentTitle = '',
        newtitle = '',
        page, url = document.URL,
        wannabetitle, karma, username, usernumber, length_title = 50,
        pots, i, j = 0;

    var indexNum = 0;
    var indices =[]; // Переменные

    function sortindices(a, b) //этим методом мы потом отсортируем индексы
    {
        return a - b;
    }

    if (document.title.length < 10) {
        currentTitle = ' / ' + document.title;
    }

    // ^https?:\/\/(\w+\.)?leprosorium\.(ru|com)
    // ^https?:\/\/(\w+\.)?leprosorium\.(ru|com)
    
    if (/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/users\/\w+(\/)?/.test(document.URL)) //страничка с чьим-то профайлом
    {
        username = document.URL.match(/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/users\/(\w+)(\/)?/)[3]; // Грузим имярек

        if (/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/users\/\w+(\/)?$/.test(document.URL)) {
            //    karma = document.getElementsByClassName('rating')[0].childNodes[0].innerHTML;
            // usernumber = document.getElementsByClassName('vote')[0].getAttribute('uid');
            usernumber = document.getElementsByClassName('b-user_name-link')[0].parentNode.parentNode.textContent.match('#([0-9.]+)')[0].replace('.','');
            //    newtitle = wannabetitle + ' (' + usernumber + '), его карма: ' + karma;
            wannabetitle = username + ' (' + usernumber + ')';
            newtitle = wannabetitle;

        } else {
            wannabetitle = 'Про ' + username;
            newtitle = wannabetitle;
        }
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/pages\/1(\/)?$/.test(document.URL)) || (/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)(\/)?$/.test(document.URL))) //страничка с главной
    {
        newtitle = 'Глагне';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/democracy(\/)?$/.test(document.URL))) //Белый дом
    {
        newtitle = 'Белый дом';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/elections\/president(\/)?$/.test(document.URL))) //Выборы
    {
        newtitle = 'Выборы';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/fraud\/(\w+)?(\/)?$/.test(document.URL))) //Магазин и все, что в нем есть
    {
        newtitle = 'Фрод';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/underground(\/)?$/.test(document.URL))) //Страница со списком подлепр
    {
        newtitle = 'Блоги';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/users(\/)?$/.test(document.URL))) //Страница с информацией о юзерах
    {
        newtitle = 'Люди';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/users\/\?username=(\w+)?\&firstname=(\w+)?\&lastname=(\w+)?\&icq=(\d+)?\&(x=\d+\&y=\d+)?$/.test(document.URL))) //Страница поиска людей
    {

        var userstring = document.URL.match(/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/users\/\?username=(\w+)?\&firstname=(\w+)?\&lastname=(\w+)?\&icq=(\d+)?\&(x=\d+\&y=\d+)?$/);

        wannabetitle = "Ищем ";

        try {
            username = userstring[3];
            if (username.length > 0) {
                wannabetitle += username + " ";
            }
        } catch (err) {
        }

        try {
            firstname = userstring[4];
            if (firstname.length > 0) {
                wannabetitle += firstname + " ";
            }
        } catch (err) {
        }

        try {
            lastname = userstring[5];
            if (lastname.length > 0) {
                wannabetitle += lastname + " ";
            }
        } catch (err) {
        }

        try {
            icq = userstring[6];
            if (icq.length > 0) {
                wannabetitle += icq;
            }
        } catch (err) {
        }

        newtitle = wannabetitle;
    }

    if (/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/pages\/\d+(\/)?$/.test(document.URL)) // страничка Лепры, но не главная
    {
        page = document.URL.match(/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/pages\/(\d+)$/)[3];
        newtitle = page + '-я страница';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/my(\/)?$/.test(document.URL))) //страничка с моими вещами
    {
        newtitle = document.getElementById('js-header_nav_my_things').textContent;
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/my\/socialism(\/)?$/.test(document.URL))) //страничка с социализмом
    {
        newtitle = 'Социализм';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/my\/favourites(\/)?$/.test(document.URL))) //страничка с favourites
    {
        newtitle = 'Избранное';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/my\/details(\/)?$/.test(document.URL))) //страничка с details
    {
        newtitle = 'Детали';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/my\/settings(\/)?$/.test(document.URL))) {
        newtitle = 'Настройки';
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/my\/inbox(\/)?$/.test(document.URL))) //страничка с Инбоксом
    {
        newtitle = 'инбокс ' + document.getElementById('js-header_nav_inbox').textContent;
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/asylum(\/)?$/.test(document.URL))) //Страничка для нового поста
    {
        newtitle = 'Новый пост';
    }

    if (/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/mod\/\d+(\/)?$/.test(document.URL)) {
        newtitle = 'Правим ' + document.title.toLowerCase();
    }

    if ((/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/comments\/\d+/.test(document.URL)) || (/^https?:\/\/(\w+\.)?leprosorium\.(ru|com)\/my\/inbox\/\d+/.test(document.URL))) //страничка с постом
    {
        pots = document.getElementsByClassName('dt'); // Грузим пост
        if (pots[j].textContent.trim().length == 0) // Проверка на пустой пост (одна картинка например)
        {
            var coms = document.getElementsByClassName('c_body');

            while (coms[j].textContent.trim().length == 0) {
                j++; // Как бы говорим взять первый коментарий, потому что в посте ничерта нет
            }
            newtitle = coms[j].textContent.trim().toLowerCase();
        } else //отлично, пост не пустой
        {
            if (pots[j].innerHTML.indexOf('<b>') != -1 && pots[j].innerHTML.indexOf('<b>') < 5) //попробуем взять заголовки, заданные тегом <b>
            {
                newtitle = pots[j].childNodes[0].innerHTML.toLowerCase();
            } else if (pots[j].innerHTML.indexOf('<br>') != -1 && pots[j].innerHTML.indexOf('<br>') < length_title) {
                newtitle = pots[j].innerHTML.split('<br>')[0].toLowerCase().replace(/<\/?[^>]+>/gi, '');
            } else {
                newtitle = pots[j].textContent.toLowerCase(); //если их нет, то просто возьмем, что есть
            }
        }
    }


    if (newtitle != '') {

        //Сейчас мы будем добавлять индексы разных знаков препинания
        if (newtitle.indexOf(".") != -1 && newtitle.indexOf(".") < 70) {
            indices[indexNum] = newtitle.indexOf(".");
            indexNum++;
        }

        if (newtitle.indexOf("!") != -1 && newtitle.indexOf("!") < 70) {
            indices[indexNum] = newtitle.indexOf("!") + 1;
            indexNum++;
        }

        if (newtitle.indexOf("?") != -1 && newtitle.indexOf("?") < 70) {
            indices[indexNum] = newtitle.indexOf("?") + 1;
            indexNum++;
        }

        if (newtitle.indexOf("…") != -1 && newtitle.indexOf("…") < 70) {
            indices[indexNum] = newtitle.indexOf("…") + 1;
            indexNum++;
        }

        indices.sort(sortindices); //тут мы эти индексы отсортируем

        if (indexNum > 0) //тут мы обрежем по эти самые индексы
        {
            newtitle = newtitle.substring(0, indices[0]);
        } else if (indexNum == 0 && newtitle.length > length_title) //или просто обрежем
        {
            newtitle = newtitle.substring(0, length_title) + '...';
        }

        document.title = newtitle + currentTitle; //Вот и все!
    }
}

kango.invokeAsync('kango.storage.getItem', 'plugins', function(value){

    var name = 'leprotitles';

    if( value !== null && value.hasOwnProperty( name ) && value[ name ] == 1 )
    {
        main();
    }
});
} catch(e) { console.warn('[Lepra+] Feature error in lepro_titles.js:',e); } })();


/* feature: preview.js */
(function(){
  const KEY='preview';
  const TEXTAREA_SELECTOR='#js-new_post_body, textarea.i-form_textarea, textarea.i-form_text_input';
  function findToolbar(textarea){
    const form=textarea.closest('form');
    const knownId=textarea.id==='js-new_post_body'?'js-new_post_body_wysiwyg':null;
    const knownInbox=location.href.includes('/write')?'js-new_inbox_wysiwyg':null;
    for(const id of [knownId,knownInbox,'js-new_post_body_wysiwyg','js-new_inbox_wysiwyg']){
      if(!id) continue;
      const el=document.getElementById(id);
      if(el && (!form || form.contains(el) || id==='js-new_post_body_wysiwyg')) return el;
    }
    if(form){ const el=form.querySelector('.b-textarea_editor'); if(el) return el; }
    let p=textarea.parentElement, depth=0;
    while(p && depth<5){ const el=p.querySelector('.b-textarea_editor'); if(el) return el; p=p.parentElement; depth++; }
    return null;
  }
  function init(root){
    const fields=[];
    if(root && root.nodeType===1 && root.matches && root.matches(TEXTAREA_SELECTOR)) fields.push(root);
    if(root && root.querySelectorAll) fields.push(...root.querySelectorAll(TEXTAREA_SELECTOR));
    for(const textarea of fields){
      if(textarea.dataset.lpmPreviewReady) continue;
      const toolbar=findToolbar(textarea); if(!toolbar) continue;
      textarea.dataset.lpmPreviewReady='1';
      const button=document.createElement('a');
      button.href='#'; button.className='b-textarea_editor_button b-textarea_editor_link textarea_preview';
      button.style.paddingLeft='20px'; button.textContent='Предпросмотр';
      const preview=document.createElement('div'); preview.className='lp_preview';
      preview.style.cssText='display:none;margin-top:20px;max-height:400px;overflow:auto;';
      const host=toolbar.parentElement || textarea.parentElement;
      if(host && host.parentElement) host.parentElement.insertBefore(preview,host.nextSibling);
      else textarea.insertAdjacentElement('afterend',preview);
      toolbar.appendChild(button);
      button.addEventListener('click',e=>{
        e.preventDefault(); e.stopPropagation();
        const value=(textarea.value||'').replace(/<irony>/g,'<span class="irony">').replace(/<\/irony>/g,'</span>').replace(/\n/g,'<br />');
        preview.innerHTML=value;
        preview.style.display=preview.style.display==='none'?'block':'none';
      });
    }
  }
  chrome.storage.local.get('plugins').then(data=>{
    if(!(data.plugins && data.plugins[KEY])) return;
    init(document);
    const observer=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)init(n)})));
    observer.observe(document.documentElement,{subtree:true,childList:true});
    document.addEventListener('click',e=>{if(e.target.closest('.c_answer')) setTimeout(()=>init(document),0);},true);
  });
})();

/* feature: user_numbers.js */
(function(){
  const KEY='usernumber';
  function makeNumbers(root){
    const comments=[];
    if(root && root.nodeType===1 && root.matches && root.matches('.ddi')) comments.push(root);
    if(root && root.querySelectorAll) comments.push(...root.querySelectorAll('.ddi'));
    for(const comment of comments){
      const user=comment.querySelector('.c_user');
      const date=comment.querySelector('.js-date');
      if(!user || !date) continue;
      const id=user.getAttribute('data-user_id') || user.dataset.user_id;
      if(!id) continue;
      let number=comment.querySelector('.user_number');
      if(!number){ number=document.createElement('span'); number.className='user_number'; date.parentNode.insertBefore(number,date); }
      number.textContent=' ['+id+'] ';
    }
  }
  chrome.storage.local.get('plugins').then(data=>{
    if(!(data.plugins && data.plugins[KEY])) return;
    makeNumbers(document);
    const observer=new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)makeNumbers(n)})));
    observer.observe(document.documentElement,{subtree:true,childList:true});
  });
})();


