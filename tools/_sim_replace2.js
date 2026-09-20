const fs=require('fs');
let s=fs.readFileSync('index.html','utf8');
const b1=(s.match(/o\.worker===state\.user/g)||[]).length;
const b2=(s.match(/o\.worker!==state\.user/g)||[]).length;
s=s.split('o.worker===state.user').join('isMeName(o.worker)');
s=s.split('o.worker!==state.user').join('!isMeName(o.worker)');
fs.writeFileSync('index.html',s);
const chk=fs.readFileSync('index.html','utf8');
console.log('=== :',b1,'-> осталось:',(chk.match(/o\.worker===state\.user/g)||[]).length,
'| !==:',b2,'-> осталось:',(chk.match(/o\.worker!==state\.user/g)||[]).length);