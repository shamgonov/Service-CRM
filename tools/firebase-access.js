
// CRM-ERRCATCH
window.addEventListener('error', function(e){
 var d=document.createElement('div');
 d.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#dc2626;color:#fff;padding:8px;font:12px monospace;z-index:999';
 d.textContent='JS ERROR: '+e.message+' (line '+e.lineno+')';
 document.body.appendChild(d);
});
setTimeout(function(){
 if(window.__accessMode && !state.role){
  document.getElementById('app').innerHTML=renderAccess();
  document.getElementById('nav').style.display='none';
 }
},2500);