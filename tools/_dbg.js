const fs=require('fs');
const idx=fs.readFileSync('index.html','utf8');
const re=/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
let m,blocks=[];
while((m=re.exec(idx)))blocks.push(m[1]);
const app=blocks[1];
try{ new Function(app); console.log('APP_BLOCK_OK'); }catch(e){ console.log('APP_BLOCK_ERR',e.message); }
const a=app.indexOf('function renderTasks(');
const b=app.indexOf('function setTasksTab');
const seg=app.slice(a,b);
console.log('=== seg ===');
console.log(seg);
console.log('=== end seg ===');
try{ new Function(seg); console.log('SEG_OK'); }catch(e){ console.log('SEG_ERR',e.message); }
