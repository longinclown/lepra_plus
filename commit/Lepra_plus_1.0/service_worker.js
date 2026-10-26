chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== 'LEPRO_XHR') return;
  (async () => {
    try {
      const d = message.details || {};
      const response = await fetch(d.url, {method:d.method || 'GET', credentials:'include', headers:{'Accept': d.contentType === 'json' ? 'application/json, text/plain, */*' : '*/*'}});
      const text = await response.text();
      let parsed = text;
      try { parsed = text ? JSON.parse(text) : null; } catch (_) {}
      sendResponse({status:response.status,response:parsed});
    } catch (e) { sendResponse({status:0,response:null,error:String(e)}); }
  })();
  return true;
});
