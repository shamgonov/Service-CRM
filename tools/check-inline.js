// Гейт деплоя: синтаксическая проверка ВСЕХ инлайн-<script> в index.html.
// Возврат 1 (деплой запрещён), если хоть один блок не парсится.
const fs=require('fs'),vm=require('vm');
const h=fs.readFileSync('index.html','utf8');
const re=/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi;
let m,i=0,fail=0;
while((m=re.exec(h))){ i++;
 try{ new vm.Script(m[1],{filename:'inline#'+i}); console.log('inline#'+i+': OK'); }
 catch(e){ fail++; console.log('inline#'+i+': FAIL — '+e.message); }
}
console.log('INLINE_OK '+i);
process.exit(fail?1:0);
