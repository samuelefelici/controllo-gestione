const fs = require('fs');
const pdfParse = require('pdf-parse');

function parseEU(s) {
  return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
}

function parseDateFn(d) {
  const p = d.split('/');
  if (p.length !== 3) return d;
  return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
}

const PAGE_HEADER_RE = /\nPag\.\d+di\d+\n[\s\S]*?Saldo Movimento[\s\S]*?Descrizione Operazione[\s\S]*?\d{1,2}\s+\w+\s+\d{4}\s+\d{2}\.\d{2}\n/;

function extractTx(raw, isFirst) {
  let content = raw.replace(PAGE_HEADER_RE, '\n');
  if (isFirst) {
    const m = content.match(/EUR\s*([\d.,]+)\n/);
    if (!m) return null;
    const idx = content.indexOf(m[0]);
    content = '\n' + content.substring(idx + 3);
  }
  const lines = content.split('\n').filter(l => l.trim() !== '');
  if (lines.length < 3) return null;
  const balance = parseEU(lines[0].trim());
  const amount = parseEU(lines[1].trim());
  const description = lines.slice(2).join(' ').trim();
  if (isNaN(amount)) return null;
  return { balance, amount, description };
}

const buf = fs.readFileSync('documenti/GEN 26 ListaMovimenti .pdf');
pdfParse(buf).then(d => {
  const parts = d.text.split(/(\d{2}\/\d{2}\/\d{4})(\d{2}\/\d{2}\/\d{4})EUR/);
  const txs = [];
  
  // First tx from block 0
  if (parts.length >= 4) {
    const tx = extractTx(parts[0], true);
    if (tx) {
      txs.push({ date: parseDateFn(parts[1]), val: parseDateFn(parts[2]), ...tx });
    }
  }
  
  // Remaining
  for (let i = 3; i + 2 < parts.length; i += 3) {
    const tx = extractTx(parts[i], false);
    if (tx) {
      txs.push({ date: parseDateFn(parts[i+1]), val: parseDateFn(parts[i+2]), ...tx });
    }
  }
  
  console.log('Transazioni totali:', txs.length);
  console.log('');
  
  // Prime 10
  console.log('=== PRIME 10 ===');
  txs.slice(0, 10).forEach((t, i) => {
    console.log(`${i+1} | ${t.date} | ${t.amount.toFixed(2).padStart(10)} | saldo ${t.balance.toFixed(2).padStart(10)} | ${t.description.substring(0, 80)}`);
  });
  
  console.log('');
  console.log('=== ULTIME 5 ===');
  txs.slice(-5).forEach((t, i) => {
    const idx = txs.length - 4 + i;
    console.log(`${idx} | ${t.date} | ${t.amount.toFixed(2).padStart(10)} | saldo ${t.balance.toFixed(2).padStart(10)} | ${t.description.substring(0, 80)}`);
  });
  
  // Totali
  const totIn = txs.filter(t => t.amount > 0).reduce((s,t) => s + t.amount, 0);
  const totOut = txs.filter(t => t.amount < 0).reduce((s,t) => s + t.amount, 0);
  console.log('');
  console.log('Tot entrate:', totIn.toFixed(2));
  console.log('Tot uscite:', totOut.toFixed(2));
  console.log('Netto:', (totIn + totOut).toFixed(2));
  console.log('Primo saldo (piu vecchio):', txs[txs.length-1]?.balance.toFixed(2));
  console.log('Ultimo saldo (piu recente):', txs[0]?.balance.toFixed(2));
});
