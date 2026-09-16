const fs=require('fs');
const s=fs.readFileSync('tools/_shop_test.js','utf8');
for(const n of ['1)','2)','3)','4)','5)','6)','7)','8)','9)','10)','11)','12)','13)','14)','15)','16)','17)'])
  console.log("t('"+n+": "+s.includes("t('"+n));
