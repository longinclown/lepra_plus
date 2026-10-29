(function(){
  const SITE = location.origin;

  function getCsrfToken(){
    const selectors = [
      'input[name="csrf_token"]', 'input[name="csrf-token"]',
      'meta[name="csrf-token"]', 'meta[name="csrf_token"]',
      'meta[name="_csrf"]', '[data-csrf-token]',
      'form input[type="hidden"][name*="csrf"]'
    ];
    const valid = v => {
      if (typeof v !== 'string') return '';
      v = v.trim();
      return v.length >= 12 && !/[<>\s]/.test(v) ? v : '';
    };
    for (const sel of selectors) {
      for (const el of document.querySelectorAll(sel)) {
        const v = valid(el.value || el.content || el.getAttribute('data-csrf-token') || el.getAttribute('value'));
        if (v) return v;
      }
    }

    // Some site builds keep the token in an inline script or a JS bootstrap object,
    // rather than in a meta/input element.
    const sources = [];
    try { sources.push(document.documentElement.innerHTML); } catch (_) {}
    try { sources.push(document.cookie); } catch (_) {}
    try { for (const k of Object.keys(window)) {
      if (/csrf|token/i.test(k)) {
        try { const v = window[k]; if (typeof v === 'string') sources.push(`${k}=${v}`);
          else if (v && typeof v === 'object') sources.push(JSON.stringify(v)); } catch (_) {}
      }
    }} catch (_) {}
    for (const store of [window.localStorage, window.sessionStorage]) {
      try { for (let i=0;i<store.length;i++) {
        const k=store.key(i), v=store.getItem(k);
        if (/csrf|token/i.test(k) || /csrf_token/i.test(v || '')) sources.push(`${k}=${v}`);
      }} catch (_) {}
    }
    const patterns = [
      /["']csrf_token["']\s*[:=]\s*["']([^"']{12,})["']/i,
      /["']csrf[-_]?token["']\s*[:=]\s*["']([^"']{12,})["']/i,
      /\bcsrf_token=([^&"'\s;]+)/i,
      /\bcsrfToken\s*[:=]\s*["']([^"']{12,})["']/i,
      /\bCSRF_TOKEN\s*[:=]\s*["']([^"']{12,})["']/i
    ];
    for (const source of sources) {
      if (!source) continue;
      for (const re of patterns) {
        const m = source.match(re);
        if (m) {
          let value = m[1];
          try { value = decodeURIComponent(value); } catch (_) {}
          const token = valid(value);
          if (token) return token;
        }
      }
    }
    return '';
  }

  function getLogin(){
    // Never infer the account from the current URL: /users/<login> may be
    // another person's profile. The service worker first reads globals.user.login
    // in the page's MAIN world and passes it to this content script.
    // Fall back only to explicit current-account markers in the DOM.
    const selfSelectors = [
      '[data-current-user-login]', '[data-current_user_login]',
      '[data-self-login]', '[data-user-login][data-self="true"]'
    ];
    for (const sel of selfSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const v = el.getAttribute('data-current-user-login') || el.getAttribute('data-current_user_login') || el.getAttribute('data-self-login') || el.getAttribute('data-user-login');
        if (v) return v;
      }
    }

    // On non-profile pages only accept an explicit account/menu link, not the first
    // arbitrary /users/<login>/ link in the page body.
    const candidates = [];
    document.querySelectorAll('a[href]').forEach(a => {
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/users\/([^/?#]+)\/?$/);
      if (m && a.closest('header, nav, .user-menu, .account-menu, #user-menu')) {
        candidates.push(decodeURIComponent(m[1]));
      }
    });
    const uniq = [...new Set(candidates)].filter(Boolean);
    return uniq[0] || '';
  }

  async function postJson(path, params){
    const token = getCsrfToken();
    if (!token) throw new Error('Не удалось получить данные. Откройте leprosorium.ru, обновите страницу и повторите.');
    const body = new URLSearchParams({...params, csrf_token: token});
    const r = await fetch(path, {
      method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8', 'Accept':'application/json, text/plain, */*'},
      body, cache: 'no-store'
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    try { return text ? JSON.parse(text) : null; }
    catch (_) { return text; }
  }

  function readUnreadCount(result, label){
    const counts = result && typeof result === 'object' ? result.unread_count : null;
    if (!Array.isArray(counts) || counts.length < 2 ||
        !Number.isFinite(Number(counts[0])) || !Number.isFinite(Number(counts[1]))) {
      throw new Error(`${label}: сервер не вернул корректный unread_count.`);
    }
    // The site's script.js defines unread_count[0] as unread posts and [1] as unread comments.
    return {posts: Number(counts[0]), comments: Number(counts[1])};
  }

  async function fetchCounter(type){
    // Some installations expose only interest/unread_count; inbox/unread_count
    // may return 404. The corresponding /moar/ response also contains unread_count.
    const endpoint = `/ajax/${type}/unread_count/`;
    try {
      return await postJson(endpoint, {});
    } catch (e) {
      if (!String(e?.message || e).includes('HTTP 404')) throw e;
      const params = type === 'interest'
        ? {sort:'0', period:'30', unread:'1'}
        : {sort:'3', unread:'1', filter_owner:'all'};
      return await postJson(`/ajax/${type}/moar/`, params);
    }
  }

  async function fetchPanel(selfLogin){
    const [interestCounters, inboxCounters] = await Promise.all([
      fetchCounter('interest'), fetchCounter('inbox')
    ]);
    const my = readUnreadCount(interestCounters, 'Мои вещи');
    const inbox = readUnreadCount(inboxCounters, 'Инбокс');
    const myPosts = my.posts;
    const myComments = my.comments;
    const inboxPosts = inbox.posts;
    const inboxComments = inbox.comments;

    const login = (typeof selfLogin === 'string' && selfLogin.trim()) ? selfLogin.trim() : getLogin();
    let profile = null;
    if (login) {
      // The site's own postAjax() sends these two headers from Cookie.read('uid'/'sid').
      // Read the same non-HttpOnly cookies instead of hard-coding session identifiers.
      const readCookie = name => {
        const prefix = name + '=';
        for (const part of document.cookie.split(';')) {
          const item = part.trim();
          if (item.startsWith(prefix)) {
            try { return decodeURIComponent(item.slice(prefix.length)); }
            catch (_) { return item.slice(prefix.length); }
          }
        }
        return '';
      };
      const uid = readCookie('uid');
      const sid = readCookie('sid');
      const headers = {'Accept':'application/json'};
      if (uid) headers['X-Futuware-UID'] = uid;
      if (sid) headers['X-Futuware-SID'] = sid;
      const r = await fetch(`/api/users/${encodeURIComponent(login)}/info/?page=1`, {credentials:'same-origin', cache:'no-store', headers});
      const t = await r.text();
      if (!r.ok) throw new Error(`Профиль: HTTP ${r.status}`);
      try { profile = JSON.parse(t); } catch (_) { throw new Error('API профиля вернул не JSON.'); }
    }
    if (!profile) throw new Error('Не удалось определить имя пользователя. Откройте любую страницу leprosorium.ru и повторите.');
    const karma = profile?.user_info?.karma;
    if (karma === undefined) throw new Error('API профиля не вернул карму.');

    return {login: profile?.user_info?.login || login, karma, rating: profile?.user_info?.documents_rating ?? null,
      myunreadposts: myPosts, myunreadcomms: myComments,
      inboxunreadposts: inboxPosts, inboxunreadcomms: inboxComments};
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse)=>{
    if (msg?.type !== 'LEPRA_FETCH_PANEL_FROM_PAGE') return;
    fetchPanel(msg.selfLogin).then(data=>sendResponse({ok:true,data})).catch(e=>sendResponse({ok:false,error:String(e?.message||e)}));
    return true;
  });
})();
