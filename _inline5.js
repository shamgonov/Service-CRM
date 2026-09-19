
const APP_VERSION='2.4.1';
function updNote(v){return (v.text&&v.text.length)?v.text:('Плановое обновление №'+v.deploy+' от '+v.dt);}
function updStrip(on){document.getElementById('updStrip').style.display=on?'block':'none';document.body.style.paddingTop=on?'38px':'0';}
function updOpenModal(){var v=window.__updCur;if(!v)return;
 document.getElementById('updMTitle').textContent='Что нового? v'+v.version;
 document.getElementById('updMText').textContent='Обновление №'+v.deploy+' от '+v.dt+'\n\n'+updNote(v);
 document.getElementById('updMBtns').style.display='flex';
 document.getElementById('updMOk').style.display='none';
 document.getElementById('updOverlay').style.display='flex';}
function updCloseModal(){document.getElementById('updOverlay').style.display='none';}
(function(){
 document.getElementById('updNow').onclick=function(){var v=window.__updCur;if(v)localStorage.setItem('crm_ack',v.deploy);
  if('serviceWorker' in navigator){navigator.serviceWorker.getRegistration().then(function(r){if(r)r.update()});}
  setTimeout(function(){location.reload()},1200);};
 document.getElementById('updLate').onclick=function(){updCloseModal()};
 document.getElementById('updMOk').onclick=function(){updCloseModal()};
 document.getElementById('updOverlay').onclick=function(e){if(e.target===this)updCloseModal()};
 function check(){fetch('version.json?'+Date.now(),{cache:'no-store'}).then(function(r){return r.json()}).then(function(v){
  var ack=+(localStorage.getItem('crm_ack')||0), inf=+(localStorage.getItem('crm_info')||0);
  if((v.deploy||0)>ack){window.__updCur=v;updStrip(true);}
  else{updStrip(false);
   if((v.deploy||0)>inf){localStorage.setItem('crm_info',v.deploy);window.__updCur=v;
    document.getElementById('updMTitle').textContent='Что нового? v'+v.version;
    document.getElementById('updMText').textContent='Обновление №'+v.deploy+' от '+v.dt+'\n\n'+updNote(v);
    document.getElementById('updMBtns').style.display='none';
    document.getElementById('updMOk').style.display='block';
    document.getElementById('updOverlay').style.display='flex';}}
 }).catch(function(){});}
 if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js');
 check();setInterval(check,30000);
})();
