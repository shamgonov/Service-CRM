
// === BOOT-GUARD: самовосстановление при битом кэше SW ===
// Фатальная ошибка на этапе загрузки (до старта SDK) + флаг crm_recovered отсутствует
// → чистим ВСЕ кэши и перезагружаемся один раз. Вторая попытка не делается.
(function(){
 var RECOVER_FLAG='crm_recovered';
 function showFatal(){
  try{
   document.getElementById('app').innerHTML='<div class="card" style="text-align:center;padding:28px 16px;margin-top:40px">'+
    '<div style="font-size:40px">📡</div><div style="font-weight:700;margin:10px 0">Ошибка загрузки</div>'+
    '<div class="muted">Проверьте интернет и перезагрузите страницу.<br>Если не помогает — обновите приложение или обратитесь к владельцу.</div>'+
    '<button class="btn btn-blue" style="margin-top:12px" onclick="location.reload()">🔄 Перезагрузить</button></div>';
  }catch(e){}
 }
 window.onerror=function(msg,src,line,col,err){
  if(sessionStorage.getItem(RECOVER_FLAG)==='1'){ showFatal(); return false; }
  // ошибки сети (Failed to fetch, NetworkError, ERR_INTERNET) — штатный офлайн, НЕ фатальны
  var m=String(msg||'');
  if(/Failed to fetch|NetworkError|network|ERR_INTERNET|ERR_NETWORK|ERR_CONNECTION|The internet connection|Load failed/i.test(m))return false;
  // считаем фатальной ошибку в основном скрипте приложения (не в сторонних SDK)
  var fatal=!src||src.indexOf('firebase')<0;
  if(!fatal)return false;
  sessionStorage.setItem(RECOVER_FLAG,'1');
  if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
   navigator.serviceWorker.getRegistrations().then(function(regs){
    regs.forEach(function(r){ try{r.unregister();}catch(e){} });
   }).catch(function(){});
  }
  if(window.caches&&caches.keys){
   caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){return caches.delete(k);}));
   }).then(function(){ location.reload(); }).catch(function(){ location.reload(); });
  } else location.reload();
  return true;
 };
})();
