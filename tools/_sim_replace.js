const fs=require('fs');
let s=fs.readFileSync('index.html','utf8');
const before=(s.match(/isOwner\(\)/g)||[]).length;
const DEF="function uiOwner(){return (typeof isOwner!=='function'?false:isOwner())&&!isSim();}";
if(s.indexOf(DEF)<0){console.error('DEF not found — abort');process.exit(1);}
const MARK='@@UIOWNER_DEF@@';
s=s.replace(DEF,MARK);
s=s.split('isOwner()').join('uiOwner()');
s=s.replace(MARK,DEF);
fs.writeFileSync('index.html',s);
const after=(fs.readFileSync('index.html','utf8').match(/isOwner\(\)/g)||[]).length;
console.log('before:',before,'after:',after);
