const fs = require('fs');
const c = fs.readFileSync('D:/cloaude volantini/volantinipro/volantinipro-final.jsx', 'utf8');

const regex = /dangerouslySetInnerHTML:\{__html:([\s\S]*?)\}\}/;
const match = c.match(regex);
if (match) {
  fs.writeFileSync('extracted-styles.txt', match[1]);
  console.log('Styles extracted to extracted-styles.txt');
} else {
  console.log('Not found');
}
