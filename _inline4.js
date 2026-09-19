
(function(){
 var deferred=null;
 var isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
 var standalone=window.matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();deferred=e;tick();});
 window.addEventListener('appinstalled',function(){document.getElementById('crmInstallBtn').style.display='none';});
 function tick(){
  var btn=document.getElementById('crmInstallBtn');
  var onLogin=(typeof state!=='undefined'&&state.role===null);
  btn.style.display=(!standalone&&onLogin&&(deferred||isIOS))?'block':'none';
 }
 document.getElementById('crmInstallBtn').onclick=function(){
  if(deferred){deferred.prompt();deferred.userChoice.then(function(){deferred=null;tick();});}
  else if(isIOS){document.getElementById('crmIosHint').style.display='flex';}
 };
 setInterval(tick,1500);
})();
