const fs = require('fs');

try {
  let content = fs.readFileSync('volantinipro-final.jsx', 'utf8');

  // Let's replace the faulty string with the corrected one
  const searchStr = 'fontSize:14,fontWeight:700}})]})]},_jsxs("div",{id:"section-periodo"';
  const replaceStr = 'fontSize:14,fontWeight:700}})]})]}),_jsxs("div",{id:"section-periodo"';

  if (content.includes(searchStr)) {
    content = content.replace(searchStr, replaceStr);
    fs.writeFileSync('volantinipro-final.jsx', content);
    console.log('Patch 7 applied');
  } else {
    console.log('Search string not found!');
  }
} catch (e) {
  console.error("Error:", e);
}
