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
